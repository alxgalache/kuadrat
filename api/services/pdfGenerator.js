/**
 * Low-level PDF generation service.
 *
 * Receives structured data objects and produces PDFKit documents.
 * Has NO knowledge of the database — that is the invoiceService's job.
 *
 * Design decision D5: 2-layer architecture (pdfGenerator + invoiceService).
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

// ── Font paths ────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONTS_DIR, 'Inter-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'Inter-Bold.ttf');

let fontsAvailable = false;
try {
  fontsAvailable = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
  if (!fontsAvailable) {
    logger.warn('[pdfGenerator] Inter font files not found — falling back to Helvetica');
  }
} catch {
  logger.warn('[pdfGenerator] Could not check font files — falling back to Helvetica');
}

// ── Colours & constants ───────────────────────────────────
const COLOR_TEXT = '#111827';
const COLOR_ACCENT = '#1d4ed8';
const COLOR_MUTED = '#6b7280';
const COLOR_LINE = '#e5e7eb';
const COLOR_TABLE_HEADER_BG = '#f9fafb';

const PAGE_MARGIN = 50;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────

function registerFonts(doc) {
  if (fontsAvailable) {
    doc.registerFont('Inter', FONT_REGULAR);
    doc.registerFont('Inter-Bold', FONT_BOLD);
  }
}

function fontRegular() { return fontsAvailable ? 'Inter' : 'Helvetica'; }
function fontBold() { return fontsAvailable ? 'Inter-Bold' : 'Helvetica-Bold'; }

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function round2(n) { return Math.round(n * 100) / 100; }

// ── Document creation ─────────────────────────────────────

/**
 * Creates a new PDFKit document preconfigured for A4 portrait.
 */
function createDocument() {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    info: { Producer: '140d Galería de Arte', Creator: '140d Galería de Arte' },
    autoFirstPage: true,
    bufferPages: true,
  });
  registerFonts(doc);
  return doc;
}

// ── Header ────────────────────────────────────────────────

/**
 * Renders the document header: gallery name, document type, number, date.
 *
 * @param {PDFDocument} doc
 * @param {object} opts
 * @param {string} opts.documentType  — e.g. "FACTURA", "NOTA DE LIQUIDACIÓN INTERNA"
 * @param {string} opts.invoiceNumber — e.g. "A-2026-00001"
 * @param {string} opts.date          — ISO string or Date
 * @param {string} [opts.disclaimer]  — optional banner text (e.g. settlement note disclaimer)
 */
function renderHeader(doc, { documentType, invoiceNumber, date, disclaimer }) {
  // Gallery name
  doc.font(fontBold()).fontSize(20).fillColor(COLOR_ACCENT)
    .text('140d Galería de Arte', PAGE_MARGIN, PAGE_MARGIN, { width: CONTENT_WIDTH });

  // Document type + number (right-aligned block)
  const rightBlockX = A4_WIDTH - PAGE_MARGIN - 200;
  doc.font(fontBold()).fontSize(11).fillColor(COLOR_TEXT)
    .text(documentType, rightBlockX, PAGE_MARGIN, { width: 200, align: 'right' });
  doc.font(fontRegular()).fontSize(10).fillColor(COLOR_TEXT)
    .text(`Nº: ${invoiceNumber}`, rightBlockX, doc.y + 2, { width: 200, align: 'right' });
  doc.font(fontRegular()).fontSize(10).fillColor(COLOR_MUTED)
    .text(`Fecha: ${formatDate(date)}`, rightBlockX, doc.y + 2, { width: 200, align: 'right' });

  doc.moveDown(0.5);

  // Optional disclaimer banner (e.g. settlement note)
  if (disclaimer) {
    const bannerY = doc.y + 4;
    doc.rect(PAGE_MARGIN, bannerY, CONTENT_WIDTH, 24).fill('#fef2f2');
    doc.font(fontBold()).fontSize(8).fillColor('#991b1b')
      .text(disclaimer, PAGE_MARGIN + 8, bannerY + 7, { width: CONTENT_WIDTH - 16, align: 'center' });
    doc.y = bannerY + 32;
  }

  // Separator line
  const lineY = doc.y + 4;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(A4_WIDTH - PAGE_MARGIN, lineY)
    .strokeColor(COLOR_LINE).lineWidth(1).stroke();
  doc.y = lineY + 12;
}

