/**
 * Fiscal report formatter — Change #4: stripe-connect-fiscal-report
 *
 * Loads withdrawals from the database and transforms them into the canonical
 * `PayoutReport` objects documented in `design.md §2` + CSV/JSON output for
 * the gestoría. Pure read path — no writes, no Stripe calls.
 *
 * Public API:
 *   - buildPayoutReport(withdrawalId, { adminEmail }) → PayoutReport
 *   - buildRangeReport({ from, to, vat_regime?, sellerId?, adminEmail }) → RangeReport
 *   - inferInvoicingMode(user) → { mode, explanation }
 *   - formatAsCsv(report, { kind }) → string (with BOM)
 *   - formatAsJson(report) → object (caller stringifies)
 *
 * Internal helpers (exported for unit tests):
 *   - csvEscape, formatMoneyEs, formatDateEs, formatDateTimeEs
 */
const { db } = require('../config/database');
const config = require('../config/env');
const { describeBatch } = require('./itemDescription');

// ─── Constants ─────────────────────────────────────────────────────────

const CSV_BOM = '\uFEFF';

const VAT_REGIME_LABEL_ES = {
  art_rebu: 'REBU (Arte)',
  standard_vat: 'IVA estándar 21%',
};

const OPERATION_TYPE = {
  art_rebu: 'REBU',
  standard_vat: 'IVA_estandar_21',
};

const ITEM_TYPE_LABEL_ES = {
  art_order_item: 'Arte',
  other_order_item: 'Otros',
  event_attendee: 'Evento',
};

const STATUS_LABEL_ES = {
  completed: 'completado',
  reversed: 'revertido',
};

const INVOICING_MODE_LABEL_ES = {
  autofactura: 'Autofactura',
  factura_recibida: 'Factura recibida',
  pending_agreement: 'Pendiente de acuerdo',
  error: 'Error (datos incompletos)',
};

// ─── Pure helpers ──────────────────────────────────────────────────────

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Format a number as Spanish locale money (comma decimal, 2 fixed digits).
 * No thousand separators — Excel applies grouping from its own locale.
 *
 * @example formatMoneyEs(210.5) // '210,50'
 * @example formatMoneyEs(-3.14) // '-3,14'
 */
function formatMoneyEs(n) {
  const v = round2(n);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return sign + abs.toFixed(2).replace('.', ',');
}

/**
 * Convert SQLite-stored timestamps (`'YYYY-MM-DD HH:MM:SS'`, no TZ) to a
 * parseable ISO string. Pass-through for anything already ISO.
 */
function normalizeIso(input) {
  if (!input) return null;
  if (typeof input !== 'string') return input;
  // SQLite DATETIME columns come out as 'YYYY-MM-DD HH:MM:SS' — treat as UTC.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)) {
    return input.replace(' ', 'T') + 'Z';
  }
  return input;
}

/**
 * Format a timestamp as `DD/MM/YYYY` in Europe/Madrid.
 *
 * @example formatDateEs('2026-04-10T09:15:00Z') // '10/04/2026'
 */
function formatDateEs(input) {
  if (!input) return '';
  const iso = normalizeIso(input);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(input);
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return fmt.format(d);
}

/**
 * Format a timestamp as `DD/MM/YYYY HH:MM` in Europe/Madrid.
 */
function formatDateTimeEs(input) {
  if (!input) return '';
  const iso = normalizeIso(input);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(input);
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // `es-ES` renders e.g. "10/04/2026, 09:15" — drop the comma.
  return fmt.format(d).replace(',', '');
}

/**
 * Escape a single field for a CSV with `;` as separator (RFC 4180-ish).
 * - If the field contains `;`, `"`, newline, or CR, wrap in double quotes.
 * - Double quotes inside the field are doubled.
 * - null/undefined → empty string.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(';');
}

// ─── Business rules ────────────────────────────────────────────────────

/**
 * Derive the invoicing mode for a given seller.
 * See design.md §6.
 *
 * @param {object} user  Seller row from `users`.
 * @returns {{ mode: 'autofactura'|'factura_recibida'|'pending_agreement'|'error', explanation: string }}
 */
