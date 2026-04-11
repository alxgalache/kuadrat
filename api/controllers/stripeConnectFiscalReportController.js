/**
 * Stripe Connect Fiscal Report Controller — Change #4: stripe-connect-fiscal-report
 *
 * Three read-only endpoints used by the admin to hand off fiscal data to the
 * gestoría:
 *
 *   GET /api/admin/payouts/:withdrawalId/fiscal-export  → single payout (csv|json)
 *   GET /api/admin/payouts/fiscal-export                → range (csv|json)
 *   GET /api/admin/payouts/summary                      → totals by regime/month (json)
 *
 * No writes, no Stripe calls. The only side-effect is an audit log line per
 * export (pino).
 */
const config = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const {
  buildPayoutReport,
  buildRangeReport,
  formatAsCsv,
  formatAsJson,
} = require('../utils/fiscalReportFormatter');

// ─── Internal helpers ──────────────────────────────────────────────────

/**
 * Block the response with a 503 if any required BUSINESS_* env var is empty.
 * Mutates no state.
 */
function assertBusinessOrThrow() {
  const missing = config.assertBusinessConfigComplete();
  if (missing.length > 0) {
    throw new ApiError(
      503,
      `Datos fiscales del platform incompletos. Faltan: ${missing.join(', ')}`
    );
  }
}

function adminEmailFrom(req) {
  return req.user?.email || null;
}

function adminIdFrom(req) {
  return req.user?.id || null;
}

function filenameForSingle(withdrawalId, ext) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `payout_${withdrawalId}_${today}.${ext}`;
}

function filenameForRange(from, to, ext) {
  return `payouts_${from}_${to}.${ext}`;
}

/**
 * Set the download headers and send the body. The body is UTF-8 for CSV
 * (BOM already prefixed by the formatter) and application/json for JSON.
 */
function sendDownload(res, { body, filename, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(body);
}

// ─── HTTP handlers ─────────────────────────────────────────────────────

/**
 * GET /api/admin/payouts/:withdrawalId/fiscal-export
 */
async function exportSinglePayout(req, res, next) {
  try {
    const withdrawalId = parseInt(req.params.withdrawalId, 10);
    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      throw new ApiError(400, 'withdrawalId inválido');
    }
    const format = req.query.format || 'csv';

    assertBusinessOrThrow();

    let report;
    try {
      report = await buildPayoutReport(withdrawalId, {
        adminEmail: adminEmailFrom(req),
      });
    } catch (err) {
      if (err && err.code === 'PAYOUT_NOT_FOUND') {
        throw new ApiError(404, 'Payout no encontrado');
      }
      if (err && err.code === 'PAYOUT_NOT_EXPORTABLE') {
        const status = err.status || 'desconocido';
        if (status === 'failed') {
          throw new ApiError(404, 'El payout falló y no tiene información fiscal');
        }
        throw new ApiError(409, 'El payout aún no ha sido ejecutado');
      }
      if (err && err.code === 'SELLER_NOT_FOUND') {
        throw new ApiError(500, 'Artista del payout no encontrado');
      }
      throw err;
    }

    logger.info(
      {
        adminId: adminIdFrom(req),
        adminEmail: adminEmailFrom(req),
        withdrawalId,
        format,
      },
      '[stripeConnectFiscalReport] Single payout export'
    );

    if (format === 'csv') {
      const csv = formatAsCsv(report, { kind: 'single' });
      return sendDownload(res, {
        body: csv,
        filename: filenameForSingle(withdrawalId, 'csv'),
        contentType: 'text/csv; charset=utf-8',
      });
    }
    const json = formatAsJson(report);
    return sendDownload(res, {
      body: JSON.stringify(json, null, 2),
      filename: filenameForSingle(withdrawalId, 'json'),
      contentType: 'application/json; charset=utf-8',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/payouts/fiscal-export
 */
async function exportRange(req, res, next) {
  try {
    const { from, to, format = 'csv', vat_regime: vatRegime, sellerId } = req.query;

    assertBusinessOrThrow();

    const report = await buildRangeReport({
      from,
      to,
      vatRegime,
      sellerId,
      adminEmail: adminEmailFrom(req),
    });

    logger.info(
      {
        adminId: adminIdFrom(req),
        adminEmail: adminEmailFrom(req),
        from,
        to,
        vatRegime: vatRegime || null,
        sellerId: sellerId || null,
        format,
        payoutCount: report.payouts.length,
      },
      '[stripeConnectFiscalReport] Range export'
    );

    if (format === 'csv') {
      const csv = formatAsCsv(report, { kind: 'range' });
      return sendDownload(res, {
        body: csv,
        filename: filenameForRange(from, to, 'csv'),
        contentType: 'text/csv; charset=utf-8',
      });
    }
    const json = formatAsJson(report);
    return sendDownload(res, {
      body: JSON.stringify(json, null, 2),
      filename: filenameForRange(from, to, 'json'),
      contentType: 'application/json; charset=utf-8',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/payouts/summary
 * JSON-only. Returns `totals_by_regime`, `totals_by_month`, and `payout_count`,
 * built from the same range builder but without the full payout list.
 */
async function getSummary(req, res, next) {
  try {
    const { from, to, vat_regime: vatRegime, sellerId } = req.query;

    assertBusinessOrThrow();

    const report = await buildRangeReport({
      from,
      to,
      vatRegime,
      sellerId,
      adminEmail: adminEmailFrom(req),
    });

    logger.info(
      {
        adminId: adminIdFrom(req),
        adminEmail: adminEmailFrom(req),
        from,
        to,
        vatRegime: vatRegime || null,
        sellerId: sellerId || null,
        payoutCount: report.payouts.length,
      },
      '[stripeConnectFiscalReport] Summary'
    );

    sendSuccess(res, {
      range: report.range,
      filters: report.filters,
      totals_by_regime: report.totals_by_regime,
      totals_by_month: report.totals_by_month,
      payout_count: report.payouts.length,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  exportSinglePayout,
  exportRange,
  getSummary,
};