// ── Issuer / Recipient ────────────────────────────────────

/**
 * Renders the two-column issuer (left) and recipient (right) section.
 *
 * @param {PDFDocument} doc
 * @param {object} issuer — { name, taxId, address: { line1, line2?, city, postalCode, province, country } }
 * @param {object} recipient — { label, name, taxId?, email?, address?: { line1, line2?, city, postalCode, province, country } }
 */
function renderParties(doc, issuer, recipient) {
  const startY = doc.y;
  const colWidth = (CONTENT_WIDTH - 30) / 2;

  // ─ Issuer (left) ─
  doc.font(fontBold()).fontSize(8).fillColor(COLOR_MUTED)
    .text('EMISOR', PAGE_MARGIN, startY, { width: colWidth });
  let y = doc.y + 2;
  doc.font(fontBold()).fontSize(10).fillColor(COLOR_TEXT)
    .text(issuer.name, PAGE_MARGIN, y, { width: colWidth });
  y = doc.y + 1;
  if (issuer.taxId) {
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_TEXT)
      .text(`NIF/CIF: ${issuer.taxId}`, PAGE_MARGIN, y, { width: colWidth });
    y = doc.y + 1;
  }
  if (issuer.address) {
    const addr = issuer.address;
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_TEXT)
      .text(addr.line1, PAGE_MARGIN, y, { width: colWidth });
    y = doc.y + 1;
    if (addr.line2) {
      doc.text(addr.line2, PAGE_MARGIN, y, { width: colWidth });
      y = doc.y + 1;
    }
    doc.text(`${addr.postalCode} ${addr.city}`, PAGE_MARGIN, y, { width: colWidth });
    y = doc.y + 1;
    doc.text(`${addr.province}, ${addr.country}`, PAGE_MARGIN, y, { width: colWidth });
    y = doc.y + 1;
  }
  if (issuer.email) {
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_MUTED)
      .text(issuer.email, PAGE_MARGIN, y, { width: colWidth });
  }
  const issuerEndY = doc.y;

  // ─ Recipient (right) ─
  const rX = PAGE_MARGIN + colWidth + 30;
  doc.font(fontBold()).fontSize(8).fillColor(COLOR_MUTED)
    .text(recipient.label || 'RECEPTOR', rX, startY, { width: colWidth });
  y = doc.y + 2;
  doc.font(fontBold()).fontSize(10).fillColor(COLOR_TEXT)
    .text(recipient.name, rX, y, { width: colWidth });
  y = doc.y + 1;
  if (recipient.taxId) {
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_TEXT)
      .text(`NIF/CIF: ${recipient.taxId}`, rX, y, { width: colWidth });
    y = doc.y + 1;
  }
  if (recipient.address) {
    const addr = recipient.address;
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_TEXT)
      .text(addr.line1, rX, y, { width: colWidth });
    y = doc.y + 1;
    if (addr.line2) {
      doc.text(addr.line2, rX, y, { width: colWidth });
      y = doc.y + 1;
    }
    doc.text(`${addr.postalCode} ${addr.city}`, rX, y, { width: colWidth });
    y = doc.y + 1;
    doc.text(`${addr.province}, ${addr.country}`, rX, y, { width: colWidth });
    y = doc.y + 1;
  }
  if (recipient.email) {
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_MUTED)
      .text(recipient.email, rX, y, { width: colWidth });
  }

  doc.y = Math.max(issuerEndY, doc.y) + 16;

  // Separator
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(A4_WIDTH - PAGE_MARGIN, doc.y)
    .strokeColor(COLOR_LINE).lineWidth(0.5).stroke();
  doc.y += 12;
}

// ── Line items table ──────────────────────────────────────

/**
 * Renders a table of line items.
 *
 * @param {PDFDocument} doc
 * @param {object} opts
 * @param {string[]} opts.columns     — column headers, e.g. ['Concepto', 'Importe']
 * @param {number[]} opts.colWidths   — proportional widths (must sum to CONTENT_WIDTH)
 * @param {string[]} opts.colAligns   — 'left' | 'right' per column
 * @param {Array<string[]>} opts.rows — array of row arrays (each cell is a string)
 */