function inferInvoicingMode(user) {
  if (!user || !user.tax_status) {
    return {
      mode: 'error',
      explanation: 'Datos fiscales incompletos para el artista.',
    };
  }
  if (user.tax_status === 'particular') {
    if (user.autofactura_agreement_signed_at) {
      return {
        mode: 'autofactura',
        explanation:
          '140d emite autofactura por la comisión en nombre del artista (art. 5 Reglamento de Facturación).',
      };
    }
    return {
      mode: 'pending_agreement',
      explanation:
        'Artista particular sin acuerdo de autofacturación firmado. Debe firmarse antes de declarar el trimestre.',
    };
  }
  if (user.tax_status === 'autonomo') {
    return {
      mode: 'factura_recibida',
      explanation:
        'El artista autónomo emite su propia factura a 140d por el importe de la comisión.',
    };
  }
  if (user.tax_status === 'sociedad') {
    return {
      mode: 'factura_recibida',
      explanation:
        'La sociedad artística emite factura a 140d por el importe de la comisión.',
    };
  }
  return {
    mode: 'error',
    explanation: `Estado fiscal desconocido: ${user.tax_status}.`,
  };
}

/**
 * Snapshot of the platform block, built from `config.business`.
 * Not validated here — the caller (controller) should call
 * `assertBusinessConfigComplete` first and return a 503 if anything is missing.
 */
function buildPlatformBlock() {
  return {
    name: config.business.name,
    legal_name: config.business.legalName,
    tax_id: config.business.taxId,
    address: {
      line1: config.business.address.line1,
      line2: config.business.address.line2,
      city: config.business.address.city,
      postal_code: config.business.address.postalCode,
      province: config.business.address.province,
      country: config.business.address.country,
    },
    email: config.business.email,
  };
}

/**
 * Map a user row to the `seller` block of the report.
 */
function buildSellerBlock(user) {
  return {
    user_id: Number(user.id),
    fiscal_full_name: user.fiscal_full_name || user.full_name || null,
    tax_status: user.tax_status || null,
    tax_id: user.tax_id || null,
    address: {
      line1: user.fiscal_address_line1 || null,
      line2: user.fiscal_address_line2 || null,
      city: user.fiscal_address_city || null,
      postal_code: user.fiscal_address_postal_code || null,
      province: user.fiscal_address_province || null,
      country: user.fiscal_address_country || 'ES',
    },
    irpf_retention_rate: user.irpf_retention_rate !== null && user.irpf_retention_rate !== undefined
      ? Number(user.irpf_retention_rate)
      : null,
    autofactura_agreement_signed_at: user.autofactura_agreement_signed_at || null,
    stripe_connect_account_id: user.stripe_connect_account_id || null,
  };
}

// ─── Data loaders ──────────────────────────────────────────────────────

async function loadWithdrawalById(withdrawalId) {
  const result = await db.execute({
    sql: `
      SELECT w.id, w.user_id, w.amount, w.status,
             w.vat_regime, w.taxable_base_total, w.vat_amount_total,
             w.stripe_transfer_id, w.stripe_transfer_group,
             w.executed_at, w.executed_by_admin_id,
             w.failure_reason, w.reversed_at, w.reversal_amount, w.reversal_reason,
             w.created_at,
             admin.email AS executed_by_admin_email
      FROM withdrawals w
      LEFT JOIN users admin ON w.executed_by_admin_id = admin.id
      WHERE w.id = ?
    `,
    args: [withdrawalId],
  });
  return result.rows[0] || null;
}

async function loadWithdrawalsInRange({ from, to, vatRegime, sellerId }) {
  const conditions = [
    `w.status IN ('completed', 'reversed')`,
    `w.executed_at IS NOT NULL`,
    `date(w.executed_at) >= date(?)`,
    `date(w.executed_at) <= date(?)`,
  ];
  const args = [from, to];
  if (vatRegime) {
    conditions.push('w.vat_regime = ?');
    args.push(vatRegime);
  }
  if (sellerId) {
    conditions.push('w.user_id = ?');
    args.push(Number(sellerId));
  }
  const result = await db.execute({
    sql: `
      SELECT w.id, w.user_id, w.amount, w.status,
             w.vat_regime, w.taxable_base_total, w.vat_amount_total,
             w.stripe_transfer_id, w.stripe_transfer_group,
             w.executed_at, w.executed_by_admin_id,
             w.failure_reason, w.reversed_at, w.reversal_amount, w.reversal_reason,
             w.created_at,
             admin.email AS executed_by_admin_email
      FROM withdrawals w
      LEFT JOIN users admin ON w.executed_by_admin_id = admin.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.executed_at ASC, w.id ASC
    `,
    args,
  });
  return result.rows;
}

