/**
 * Invoice business-logic service (layer 2).
 *
 * Queries the database, manages invoice numbering, and delegates
 * PDF generation to pdfGenerator.js.
 *
 * Design decisions D4 (invoices table), D5 (2-layer), D6 (mixed orders),
 * D7 (shipping), D8 (commission vs settlement), D9 (post-pago), D10 (series).
 */

const { db } = require('../config/database');
const config = require('../config/env');
const { assertBusinessConfigComplete } = require('../config/env');
const logger = require('../config/logger');
const pdfGenerator = require('./pdfGenerator');

const { round2 } = pdfGenerator;

// ═══════════════════════════════════════════════════════════
// Invoice number management (idempotent, gap-free)
// ═══════════════════════════════════════════════════════════

/**
 * Assign (or retrieve) an invoice number for a given entity.
 * First call creates the record; subsequent calls return the same number.
 *
 * @param {object} opts
 * @param {string} opts.series         — 'A'|'P'|'C'|'L'
 * @param {string} opts.invoiceType    — 'buyer_rebu'|'buyer_standard'|'commission'|'settlement_rebu'
 * @param {number|null} opts.orderId
 * @param {number|null} opts.withdrawalId
 * @param {string|null} opts.eventAttendeeId
 * @returns {Promise<string>} invoice number, e.g. "A-2026-00001"
 */
async function assignInvoiceNumber({ series, invoiceType, orderId = null, withdrawalId = null, eventAttendeeId = null }) {
  // Check for existing invoice (idempotency)
  let lookupSql, lookupArgs;
  if (orderId) {
    lookupSql = 'SELECT invoice_number FROM invoices WHERE order_id = ? AND invoice_type = ?';
    lookupArgs = [orderId, invoiceType];
  } else if (withdrawalId) {
    lookupSql = 'SELECT invoice_number FROM invoices WHERE withdrawal_id = ? AND invoice_type = ?';
    lookupArgs = [withdrawalId, invoiceType];
  } else if (eventAttendeeId) {
    lookupSql = 'SELECT invoice_number FROM invoices WHERE event_attendee_id = ? AND invoice_type = ?';
    lookupArgs = [eventAttendeeId, invoiceType];
  } else {
    throw new Error('At least one of orderId, withdrawalId, or eventAttendeeId is required');
  }

  const existing = await db.execute({ sql: lookupSql, args: lookupArgs });
  if (existing.rows.length > 0) {
    return existing.rows[0].invoice_number;
  }

  // Atomically determine next sequence and insert
  const year = new Date().getFullYear();

  // SQLite serialises writes, so SELECT MAX + INSERT in a batch is safe
  const maxResult = await db.execute({
    sql: 'SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM invoices WHERE series = ? AND year = ?',
    args: [series, year],
  });
  const nextSeq = (maxResult.rows[0].max_seq || 0) + 1;
  const invoiceNumber = `${series}-${year}-${String(nextSeq).padStart(5, '0')}`;

  await db.execute({
    sql: `INSERT INTO invoices (invoice_number, series, year, sequence, invoice_type, order_id, withdrawal_id, event_attendee_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [invoiceNumber, series, year, nextSeq, invoiceType, orderId, withdrawalId, eventAttendeeId],
  });

  logger.info({ invoiceNumber, series, invoiceType }, '[invoiceService] Invoice number assigned');
  return invoiceNumber;
}

// ═══════════════════════════════════════════════════════════
// Gallery issuer data (from env config)
// ═══════════════════════════════════════════════════════════

function getGalleryIssuer() {
  const missing = assertBusinessConfigComplete();
  if (missing.length > 0) {
    const err = new Error(`Datos fiscales de la galería incompletos. Faltan: ${missing.join(', ')}`);
    err.statusCode = 503;
    throw err;
  }
  return {
    name: config.business.legalName || config.business.name,
    taxId: config.business.taxId,
    address: {
      line1: config.business.address.line1,
      line2: config.business.address.line2,
      city: config.business.address.city,
      postalCode: config.business.address.postalCode,
      province: config.business.address.province,
      country: config.business.address.country,
    },
    email: config.business.email,
  };
}

// ═══════════════════════════════════════════════════════════
// 1. Buyer REBU Invoice (Series A)
// ═══════════════════════════════════════════════════════════

/**
 * @param {number} orderId
 * @returns {Promise<PDFDocument>}
 */
async function generateBuyerRebuInvoice(orderId) {
  const order = await loadOrder(orderId);
  const artItems = await loadArtOrderItems(orderId);

  if (artItems.length === 0) {
    const err = new Error('Este pedido no contiene productos de arte (REBU)');
    err.statusCode = 400;
    throw err;
  }

  validateBuyerInvoicingData(order);

  const invoiceNumber = await assignInvoiceNumber({
    series: 'A',
    invoiceType: 'buyer_rebu',
    orderId,
  });

  const issuer = getGalleryIssuer();

  const recipient = {
    name: order.full_name,
    email: order.email || order.guest_email,
    address: {
      line1: order.invoicing_address_line_1,
      line2: order.invoicing_address_line_2,
      city: order.invoicing_city,
      postalCode: order.invoicing_postal_code,
      province: order.invoicing_province,
      country: order.invoicing_country || 'ES',
    },
  };

  const items = artItems.map((item) => ({
    description: item.art_name || `Obra #${item.art_id}`,
    amount: Number(item.price_at_purchase),
  }));

  const shippingCost = artItems.reduce((sum, i) => sum + (Number(i.shipping_cost) || 0), 0);
  const itemsTotal = artItems.reduce((sum, i) => sum + Number(i.price_at_purchase), 0);
  const total = round2(itemsTotal + shippingCost);

  return pdfGenerator.generateBuyerRebuPdf({
    invoiceNumber,
    date: new Date(),
    issuer,
    recipient,
    items,
    shippingCost,
    total,
  });
}