function renderLineItems(doc, { columns, colWidths, colAligns, rows }) {
  const rowHeight = 22;
  const headerHeight = 26;
  const fontSize = 9;
  const startX = PAGE_MARGIN;

  // ─ Header row ─
  doc.rect(startX, doc.y, CONTENT_WIDTH, headerHeight).fill(COLOR_TABLE_HEADER_BG);
  let hx = startX;
  columns.forEach((col, i) => {
    doc.font(fontBold()).fontSize(8).fillColor(COLOR_MUTED)
      .text(col.toUpperCase(), hx + 4, doc.y + 8, { width: colWidths[i] - 8, align: colAligns[i] || 'left' });
    hx += colWidths[i];
  });
  // Reset fill color after header
  doc.y += headerHeight;

  // ─ Data rows ─
  rows.forEach((row, ri) => {
    // Page break check
    if (doc.y + rowHeight > A4_HEIGHT - PAGE_MARGIN - 80) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
    }

    // Alternate row background
    if (ri % 2 === 1) {
      doc.rect(startX, doc.y, CONTENT_WIDTH, rowHeight).fill('#fafafa');
    }

    let rx = startX;
    row.forEach((cell, ci) => {
      doc.font(fontRegular()).fontSize(fontSize).fillColor(COLOR_TEXT)
        .text(cell, rx + 4, doc.y + 6, { width: colWidths[ci] - 8, align: colAligns[ci] || 'left' });
      rx += colWidths[ci];
    });
    doc.y += rowHeight;

    // Bottom line
    doc.moveTo(startX, doc.y).lineTo(startX + CONTENT_WIDTH, doc.y)
      .strokeColor(COLOR_LINE).lineWidth(0.3).stroke();
  });

  doc.y += 8;
}

// ── Totals section ────────────────────────────────────────

/**
 * Renders the totals block (right-aligned summary).
 *
 * @param {PDFDocument} doc
 * @param {Array<{label: string, value: string, bold?: boolean}>} lines
 */
function renderTotals(doc, lines) {
  const blockWidth = 220;
  const blockX = A4_WIDTH - PAGE_MARGIN - blockWidth;

  // Separator above totals
  doc.moveTo(blockX, doc.y).lineTo(A4_WIDTH - PAGE_MARGIN, doc.y)
    .strokeColor(COLOR_LINE).lineWidth(1).stroke();
  doc.y += 6;

  lines.forEach((line) => {
    const font = line.bold ? fontBold() : fontRegular();
    const size = line.bold ? 11 : 9;

    // Label (left of block)
    doc.font(font).fontSize(size).fillColor(COLOR_TEXT)
      .text(line.label, blockX, doc.y, { width: blockWidth - 80, align: 'left', continued: false });
    // Value (right of block) — on same line
    const valueY = doc.y - (size + 2); // go back up to align
    doc.font(font).fontSize(size).fillColor(COLOR_TEXT)
      .text(line.value, blockX + blockWidth - 80, valueY, { width: 80, align: 'right' });
    doc.y = valueY + size + 6;
  });

  doc.y += 8;
}

// ── Footer / Legal mentions ───────────────────────────────

/**
 * Renders the footer area with legal mentions and/or disclaimers.
 * Always positioned near the bottom of the page.
 *
 * @param {PDFDocument} doc
 * @param {string[]} mentions — array of legal text lines to render
 */