async function loadWithdrawalItems(withdrawalIds) {
  if (!Array.isArray(withdrawalIds) || withdrawalIds.length === 0) return [];
  const placeholders = withdrawalIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT id, withdrawal_id, item_type, item_id,
             seller_earning, taxable_base, vat_rate, vat_amount, vat_regime
      FROM withdrawal_items
      WHERE withdrawal_id IN (${placeholders})
      ORDER BY withdrawal_id ASC, id ASC
    `,
    args: withdrawalIds,
  });
  return result.rows;
}

async function loadSellerUserById(userId) {
  const result = await db.execute({
    sql: `
      SELECT id, full_name, email,
             stripe_connect_account_id, tax_status, tax_id,
             fiscal_full_name,
             fiscal_address_line1, fiscal_address_line2,
             fiscal_address_city, fiscal_address_postal_code,
             fiscal_address_province, fiscal_address_country,
             irpf_retention_rate, autofactura_agreement_signed_at
      FROM users
      WHERE id = ?
    `,
    args: [userId],
  });
  return result.rows[0] || null;
}

async function loadSellerUsersByIds(userIds) {
  const map = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return map;
  const uniq = [...new Set(userIds.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  if (uniq.length === 0) return map;
  const placeholders = uniq.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT id, full_name, email,
             stripe_connect_account_id, tax_status, tax_id,
             fiscal_full_name,
             fiscal_address_line1, fiscal_address_line2,
             fiscal_address_city, fiscal_address_postal_code,
             fiscal_address_province, fiscal_address_country,
             irpf_retention_rate, autofactura_agreement_signed_at
      FROM users
      WHERE id IN (${placeholders})
    `,
    args: uniq,
  });
  for (const row of result.rows) {
    map.set(Number(row.id), row);
  }
  return map;
}

// ─── Report builders ───────────────────────────────────────────────────

/**
 * Assemble a single-payout report from already-loaded pieces. Exported as
 * `buildPayoutReportFromRows` for internal composition inside the range
 * builder (avoids re-querying the same data per payout).
 */
function assemblePayoutReport({ withdrawal, items, descMap, user, adminEmail }) {
  const vatRegime = withdrawal.vat_regime;
  const lines = items.map((it) => {
    const key = `${it.item_type}:${it.item_id}`;
    const desc = descMap.get(key) || {
      description: '(Item no encontrado)',
      buyer_reference: key,
    };
    const sellerEarning = round2(it.seller_earning);
    const taxableBase = round2(it.taxable_base);
    const vatAmount = round2(it.vat_amount);
    return {
      item_type: it.item_type,
      item_id: it.item_type === 'event_attendee' ? String(it.item_id) : Number(it.item_id),
      description: desc.description,
      buyer_reference: desc.buyer_reference,
      seller_earning: sellerEarning,
      taxable_base: taxableBase,
      vat_rate: Number(it.vat_rate) || 0,
      vat_amount: vatAmount,
      line_total: round2(taxableBase + vatAmount),
    };
  });

  const totals = lines.reduce(
    (acc, line) => {
      acc.seller_earning_total = round2(acc.seller_earning_total + line.seller_earning);
      acc.taxable_base_total = round2(acc.taxable_base_total + line.taxable_base);
      acc.vat_amount_total = round2(acc.vat_amount_total + line.vat_amount);
      return acc;
    },
    { seller_earning_total: 0, taxable_base_total: 0, vat_amount_total: 0 }
  );

  const transferredAmount = round2(withdrawal.amount);
  const reversalAmount = withdrawal.reversal_amount !== null && withdrawal.reversal_amount !== undefined
    ? round2(withdrawal.reversal_amount)
    : null;
  const netOfReversals = reversalAmount !== null
    ? round2(transferredAmount - reversalAmount)
    : transferredAmount;

  return {
    platform: buildPlatformBlock(),
    seller: buildSellerBlock(user),
    withdrawal: {
      id: Number(withdrawal.id),
      status: withdrawal.status,
      vat_regime: vatRegime,
      operation_type: OPERATION_TYPE[vatRegime] || null,
      stripe_transfer_id: withdrawal.stripe_transfer_id || null,
      stripe_transfer_group: withdrawal.stripe_transfer_group || null,
      executed_at: withdrawal.executed_at || null,
      executed_at_local: formatDateEs(withdrawal.executed_at),
      executed_by_admin_email: withdrawal.executed_by_admin_email || null,
      reversed_at: withdrawal.reversed_at || null,
      reversal_amount: reversalAmount,
      reversal_reason: withdrawal.reversal_reason || null,
    },
    invoicing: inferInvoicingMode(user),
    lines,
    totals: {
      seller_earning_total: totals.seller_earning_total,
      taxable_base_total: totals.taxable_base_total,
      vat_amount_total: totals.vat_amount_total,
      transferred_amount: transferredAmount,
      net_of_reversals: netOfReversals,
      currency: 'EUR',
    },
    generated_at: new Date().toISOString(),
    generated_by_admin_email: adminEmail || null,
  };
}