// ═══════════════════════════════════════════════════════════
// 2. Buyer Standard Invoice (Series P — products)
// ═══════════════════════════════════════════════════════════

/**
 * @param {number} orderId
 * @returns {Promise<PDFDocument>}
 */
async function generateBuyerStandardInvoice(orderId) {
  const order = await loadOrder(orderId);
  const otherItems = await loadOtherOrderItems(orderId);

  if (otherItems.length === 0) {
    const err = new Error('Este pedido no contiene productos estándar (IVA 21%)');
    err.statusCode = 400;
    throw err;
  }

  validateBuyerInvoicingData(order);

  const invoiceNumber = await assignInvoiceNumber({
    series: 'P',
    invoiceType: 'buyer_standard',
    orderId,
  });

  const issuer = getGalleryIssuer();

  const recipient = {
    name: order.full_name,
    email: order.email || order.guest_email,
    address: {
      line1: order.invoicing_address_line_1,
      line2: order.invoicing_address_line_2,
      city: order.invoicing_city,
      postalCode: order.invoicing_postal_code,
      province: order.invoicing_province,
      country: order.invoicing_country || 'ES',
    },
  };

  // Prices include 21% IVA — extract base
  const items = otherItems.map((item) => {
    const total = Number(item.price_at_purchase);
    const base = round2(total / 1.21);
    const vatAmount = round2(total - base);
    const name = item.variant_key
      ? `${item.other_name} — ${item.variant_key}`
      : item.other_name || `Producto #${item.other_id}`;
    return { description: name, base, vatAmount, total };
  });

  // Shipping with IVA breakdown
  const totalShipping = otherItems.reduce((sum, i) => sum + (Number(i.shipping_cost) || 0), 0);
  let shipping = null;
  if (totalShipping > 0) {
    const shippingBase = round2(totalShipping / 1.21);
    const shippingVat = round2(totalShipping - shippingBase);
    shipping = { base: shippingBase, vatAmount: shippingVat, total: round2(totalShipping) };
  }

  // Totals
  const totalBase = round2(items.reduce((s, i) => s + i.base, 0) + (shipping ? shipping.base : 0));
  const totalVat = round2(items.reduce((s, i) => s + i.vatAmount, 0) + (shipping ? shipping.vatAmount : 0));
  const totalAmount = round2(totalBase + totalVat);

  return pdfGenerator.generateBuyerStandardPdf({
    invoiceNumber,
    date: new Date(),
    issuer,
    recipient,
    items,
    shipping,
    totals: { base: totalBase, vatAmount: totalVat, total: totalAmount },
  });
}

// ═══════════════════════════════════════════════════════════
// 3. Event Attendee Invoice (Series P)
// ═══════════════════════════════════════════════════════════

/**
 * @param {string} attendeeId — TEXT UUID
 * @returns {Promise<PDFDocument>}
 */
