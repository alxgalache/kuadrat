/**
 * Unit tests for the fiscal report formatter
 * (Change #4: stripe-connect-fiscal-report).
 *
 * Only the pure helpers are tested here — the data loaders (`buildPayoutReport`,
 * `buildRangeReport`) hit the database and are covered by manual testing in
 * pre (Phase 9).
 */
const {
  inferInvoicingMode,
  csvEscape,
  csvRow,
  formatMoneyEs,
  formatDateEs,
  formatDateTimeEs,
} = require('../utils/fiscalReportFormatter');

describe('fiscalReportFormatter', () => {
  describe('inferInvoicingMode', () => {
    it('returns error for particular (no longer supported)', () => {
      const result = inferInvoicingMode({
        tax_status: 'particular',
      });
      expect(result.mode).toBe('error');
      expect(result.explanation).toMatch(/desconocido/i);
    });

    it('returns factura_recibida for autonomo', () => {
      const result = inferInvoicingMode({ tax_status: 'autonomo' });
      expect(result.mode).toBe('factura_recibida');
      expect(result.explanation).toMatch(/autónomo/i);
      expect(result.explanation).toMatch(/parte de la venta/);
    });

    it('returns factura_recibida for sociedad', () => {
      const result = inferInvoicingMode({ tax_status: 'sociedad' });
      expect(result.mode).toBe('factura_recibida');
      expect(result.explanation).toMatch(/sociedad/i);
      expect(result.explanation).toMatch(/parte de la venta/);
    });

    it('returns error when user is null', () => {
      const result = inferInvoicingMode(null);
      expect(result.mode).toBe('error');
      expect(result.explanation).toMatch(/incompletos/i);
    });

    it('returns error when tax_status is missing', () => {
      const result = inferInvoicingMode({ tax_status: null });
      expect(result.mode).toBe('error');
    });

    it('returns error for unknown tax_status', () => {
      const result = inferInvoicingMode({ tax_status: 'extranjero' });
      expect(result.mode).toBe('error');
      expect(result.explanation).toMatch(/extranjero/);
    });
  });

  describe('csvEscape', () => {
    it('returns empty string for null/undefined', () => {
      expect(csvEscape(null)).toBe('');
      expect(csvEscape(undefined)).toBe('');
      expect(csvEscape('')).toBe('');
    });

    it('passes plain text through unchanged', () => {
      expect(csvEscape('hola mundo')).toBe('hola mundo');
      expect(csvEscape(42)).toBe('42');
    });

    it('quotes fields containing the separator', () => {
      expect(csvEscape('a;b')).toBe('"a;b"');
    });

    it('quotes and doubles inner quotes', () => {
      expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes fields containing newlines or CR', () => {
      expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
      expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
    });
  });

  describe('csvRow', () => {
    it('joins escaped fields with `;`', () => {
      expect(csvRow(['a', 'b', 'c'])).toBe('a;b;c');
    });

    it('quotes individual fields that need it', () => {
      expect(csvRow(['a', 'b;c', 'd'])).toBe('a;"b;c";d');
    });
  });

  describe('formatMoneyEs', () => {
    it('formats integers with 2 decimals and comma', () => {
      expect(formatMoneyEs(210)).toBe('210,00');
    });

    it('formats decimals with comma', () => {
      expect(formatMoneyEs(210.5)).toBe('210,50');
      expect(formatMoneyEs(3.14159)).toBe('3,14');
    });

    it('rounds half away from zero', () => {
      expect(formatMoneyEs(0.005)).toBe('0,01');
    });

    it('handles negatives', () => {
      expect(formatMoneyEs(-3.14)).toBe('-3,14');
    });

    it('coerces null/undefined/strings safely', () => {
      expect(formatMoneyEs(null)).toBe('0,00');
      expect(formatMoneyEs(undefined)).toBe('0,00');
      expect(formatMoneyEs('12.5')).toBe('12,50');
    });
  });

  describe('formatDateEs', () => {
    it('formats an ISO UTC timestamp in Europe/Madrid', () => {
      // 2026-04-10T00:15:00Z → 2026-04-10 02:15 CEST (Europe/Madrid UTC+2 in April)
      expect(formatDateEs('2026-04-10T00:15:00Z')).toBe('10/04/2026');
    });

    it('formats a UTC timestamp that would roll to next day in Madrid', () => {
      // 2026-04-10T23:30:00Z → 2026-04-11 01:30 CEST
      expect(formatDateEs('2026-04-10T23:30:00Z')).toBe('11/04/2026');
    });

    it('handles SQLite format (no T, no Z) as UTC', () => {
      expect(formatDateEs('2026-04-10 00:15:00')).toBe('10/04/2026');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatDateEs(null)).toBe('');
      expect(formatDateEs(undefined)).toBe('');
      expect(formatDateEs('')).toBe('');
    });
  });

  describe('formatDateTimeEs', () => {
    it('formats ISO to DD/MM/YYYY HH:MM in Europe/Madrid', () => {
      // April → CEST (UTC+2). 09:15Z → 11:15 local.
      expect(formatDateTimeEs('2026-04-10T09:15:00Z')).toBe('10/04/2026 11:15');
    });

    it('handles SQLite format as UTC', () => {
      expect(formatDateTimeEs('2026-04-10 09:15:00')).toBe('10/04/2026 11:15');
    });
  });
});