/**
 * Build a PayoutReport for a single withdrawal id.
 *
 * @throws {Error} `PAYOUT_NOT_FOUND` / `PAYOUT_NOT_EXPORTABLE` — the
 *   controller maps these to ApiError.
 */
async function buildPayoutReport(withdrawalId, { adminEmail } = {}) {
  const withdrawal = await loadWithdrawalById(withdrawalId);
  if (!withdrawal) {
    const err = new Error('PAYOUT_NOT_FOUND');
    err.code = 'PAYOUT_NOT_FOUND';
    throw err;
  }
  if (withdrawal.status !== 'completed' && withdrawal.status !== 'reversed') {
    const err = new Error('PAYOUT_NOT_EXPORTABLE');
    err.code = 'PAYOUT_NOT_EXPORTABLE';
    err.status = withdrawal.status;
    throw err;
  }
  const [items, user] = await Promise.all([
    loadWithdrawalItems([withdrawal.id]),
    loadSellerUserById(withdrawal.user_id),
  ]);
  if (!user) {
    const err = new Error('SELLER_NOT_FOUND');
    err.code = 'SELLER_NOT_FOUND';
    throw err;
  }
  const descMap = await describeBatch(items);
  return assemblePayoutReport({ withdrawal, items, descMap, user, adminEmail });
}

/**
 * Build a range report: aggregates every exportable withdrawal in the range
 * into a single envelope with totals by regime and by month, plus the full
 * list of embedded PayoutReports.
 *
 * @param {object} args
 * @param {string} args.from       YYYY-MM-DD (inclusive)
 * @param {string} args.to         YYYY-MM-DD (inclusive)
 * @param {string} [args.vatRegime]  filter (`art_rebu`|`standard_vat`)
 * @param {number} [args.sellerId]   filter
 * @param {string} [args.adminEmail]
 */
