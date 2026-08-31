/**
 * The buyer's NIF on the two buyer invoices (Series A REBU and Series P).
 * (Change: checkout-buyer-tax-id)
 *
 * `pdfGenerator.renderParties()` already knew how to print a "NIF/CIF" line —
 * it renders `recipient.taxId` when present. What was missing was the data:
 * neither buyer invoice passed it, because `orders` had no column for it.
 *
 * The second half of each pair matters as much as the first: an order created
 * before the tax id was collected has `dni = NULL`, and it must still produce
 * an invoice. Requiring the NIF in `validateBuyerInvoicingData` would turn
 * every historical order into a 400.
 */

const mockExecute = jest.fn();
jest.mock('../config/database', () => ({
  db: { execute: (...args) => mockExecute(...args) },
}));
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../config/env', () => ({
  business: {
    legalName: 'Test Gallery',
    taxId: 'B12345678',
    address: {
      line1: 'Calle Test 1',
      postalCode: '28001',
      city: 'Madrid',
      province: 'Madrid',
      country: 'ES',
    },
  },
  assertBusinessConfigComplete: () => [],
}));

const mockGenerateBuyerRebuPdf = jest.fn().mockReturnValue('rebu-pdf');
const mockGenerateBuyerStandardPdf = jest.fn().mockReturnValue('standard-pdf');
jest.mock('../services/pdfGenerator', () => ({
  round2: (n) => Math.round(n * 100) / 100,
  generateBuyerRebuPdf: (...args) => mockGenerateBuyerRebuPdf(...args),
  generateBuyerStandardPdf: (...args) => mockGenerateBuyerStandardPdf(...args),
  generateCommissionPdf: jest.fn(),
  generateSettlementNotePdf: jest.fn(),
}));

const invoiceService = require('../services/invoiceService');

const baseOrder = {
  id: 1050,
  full_name: 'Ana Ruiz',
  email: 'ana@example.com',
  guest_email: null,
  invoicing_address_line_1: 'Calle Cliente 10',
  invoicing_address_line_2: null,
  invoicing_postal_code: '08001',
  invoicing_city: 'Barcelona',
  invoicing_province: 'Barcelona',
  invoicing_country: 'ES',
};

const artItem = {
  art_id: 7,
  art_name: 'Paisaje',
  price_at_purchase: 500,
  shipping_cost: 15,
  vat_regime: 'art_rebu',
};

const standardArtItem = { ...artItem, vat_regime: 'standard_vat', price_at_purchase: 605 };

const otherItem = {
  other_id: 3,
  other_name: 'Cerámica',
  variant_key: null,
  price_at_purchase: 121,
  shipping_cost: 12.1,
};

/**
 * Route each query the service makes to a canned result. Matching on the SQL
 * keeps the double independent of call order, so adding a query to the service
 * does not silently shift the fixtures onto the wrong statements.
 */
function primeDb({ order, artItems = [], otherItems = [] }) {
  mockExecute.mockImplementation(({ sql }) => {
    if (sql.includes('FROM orders')) return { rows: [order] };
    if (sql.includes('FROM art_order_items')) return { rows: artItems };
    if (sql.includes('FROM other_order_items')) return { rows: otherItems };
    if (sql.includes('SELECT invoice_number FROM invoices')) return { rows: [] };
    if (sql.includes('MAX(sequence)')) return { rows: [{ max_seq: 0 }] };
    if (sql.includes('INSERT INTO invoices')) return { rows: [] };
    throw new Error(`Unexpected query in test: ${sql}`);
  });
}

describe('buyer invoices carry the buyer NIF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateBuyerRebuPdf.mockReturnValue('rebu-pdf');
    mockGenerateBuyerStandardPdf.mockReturnValue('standard-pdf');
  });

  describe('REBU invoice (Series A)', () => {
    it('passes the order dni as the recipient taxId', async () => {
      primeDb({ order: { ...baseOrder, dni: '12345678Z' }, artItems: [artItem] });

      await invoiceService.generateBuyerRebuInvoice(1050);

      const { recipient } = mockGenerateBuyerRebuPdf.mock.calls[0][0];
      expect(recipient.taxId).toBe('12345678Z');
      expect(recipient.name).toBe('Ana Ruiz');
    });

    it('omits the taxId for an order predating the buyer tax id', async () => {
      primeDb({ order: { ...baseOrder, dni: null }, artItems: [artItem] });

      await expect(invoiceService.generateBuyerRebuInvoice(1050)).resolves.toBe('rebu-pdf');

      const { recipient } = mockGenerateBuyerRebuPdf.mock.calls[0][0];
      expect(recipient.taxId).toBeUndefined();
    });
  });

  describe('Standard invoice (Series P)', () => {
    it('passes the order dni as the recipient taxId', async () => {
      primeDb({ order: { ...baseOrder, dni: 'X1234567L' }, otherItems: [otherItem] });

      await invoiceService.generateBuyerStandardInvoice(1060);

      const { recipient } = mockGenerateBuyerStandardPdf.mock.calls[0][0];
      expect(recipient.taxId).toBe('X1234567L');
    });

    it('omits the taxId for an order predating the buyer tax id', async () => {
      primeDb({
        order: { ...baseOrder, dni: null },
        artItems: [standardArtItem],
      });

      await expect(invoiceService.generateBuyerStandardInvoice(1065)).resolves.toBe('standard-pdf');

      const { recipient } = mockGenerateBuyerStandardPdf.mock.calls[0][0];
      expect(recipient.taxId).toBeUndefined();
    });
  });

  it('does not make the NIF a precondition for invoicing', async () => {
    // The invoicing ADDRESS is still required — that check is untouched — but a
    // missing NIF must never be the thing that rejects an invoice.
    primeDb({ order: { ...baseOrder, dni: null }, artItems: [artItem] });
    await expect(invoiceService.generateBuyerRebuInvoice(1050)).resolves.toBeDefined();

    primeDb({
      order: { ...baseOrder, dni: null, invoicing_address_line_1: null },
      artItems: [artItem],
    });
    await expect(invoiceService.generateBuyerRebuInvoice(1050)).rejects.toThrow(
      'Faltan datos de facturación del comprador'
    );
  });
});
