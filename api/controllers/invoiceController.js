/**
 * Invoice controller — admin-only endpoints for PDF generation.
 *
 * Each handler validates params, delegates to invoiceService, and
 * streams the resulting PDFKit document directly to the response.
 */

const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const invoiceService = require('../services/invoiceService');

// ── Buyer invoice (REBU or Standard) by order ────────────

async function getBuyerInvoice(req, res, next) {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId || isNaN(orderId)) {
      throw new ApiError(400, 'ID de pedido inválido');
    }

    const type = req.query.type;
    if (!['rebu', 'standard'].includes(type)) {
      throw new ApiError(400, 'Parámetro type debe ser "rebu" o "standard"');
    }

    const doc =
      type === 'rebu'
        ? await invoiceService.generateBuyerRebuInvoice(orderId)
        : await invoiceService.generateBuyerStandardInvoice(orderId);

    const filename = `factura-pedido-${orderId}-${type}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    next(error);
  }
}

// ── Event attendee invoice ───────────────────────────────

async function getEventAttendeeInvoice(req, res, next) {
  try {
    const attendeeId = req.params.attendeeId;
    if (!attendeeId) {
      throw new ApiError(400, 'ID de asistente inválido');
    }

    const doc = await invoiceService.generateEventAttendeeInvoice(attendeeId);

    const filename = `factura-evento-${attendeeId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    next(error);
  }
}

// ── Commission invoice (standard_vat withdrawals) ────────

async function getCommissionInvoice(req, res, next) {
  try {
    const withdrawalId = Number(req.params.withdrawalId);
    if (!withdrawalId || isNaN(withdrawalId)) {
      throw new ApiError(400, 'ID de pago inválido');
    }

    const doc = await invoiceService.generateCommissionInvoice(withdrawalId);

    const filename = `factura-comision-${withdrawalId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    next(error);
  }
}

// ── Settlement note (REBU withdrawals) ───────────────────

async function getSettlementNote(req, res, next) {
  try {
    const withdrawalId = Number(req.params.withdrawalId);
    if (!withdrawalId || isNaN(withdrawalId)) {
      throw new ApiError(400, 'ID de pago inválido');
    }

    const doc = await invoiceService.generateSettlementNote(withdrawalId);

    const filename = `nota-liquidacion-${withdrawalId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBuyerInvoice,
  getEventAttendeeInvoice,
  getCommissionInvoice,
  getSettlementNote,
};