async function buildRangeReport({ from, to, vatRegime, sellerId, adminEmail } = {}) {
  const withdrawals = await loadWithdrawalsInRange({ from, to, vatRegime, sellerId });

  if (withdrawals.length === 0) {
    return {
      platform: buildPlatformBlock(),
      range: { from, to },
      filters: { vat_regime: vatRegime || null, seller_id: sellerId ? Number(sellerId) : null },
      totals_by_regime: {
        art_rebu: emptyRegimeTotals(),
        standard_vat: emptyRegimeTotals(),
      },
      totals_by_month: {},
      payouts: [],
      generated_at: new Date().toISOString(),
      generated_by_admin_email: adminEmail || null,
    };
  }

  const withdrawalIds = withdrawals.map((w) => Number(w.id));
  const userIds = withdrawals.map((w) => Number(w.user_id));

  const [items, userMap] = await Promise.all([
    loadWithdrawalItems(withdrawalIds),
    loadSellerUsersByIds(userIds),
  ]);

  const descMap = await describeBatch(items);

  // Bucket items by withdrawal_id for per-payout assembly.
  const itemsByWithdrawal = new Map();
  for (const it of items) {
    const wid = Number(it.withdrawal_id);
    if (!itemsByWithdrawal.has(wid)) itemsByWithdrawal.set(wid, []);
    itemsByWithdrawal.get(wid).push(it);
  }

  const payouts = [];
  const totalsByRegime = {
    art_rebu: emptyRegimeTotals(),
    standard_vat: emptyRegimeTotals(),
  };
  const totalsByMonth = {};

  for (const withdrawal of withdrawals) {
    const user = userMap.get(Number(withdrawal.user_id));
    if (!user) {
      // Skip (shouldn't happen — FK constraint) but don't crash the whole export.
      continue;
    }
    const payoutItems = itemsByWithdrawal.get(Number(withdrawal.id)) || [];
    const report = assemblePayoutReport({
      withdrawal,
      items: payoutItems,
      descMap,
      user,
      adminEmail,
    });
    payouts.push(report);

    // Accumulate totals by regime.
    const regime = withdrawal.vat_regime;
    if (regime && totalsByRegime[regime]) {
      totalsByRegime[regime].count += 1;
      totalsByRegime[regime].taxable_base_total = round2(
        totalsByRegime[regime].taxable_base_total + report.totals.taxable_base_total
      );
      totalsByRegime[regime].vat_amount_total = round2(
        totalsByRegime[regime].vat_amount_total + report.totals.vat_amount_total
      );
      totalsByRegime[regime].seller_earning_total = round2(
        totalsByRegime[regime].seller_earning_total + report.totals.seller_earning_total
      );
      totalsByRegime[regime].net_of_reversals_total = round2(
        totalsByRegime[regime].net_of_reversals_total + report.totals.net_of_reversals
      );
    }

    // Accumulate totals by month (YYYY-MM) using executed_at in Europe/Madrid.
    const monthKey = monthKeyEs(withdrawal.executed_at);
    if (monthKey) {
      if (!totalsByMonth[monthKey]) totalsByMonth[monthKey] = emptyRegimeTotals();
      totalsByMonth[monthKey].count += 1;
      totalsByMonth[monthKey].taxable_base_total = round2(
        totalsByMonth[monthKey].taxable_base_total + report.totals.taxable_base_total
      );
      totalsByMonth[monthKey].vat_amount_total = round2(
        totalsByMonth[monthKey].vat_amount_total + report.totals.vat_amount_total
      );
      totalsByMonth[monthKey].seller_earning_total = round2(
        totalsByMonth[monthKey].seller_earning_total + report.totals.seller_earning_total
      );
      totalsByMonth[monthKey].net_of_reversals_total = round2(
        totalsByMonth[monthKey].net_of_reversals_total + report.totals.net_of_reversals
      );
    }
  }

  return {
    platform: buildPlatformBlock(),
    range: { from, to },
    filters: { vat_regime: vatRegime || null, seller_id: sellerId ? Number(sellerId) : null },
    totals_by_regime: totalsByRegime,
    totals_by_month: totalsByMonth,
    payouts,
    generated_at: new Date().toISOString(),
    generated_by_admin_email: adminEmail || null,
  };
}

function emptyRegimeTotals() {
  return {
    count: 0,
    taxable_base_total: 0,
    vat_amount_total: 0,
    seller_earning_total: 0,
    net_of_reversals_total: 0,
  };
}

/**
 * YYYY-MM month key in Europe/Madrid for aggregation.
 */
function monthKeyEs(input) {
  if (!input) return null;
  const iso = normalizeIso(input);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  });
  // en-CA returns e.g. '2026-04'.
  return fmt.format(d);
}

// ─── Formatters ────────────────────────────────────────────────────────

function formatAddress(addr) {
  if (!addr) return '';
  const parts = [
    addr.line1,
    addr.line2,
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.province,
    addr.country,
  ].filter((p) => p && String(p).trim());
  return parts.join(', ');
}