function renderFooter(doc, mentions) {
  // Ensure we are at least near the bottom
  const footerY = Math.max(doc.y + 20, A4_HEIGHT - PAGE_MARGIN - 70);

  // Separator
  doc.moveTo(PAGE_MARGIN, footerY).lineTo(A4_WIDTH - PAGE_MARGIN, footerY)
    .strokeColor(COLOR_LINE).lineWidth(0.5).stroke();

  let y = footerY + 8;
  mentions.forEach((text) => {
    doc.font(fontRegular()).fontSize(7).fillColor(COLOR_MUTED)
      .text(text, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
    y = doc.y + 2;
  });
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API — high-level document generators
// ═══════════════════════════════════════════════════════════

/**
 * Generate a REBU buyer invoice (Series A).
 * No IVA breakdown — REBU legal mention required.
 *
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {string} data.date
 * @param {object} data.issuer       — gallery fiscal data
 * @param {object} data.recipient    — buyer data
 * @param {Array<{description: string, amount: number}>} data.items
 * @param {number} [data.shippingCost] — 0 if no shipping
 * @param {number} data.total
 * @returns {PDFDocument} — pipe this to a writable stream
 */
function generateBuyerRebuPdf(data) {
  const doc = createDocument();

  renderHeader(doc, {
    documentType: 'FACTURA',
    invoiceNumber: data.invoiceNumber,
    date: data.date,
  });

  renderParties(doc, data.issuer, { ...data.recipient, label: 'CLIENTE' });

  // Line items: 2 columns (Concepto, Importe) — no IVA
  const col1 = CONTENT_WIDTH - 100;
  const col2 = 100;
  const rows = data.items.map((item) => [item.description, formatCurrency(item.amount)]);
  if (data.shippingCost && data.shippingCost > 0) {
    rows.push(['Gastos de envío', formatCurrency(data.shippingCost)]);
  }

  renderLineItems(doc, {
    columns: ['Concepto', 'Importe'],
    colWidths: [col1, col2],
    colAligns: ['left', 'right'],
    rows,
  });

  renderTotals(doc, [
    { label: 'Total', value: formatCurrency(data.total), bold: true },
  ]);

  renderFooter(doc, [
    'Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección',
    '(artículos 135-139 de la Ley 37/1992)',
    `${data.issuer.name} · ${data.issuer.taxId || ''} · ${data.issuer.email || ''}`,
  ]);

  return doc;
}

/**
 * Generate a standard buyer invoice (Series P) with IVA 21% breakdown.
 *
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {string} data.date
 * @param {object} data.issuer
 * @param {object} data.recipient
 * @param {Array<{description: string, base: number, vatAmount: number, total: number}>} data.items
 * @param {{base: number, vatAmount: number, total: number}} [data.shipping]
 * @param {{base: number, vatAmount: number, total: number}} data.totals
 * @returns {PDFDocument}
 */
function generateBuyerStandardPdf(data) {
  const doc = createDocument();

  renderHeader(doc, {
    documentType: 'FACTURA',
    invoiceNumber: data.invoiceNumber,
    date: data.date,
  });

  renderParties(doc, data.issuer, { ...data.recipient, label: 'CLIENTE' });

  // 4 columns: Concepto, Base, IVA 21%, Total
  const col1 = CONTENT_WIDTH - 270;
  const col2 = 90;
  const col3 = 90;
  const col4 = 90;
  const rows = data.items.map((item) => [
    item.description,
    formatCurrency(item.base),
    formatCurrency(item.vatAmount),
    formatCurrency(item.total),
  ]);
  if (data.shipping && data.shipping.total > 0) {
    rows.push([
      'Gastos de envío',
      formatCurrency(data.shipping.base),
      formatCurrency(data.shipping.vatAmount),
      formatCurrency(data.shipping.total),
    ]);
  }

  renderLineItems(doc, {
    columns: ['Concepto', 'Base imponible', 'IVA 21%', 'Total'],
    colWidths: [col1, col2, col3, col4],
    colAligns: ['left', 'right', 'right', 'right'],
    rows,
  });

  renderTotals(doc, [
    { label: 'Base imponible', value: formatCurrency(data.totals.base) },
    { label: 'IVA 21%', value: formatCurrency(data.totals.vatAmount) },
    { label: 'Total', value: formatCurrency(data.totals.total), bold: true },
  ]);

  renderFooter(doc, [
    `${data.issuer.name} · ${data.issuer.taxId || ''} · ${data.issuer.email || ''}`,
  ]);

  return doc;
}

/**
 * Generate a commission invoice (Series C) — gallery → artist.
 *
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {string} data.date
 * @param {object} data.issuer       — gallery
 * @param {object} data.recipient    — artist
 * @param {Array<{description: string, base: number, vatAmount: number, total: number}>} data.items
 * @param {{base: number, vatAmount: number, total: number}} data.totals
 * @returns {PDFDocument}
 */
function generateCommissionPdf(data) {
  const doc = createDocument();

  renderHeader(doc, {
    documentType: 'FACTURA DE COMISIÓN',
    invoiceNumber: data.invoiceNumber,
    date: data.date,
  });

  renderParties(doc, data.issuer, { ...data.recipient, label: 'ARTISTA / VENDEDOR' });

  const col1 = CONTENT_WIDTH - 270;
  const col2 = 90;
  const col3 = 90;
  const col4 = 90;
  const rows = data.items.map((item) => [
    item.description,
    formatCurrency(item.base),
    formatCurrency(item.vatAmount),
    formatCurrency(item.total),
  ]);

  renderLineItems(doc, {
    columns: ['Concepto', 'Base imponible', 'IVA 21%', 'Total'],
    colWidths: [col1, col2, col3, col4],
    colAligns: ['left', 'right', 'right', 'right'],
    rows,
  });

  renderTotals(doc, [
    { label: 'Base imponible', value: formatCurrency(data.totals.base) },
    { label: 'IVA 21%', value: formatCurrency(data.totals.vatAmount) },
    { label: 'Total', value: formatCurrency(data.totals.total), bold: true },
  ]);

  renderFooter(doc, [
    `${data.issuer.name} · ${data.issuer.taxId || ''} · ${data.issuer.email || ''}`,
  ]);

  return doc;
}

/**
 * Generate a REBU settlement note (Series L) — internal document.
 *
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {string} data.date
 * @param {object} data.issuer
 * @param {Array<{description: string, salePrice: number, costPrice: number, margin: number, base: number, vatEmbedded: number}>} data.items
 * @param {{totalMargin: number, totalBase: number, totalVat: number}} data.totals
 * @returns {PDFDocument}
 */
function generateSettlementNotePdf(data) {
  const doc = createDocument();

  renderHeader(doc, {
    documentType: 'NOTA DE LIQUIDACIÓN INTERNA',
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    disclaimer: 'Documento interno de liquidación — no constituye factura',
  });

  // Only issuer (no recipient on settlement notes)
  const issuerStartY = doc.y;
  doc.font(fontBold()).fontSize(8).fillColor(COLOR_MUTED)
    .text('EMISOR', PAGE_MARGIN, issuerStartY, { width: CONTENT_WIDTH });
  doc.font(fontBold()).fontSize(10).fillColor(COLOR_TEXT)
    .text(data.issuer.name, PAGE_MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
  if (data.issuer.taxId) {
    doc.font(fontRegular()).fontSize(9).fillColor(COLOR_TEXT)
      .text(`NIF/CIF: ${data.issuer.taxId}`, PAGE_MARGIN, doc.y + 1);
  }
  doc.y += 12;
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(A4_WIDTH - PAGE_MARGIN, doc.y)
    .strokeColor(COLOR_LINE).lineWidth(0.5).stroke();
  doc.y += 12;

  // 6-column table for margin breakdown
  const cw = [CONTENT_WIDTH - 450, 90, 90, 90, 90, 90];
  const rows = data.items.map((item) => [
    item.description,
    formatCurrency(item.salePrice),
    formatCurrency(item.costPrice),
    formatCurrency(item.margin),
    formatCurrency(item.base),
    formatCurrency(item.vatEmbedded),
  ]);

  renderLineItems(doc, {
    columns: ['Concepto', 'Venta', 'Coste', 'Margen', 'Base', 'IVA embebido'],
    colWidths: cw,
    colAligns: ['left', 'right', 'right', 'right', 'right', 'right'],
    rows,
  });

  renderTotals(doc, [
    { label: 'Margen total', value: formatCurrency(data.totals.totalMargin) },
    { label: 'Base imponible', value: formatCurrency(data.totals.totalBase) },
    { label: 'IVA embebido (21%)', value: formatCurrency(data.totals.totalVat), bold: true },
  ]);

  renderFooter(doc, [
    'Documento interno de liquidación — no constituye factura',
    'Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección',
    `${data.issuer.name} · ${data.issuer.taxId || ''}`,
  ]);

  return doc;
}

module.exports = {
  generateBuyerRebuPdf,
  generateBuyerStandardPdf,
  generateCommissionPdf,
  generateSettlementNotePdf,
  // Exposed for testing
  formatCurrency,
  formatDate,
  round2,
};
