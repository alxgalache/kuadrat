/**
 * Unit tests for PDF generation (pdfGenerator.js).
 * (Change #3: pdf-invoice-engine)
 *
 * Since pdfkit may not be installed locally (Docker environment),
 * we mock PDFKit and test that the generators call the correct
 * rendering sequence without errors.
 *
 * The round2 utility is tested directly as it's a pure function.
 *
 * Full PDF output verification (magic bytes, visual check) is done
 * via Task 8.3 manual verification inside the Docker container.
 */

// All mock variables must be prefixed with "mock" for jest.mock() factory scoping
const mockEnd = jest.fn();
const mockText = jest.fn().mockReturnThis();
const mockFont = jest.fn().mockReturnThis();
const mockFontSize = jest.fn().mockReturnThis();
const mockFillColor = jest.fn().mockReturnThis();
const mockMoveTo = jest.fn().mockReturnThis();
const mockLineTo = jest.fn().mockReturnThis();
const mockStroke = jest.fn().mockReturnThis();
const mockStrokeColor = jest.fn().mockReturnThis();
const mockLineWidth = jest.fn().mockReturnThis();
const mockMoveDown = jest.fn().mockReturnThis();
const mockRegisterFont = jest.fn().mockReturnThis();
const mockRect = jest.fn().mockReturnThis();
const mockFill = jest.fn().mockReturnThis();
const mockOpacity = jest.fn().mockReturnThis();
const mockPage = { width: 595.28, height: 841.89 };
const mockAddPage = jest.fn();
const mockPipe = jest.fn();
const mockWidthOfString = jest.fn().mockReturnValue(50);
const mockHeightOfString = jest.fn().mockReturnValue(12);

jest.mock('pdfkit', () => {
  const { PassThrough } = require('stream');
  return jest.fn().mockImplementation(() => {
    const mockStream = new PassThrough();
    mockStream.text = mockText;
    mockStream.font = mockFont;
    mockStream.fontSize = mockFontSize;
    mockStream.fillColor = mockFillColor;
    mockStream.moveTo = mockMoveTo;
    mockStream.lineTo = mockLineTo;
    mockStream.stroke = mockStroke;
    mockStream.strokeColor = mockStrokeColor;
    mockStream.lineWidth = mockLineWidth;
    mockStream.moveDown = mockMoveDown;
    mockStream.registerFont = mockRegisterFont;
    mockStream.rect = mockRect;
    mockStream.fill = mockFill;
    mockStream.opacity = mockOpacity;
    mockStream.page = mockPage;
    mockStream.y = 100;
    mockStream.x = 50;
    mockStream.end = () => { mockEnd(); mockStream.push(null); };
    mockStream.widthOfString = mockWidthOfString;
    mockStream.heightOfString = mockHeightOfString;
    mockStream.addPage = jest.fn().mockReturnValue(mockStream);
    mockStream.pipe = jest.fn().mockReturnValue(mockStream);
    return mockStream;
  });
}, { virtual: true });

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const pdfGenerator = require('../services/pdfGenerator');

// Shared fixtures
const issuer = {
  name: '140d Galería de Arte S.L.',
  taxId: 'B12345678',
  addressLine1: 'Calle Ficticia 42',
  postalCode: '28001',
  city: 'Madrid',
  province: 'Madrid',
  country: 'ES',
  email: 'admin@140d.es',
};

const recipient = {
  label: 'CLIENTE',
  name: 'Comprador Test',
  taxId: '12345678Z',
  addressLine1: 'Calle Cliente 10',
  postalCode: '08001',
  city: 'Barcelona',
  province: 'Barcelona',
  country: 'ES',
  email: 'buyer@test.com',
};

describe('pdfGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('round2', () => {
    it('rounds to 2 decimal places', () => {
      expect(pdfGenerator.round2(82.6446)).toBe(82.64);
      expect(pdfGenerator.round2(100)).toBe(100);
      expect(pdfGenerator.round2(0)).toBe(0);
      expect(pdfGenerator.round2(1.015)).toBe(1.01); // IEEE 754: 1.015 * 100 = 101.4999…
      expect(pdfGenerator.round2(99.999)).toBe(100);
    });

    it('handles negative numbers', () => {
      expect(pdfGenerator.round2(-1.005)).toBe(-1);
      expect(pdfGenerator.round2(-82.6446)).toBe(-82.64);
    });
  });

  describe('generateBuyerRebuPdf', () => {
    it('returns a doc stream without ending it (caller handles end)', () => {
      const doc = pdfGenerator.generateBuyerRebuPdf({
        invoiceNumber: 'A-2026-00001',
        date: '2026-01-15',
        issuer,
        recipient,
        items: [{ description: 'Obra: "Paisaje"', amount: 500 }],
        shippingCost: 15,
        total: 515,
      });

      expect(doc).toBeDefined();
      expect(mockEnd).not.toHaveBeenCalled();
      expect(mockText).toHaveBeenCalled();
    });
  });

  describe('generateBuyerStandardPdf', () => {
    it('returns a doc stream without ending it (caller handles end)', () => {
      const doc = pdfGenerator.generateBuyerStandardPdf({
        invoiceNumber: 'P-2026-00001',
        date: '2026-02-20',
        issuer,
        recipient,
        items: [{ description: 'Cerámica', base: 41.32, vatAmount: 8.68, total: 50 }],
        shipping: { base: 8.26, vatAmount: 1.74, total: 10 },
        totals: { base: 49.58, vatAmount: 10.42, total: 60 },
      });

      expect(doc).toBeDefined();
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });

  describe('generateCommissionPdf', () => {
    it('returns a doc stream without ending it (caller handles end)', () => {
      const doc = pdfGenerator.generateCommissionPdf({
        invoiceNumber: 'C-2026-00001',
        date: '2026-03-10',
        issuer,
        recipient: { ...recipient, label: 'ARTISTA' },
        items: [{ description: 'Comisión por intermediación', base: 8.26, vatAmount: 1.74, total: 10 }],
        totals: { base: 8.26, vatAmount: 1.74, total: 10 },
      });

      expect(doc).toBeDefined();
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });

  describe('generateSettlementNotePdf', () => {
    it('returns a doc stream without ending it (caller handles end)', () => {
      const doc = pdfGenerator.generateSettlementNotePdf({
        invoiceNumber: 'L-2026-00001',
        date: '2026-04-05',
        issuer,
        recipient: { ...recipient, label: 'ARTISTA' },
        items: [{ description: 'Obra: "Paisaje"', salePrice: 500, sellerEarning: 450, margin: 50, base: 41.32, vatAmount: 8.68 }],
        totals: { totalMargin: 50, base: 41.32, vatAmount: 8.68, sellerPayment: 450 },
      });

      expect(doc).toBeDefined();
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it('includes disclaimer in the rendered content', () => {
      pdfGenerator.generateSettlementNotePdf({
        invoiceNumber: 'L-2026-00002',
        date: '2026-04-06',
        issuer,
        recipient: { ...recipient, label: 'ARTISTA' },
        items: [{ description: 'Obra test', salePrice: 100, sellerEarning: 90, margin: 10, base: 8.26, vatAmount: 1.74 }],
        totals: { totalMargin: 10, base: 8.26, vatAmount: 1.74, sellerPayment: 90 },
      });

      // The disclaimer text should appear in doc.text() calls
      const textCalls = mockText.mock.calls.map(c => c[0]);
      expect(textCalls.some(t => typeof t === 'string' && t.includes('no constituye factura'))).toBe(true);
    });
  });
});