/**
 * Build the "single payout" CSV (metadata block + detail block).
 */
function formatSinglePayoutCsv(report) {
  const regime = report.withdrawal.vat_regime;
  const invoicingLabel = INVOICING_MODE_LABEL_ES[report.invoicing.mode] || report.invoicing.mode;
  const statusLabel = STATUS_LABEL_ES[report.withdrawal.status] || report.withdrawal.status;

  const rows = [];
  rows.push(csvRow(['Informe de payout']));
  rows.push(csvRow(['Generado el', formatDateTimeEs(report.generated_at)]));
  rows.push(csvRow(['Generado por', report.generated_by_admin_email || '']));
  rows.push(csvRow(['ID del payout', report.withdrawal.id]));
  rows.push(csvRow(['Estado', statusLabel]));
  rows.push(csvRow(['Régimen fiscal', VAT_REGIME_LABEL_ES[regime] || regime || '']));
  rows.push(csvRow(['Stripe transfer ID', report.withdrawal.stripe_transfer_id || '']));
  rows.push(csvRow(['Stripe transfer group', report.withdrawal.stripe_transfer_group || '']));
  rows.push(csvRow(['Fecha de ejecución', report.withdrawal.executed_at_local || '']));
  rows.push(csvRow(['Ejecutado por', report.withdrawal.executed_by_admin_email || '']));
  if (report.withdrawal.reversed_at) {
    rows.push(csvRow(['Fecha de reversión', formatDateEs(report.withdrawal.reversed_at)]));
    rows.push(csvRow(['Importe revertido (€)', formatMoneyEs(report.withdrawal.reversal_amount || 0)]));
    rows.push(csvRow(['Motivo de reversión', report.withdrawal.reversal_reason || '']));
  }
  rows.push(csvRow([]));

  rows.push(csvRow(['Plataforma', report.platform.name]));
  rows.push(csvRow(['Razón social', report.platform.legal_name]));
  rows.push(csvRow(['CIF', report.platform.tax_id]));
  rows.push(csvRow(['Dirección', formatAddress(report.platform.address)]));
  rows.push(csvRow(['Email', report.platform.email]));
  rows.push(csvRow([]));

  rows.push(csvRow(['Artista', report.seller.fiscal_full_name || '']));
  rows.push(csvRow(['ID artista', report.seller.user_id]));
  rows.push(csvRow(['Estado fiscal', report.seller.tax_status || '']));
  rows.push(csvRow(['NIF/NIE/CIF', report.seller.tax_id || '']));
  rows.push(csvRow(['Dirección', formatAddress(report.seller.address)]));
  rows.push(
    csvRow([
      'IRPF (tipo informado)',
      report.seller.irpf_retention_rate !== null
        ? `${formatMoneyEs(report.seller.irpf_retention_rate)}%`
        : 'No informado',
    ])
  );
  rows.push(
    csvRow([
      'Acuerdo autofacturación',
      report.seller.autofactura_agreement_signed_at
        ? `Firmado el ${formatDateEs(report.seller.autofactura_agreement_signed_at)}`
        : 'No firmado',
    ])
  );
  rows.push(csvRow(['Cuenta Stripe Connect', report.seller.stripe_connect_account_id || '']));
  rows.push(csvRow(['Modo de facturación', invoicingLabel]));
  rows.push(csvRow(['Explicación facturación', report.invoicing.explanation]));
  rows.push(csvRow([]));

  rows.push(
    csvRow([
      'Tipo',
      'Referencia',
      'Descripción',
      'Comprador',
      'Ganancia artista (€)',
      'Base imponible (€)',
      '% IVA',
      'IVA (€)',
      'Total línea (€)',
    ])
  );
  for (const line of report.lines) {
    rows.push(
      csvRow([
        ITEM_TYPE_LABEL_ES[line.item_type] || line.item_type,
        `${line.item_type}:${line.item_id}`,
        line.description,
        line.buyer_reference,
        formatMoneyEs(line.seller_earning),
        formatMoneyEs(line.taxable_base),
        `${Math.round(line.vat_rate * 100)}%`,
        formatMoneyEs(line.vat_amount),
        formatMoneyEs(line.line_total),
      ])
    );
  }
  rows.push(csvRow([]));

  rows.push(
    csvRow([
      'Totales',
      '',
      '',
      '',
      formatMoneyEs(report.totals.seller_earning_total),
      formatMoneyEs(report.totals.taxable_base_total),
      '',
      formatMoneyEs(report.totals.vat_amount_total),
      formatMoneyEs(report.totals.taxable_base_total + report.totals.vat_amount_total),
    ])
  );
  rows.push(csvRow(['Importe transferido (€)', formatMoneyEs(report.totals.transferred_amount)]));
  if (report.totals.net_of_reversals !== report.totals.transferred_amount) {
    rows.push(csvRow(['Importe neto tras reversión (€)', formatMoneyEs(report.totals.net_of_reversals)]));
  }

  return CSV_BOM + rows.join('\r\n') + '\r\n';
}