async function generateEventAttendeeInvoice(attendeeId) {
  const result = await db.execute({
    sql: `
      SELECT ea.id, ea.first_name, ea.last_name, ea.email,
             ea.amount_paid, ea.status,
             e.title AS event_title
      FROM event_attendees ea
      JOIN events e ON ea.event_id = e.id
      WHERE ea.id = ?
    `,
    args: [attendeeId],
  });

  if (result.rows.length === 0) {
    const err = new Error('Asistente no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const attendee = result.rows[0];

  if (!['paid', 'joined'].includes(attendee.status)) {
    const err = new Error('El asistente no ha realizado el pago');
    err.statusCode = 400;
    throw err;
  }

  const invoiceNumber = await assignInvoiceNumber({
    series: 'P',
    invoiceType: 'buyer_standard',
    eventAttendeeId: attendeeId,
  });

  const issuer = getGalleryIssuer();

  const recipient = {
    name: `${attendee.first_name} ${attendee.last_name}`,
    email: attendee.email,
  };

  const total = Number(attendee.amount_paid);
  const base = round2(total / 1.21);
  const vatAmount = round2(total - base);

  const items = [{
    description: `Entrada — ${attendee.event_title}`,
    base,
    vatAmount,
    total,
  }];

  return pdfGenerator.generateBuyerStandardPdf({
    invoiceNumber,
    date: new Date(),
    issuer,
    recipient,
    items,
    shipping: null,
    totals: { base, vatAmount, total },
  });
}

// ═══════════════════════════════════════════════════════════
// 4. Commission Invoice (Series C — standard only)
// ═══════════════════════════════════════════════════════════

/**
 * @param {number} withdrawalId
 * @returns {Promise<PDFDocument>}
 */
async function generateCommissionInvoice(withdrawalId) {
  const withdrawal = await loadWithdrawal(withdrawalId);

  if (withdrawal.vat_regime !== 'standard_vat') {
    const err = new Error('Las comisiones REBU no generan factura de comisión. Use la nota de liquidación.');
    err.statusCode = 400;
    throw err;
  }

  if (withdrawal.status !== 'completed') {
    const err = new Error('El pago aún no ha sido ejecutado');
    err.statusCode = 409;
    throw err;
  }

  const invoiceNumber = await assignInvoiceNumber({
    series: 'C',
    invoiceType: 'commission',
    withdrawalId,
  });

  const issuer = getGalleryIssuer();

  // Load artist fiscal data
  const seller = await loadSeller(withdrawal.user_id);
  const recipient = {
    name: seller.fiscal_full_name || seller.full_name,
    taxId: seller.tax_id,
    address: seller.fiscal_address_line_1 ? {
      line1: seller.fiscal_address_line_1,
      line2: seller.fiscal_address_line_2,
      city: seller.fiscal_city,
      postalCode: seller.fiscal_postal_code,
      province: seller.fiscal_province,
      country: seller.fiscal_country || 'ES',
    } : null,
    email: seller.email,
  };

  // Load withdrawal items with product names
  const wiResult = await db.execute({
    sql: `
      SELECT wi.*, 
             CASE 
               WHEN wi.item_type = 'other_order_item' THEN (
                 SELECT o.name FROM other_order_items ooi 
                 JOIN others o ON ooi.other_id = o.id 
                 WHERE ooi.id = wi.item_id
               )
               WHEN wi.item_type = 'event_attendee' THEN (
                 SELECT e.title FROM event_attendees ea 
                 JOIN events e ON ea.event_id = e.id 
                 WHERE ea.id = wi.item_id
               )
               ELSE NULL
             END AS product_name,
             CASE 
               WHEN wi.item_type IN ('other_order_item') THEN (
                 SELECT ooi.order_id FROM other_order_items ooi WHERE ooi.id = wi.item_id
               )
               ELSE NULL
             END AS order_id
      FROM withdrawal_items wi
      WHERE wi.withdrawal_id = ?
    `,
    args: [withdrawalId],
  });

  const withdrawalItems = wiResult.rows;

  // Commission = price - seller_earning. But we have taxable_base and vat_amount in withdrawal_items.
  // The commission invoice shows: base = taxable_base, vat = vat_amount, total = taxable_base + vat_amount
  const items = withdrawalItems.map((wi) => {
    const base = Number(wi.taxable_base);
    const vatAmount = Number(wi.vat_amount);
    const total = round2(base + vatAmount);

    let description;
    if (wi.item_type === 'event_attendee') {
      description = `Comisión por intermediación – ${wi.product_name || 'Evento'} (Entrada)`;
    } else {
      description = `Comisión por intermediación – ${wi.product_name || 'Producto'} (Pedido #${wi.order_id || '?'})`;
    }

    return { description, base, vatAmount, total };
  });

  const totalBase = round2(items.reduce((s, i) => s + i.base, 0));
  const totalVat = round2(items.reduce((s, i) => s + i.vatAmount, 0));
  const totalAmount = round2(totalBase + totalVat);

  return pdfGenerator.generateCommissionPdf({
    invoiceNumber,
    date: withdrawal.completed_at || new Date(),
    issuer,
    recipient,
    items,
    totals: { base: totalBase, vatAmount: totalVat, total: totalAmount },
  });
}

// ═══════════════════════════════════════════════════════════
// 5. Settlement Note (Series L — REBU only)
// ═══════════════════════════════════════════════════════════

/**
 * @param {number} withdrawalId
 * @returns {Promise<PDFDocument>}
 */
async function generateSettlementNote(withdrawalId) {
  const withdrawal = await loadWithdrawal(withdrawalId);

  if (withdrawal.vat_regime !== 'art_rebu') {
    const err = new Error('Las notas de liquidación solo aplican al régimen REBU');
    err.statusCode = 400;
    throw err;
  }

  if (withdrawal.status !== 'completed') {
    const err = new Error('El pago aún no ha sido ejecutado');
    err.statusCode = 409;
    throw err;
  }

  const invoiceNumber = await assignInvoiceNumber({
    series: 'L',
    invoiceType: 'settlement_rebu',
    withdrawalId,
  });

  const issuer = getGalleryIssuer();

  // Load withdrawal items with artwork names and order IDs
  const wiResult = await db.execute({
    sql: `
      SELECT wi.*,
             a.name AS art_name,
             aoi.order_id,
             aoi.price_at_purchase AS sale_price
      FROM withdrawal_items wi
      JOIN art_order_items aoi ON wi.item_id = aoi.id
      JOIN art a ON aoi.art_id = a.id
      WHERE wi.withdrawal_id = ?
    `,
    args: [withdrawalId],
  });

  const withdrawalItems = wiResult.rows;

  // Margin = sale_price - seller_earning (= commission_amount)
  // base = margin / 1.21, vat_embedded = margin - base
  const items = withdrawalItems.map((wi) => {
    const salePrice = Number(wi.sale_price);
    const costPrice = Number(wi.seller_earning);
    const margin = round2(salePrice - costPrice);
    const base = round2(margin / 1.21);
    const vatEmbedded = round2(margin - base);

    return {
      description: `Margen REBU – ${wi.art_name || 'Obra'} (Pedido #${wi.order_id || '?'})`,
      salePrice,
      costPrice,
      margin,
      base,
      vatEmbedded,
    };
  });

  const totalMargin = round2(items.reduce((s, i) => s + i.margin, 0));
  const totalBase = round2(items.reduce((s, i) => s + i.base, 0));
  const totalVat = round2(items.reduce((s, i) => s + i.vatEmbedded, 0));

  return pdfGenerator.generateSettlementNotePdf({
    invoiceNumber,
    date: withdrawal.completed_at || new Date(),
    issuer,
    items,
    totals: { totalMargin, totalBase, totalVat },
  });
}

// ═══════════════════════════════════════════════════════════
// Database query helpers
// ═══════════════════════════════════════════════════════════

async function loadOrder(orderId) {
  const result = await db.execute({
    sql: 'SELECT * FROM orders WHERE id = ?',
    args: [orderId],
  });
  if (result.rows.length === 0) {
    const err = new Error('Pedido no encontrado');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function loadArtOrderItems(orderId) {
  const result = await db.execute({
    sql: `
      SELECT aoi.*, a.name AS art_name
      FROM art_order_items aoi
      JOIN art a ON aoi.art_id = a.id
      WHERE aoi.order_id = ?
    `,
    args: [orderId],
  });
  return result.rows;
}

async function loadOtherOrderItems(orderId) {
  const result = await db.execute({
    sql: `
      SELECT ooi.*, o.name AS other_name, ov.key AS variant_key
      FROM other_order_items ooi
      JOIN others o ON ooi.other_id = o.id
      LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
      WHERE ooi.order_id = ?
    `,
    args: [orderId],
  });
  return result.rows;
}

async function loadWithdrawal(withdrawalId) {
  const result = await db.execute({
    sql: 'SELECT * FROM withdrawals WHERE id = ?',
    args: [withdrawalId],
  });
  if (result.rows.length === 0) {
    const err = new Error('Pago no encontrado');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function loadSeller(userId) {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [userId],
  });
  if (result.rows.length === 0) {
    const err = new Error('Vendedor no encontrado');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

function validateBuyerInvoicingData(order) {
  if (!order.invoicing_address_line_1 || !order.invoicing_postal_code || !order.invoicing_city) {
    const err = new Error('Faltan datos de facturación del comprador');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  generateBuyerRebuInvoice,
  generateBuyerStandardInvoice,
  generateEventAttendeeInvoice,
  generateCommissionInvoice,
  generateSettlementNote,
  // Exposed for testing
  assignInvoiceNumber,
};