/**
 * Build the "range" CSV — one row per item with the parent withdrawal columns
 * repeated. Format "long" (see design.md §4).
 */
function formatRangeCsv(report) {
  const rows = [];
  rows.push(
    csvRow([
      'Withdrawal ID',
      'Fecha',
      'Estado',
      'Régimen',
      'Stripe transfer ID',
      'Artista',
      'NIF artista',
      'Estado fiscal',
      'Modo facturación',
      'Tipo item',
      'Referencia',
      'Descripción',
      'Comprador',
      'Ganancia artista (€)',
      'Base imponible (€)',
      '% IVA',
      'IVA (€)',
      'Total línea (€)',
    ])
  );

  for (const payout of report.payouts) {
    const regime = payout.withdrawal.vat_regime;
    const regimeLabel = VAT_REGIME_LABEL_ES[regime] || regime || '';
    const statusLabel = STATUS_LABEL_ES[payout.withdrawal.status] || payout.withdrawal.status;
    const invoicingLabel =
      INVOICING_MODE_LABEL_ES[payout.invoicing.mode] || payout.invoicing.mode;
    const sellerName = payout.seller.fiscal_full_name || '';
    const sellerTaxId = payout.seller.tax_id || '';
    const sellerStatus = payout.seller.tax_status || '';

    for (const line of payout.lines) {
      rows.push(
        csvRow([
          payout.withdrawal.id,
          payout.withdrawal.executed_at_local,
          statusLabel,
          regimeLabel,
          payout.withdrawal.stripe_transfer_id || '',
          sellerName,
          sellerTaxId,
          sellerStatus,
          invoicingLabel,
          ITEM_TYPE_LABEL_ES[line.item_type] || line.item_type,
          `${line.item_type}:${line.item_id}`,
          line.description,
          line.buyer_reference,
          formatMoneyEs(line.seller_earning),
          formatMoneyEs(line.taxable_base),
          `${Math.round(line.vat_rate * 100)}%`,
          formatMoneyEs(line.vat_amount),
          formatMoneyEs(line.line_total),
        ])
      );
    }
  }

  return CSV_BOM + rows.join('\r\n') + '\r\n';
}

/**
 * Route CSV formatting to the correct shape. `kind` is required.
 */
function formatAsCsv(report, { kind } = {}) {
  if (kind === 'single') return formatSinglePayoutCsv(report);
  if (kind === 'range') return formatRangeCsv(report);
  throw new Error(`formatAsCsv: unknown kind ${kind}`);
}

/**
 * Return the report as-is (the caller does the JSON.stringify).
 */
function formatAsJson(report) {
  return report;
}

module.exports = {
  // Builders
  buildPayoutReport,
  buildRangeReport,
  assemblePayoutReport,
  // Pure helpers
  inferInvoicingMode,
  formatAsCsv,
  formatAsJson,
  csvEscape,
  csvRow,
  formatMoneyEs,
  formatDateEs,
  formatDateTimeEs,
  // Constants (for tests)
  VAT_REGIME_LABEL_ES,
  OPERATION_TYPE,
  ITEM_TYPE_LABEL_ES,
  INVOICING_MODE_LABEL_ES,
};
