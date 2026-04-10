/**
 * Unit tests for the VAT calculator helper
 * (Change #2: stripe-connect-manual-payouts).
 *
 * The calculator is a pure function, so we test it in isolation without any
 * database or HTTP layer.
 */
const {
  computeRebuVat,
  computeStandardVat,
  VAT_RATE_REBU,
  VAT_RATE_STANDARD,
} = require('../utils/vatCalculator');

describe('vatCalculator', () => {
  describe('computeRebuVat (10% REBU, art)', () => {
    it('splits an integer-priced art sale correctly', () => {
      // price 1000€, commission 100€ → platform margin = 100€
      // taxableBase = 100 / 1.10 = 90.91
      // vatAmount = 100 - 90.91 = 9.09
      // sellerEarning = 1000 - 100 = 900
      const result = computeRebuVat({ price: 1000, commission: 100 });
      expect(result.sellerEarning).toBe(900);
      expect(result.taxableBase).toBe(90.91);
      expect(result.vatRate).toBe(VAT_RATE_REBU);
      expect(result.vatAmount).toBe(9.09);
    });

    it('handles decimals without floating-point drift', () => {
      // price 123.45€, commission 12.34€
      // sellerEarning = 111.11
      // taxableBase = 12.34 / 1.10 = 11.2181… → 11.22
      // vatAmount = 12.34 - 11.22 = 1.12
      const result = computeRebuVat({ price: 123.45, commission: 12.34 });
      expect(result.sellerEarning).toBe(111.11);
      expect(result.taxableBase).toBe(11.22);
      expect(result.vatAmount).toBe(1.12);
      expect(result.vatRate).toBe(VAT_RATE_REBU);
    });

    it('produces zero taxable base and zero VAT when commission is zero', () => {
      const result = computeRebuVat({ price: 500, commission: 0 });
      expect(result.sellerEarning).toBe(500);
      expect(result.taxableBase).toBe(0);
      expect(result.vatAmount).toBe(0);
      expect(result.vatRate).toBe(VAT_RATE_REBU);
    });

    it('produces zero seller earning when commission equals price', () => {
      // Degenerate case: platform keeps everything.
      // taxableBase = 200 / 1.10 = 181.82
      // vatAmount = 200 - 181.82 = 18.18
      const result = computeRebuVat({ price: 200, commission: 200 });
      expect(result.sellerEarning).toBe(0);
      expect(result.taxableBase).toBe(181.82);
      expect(result.vatAmount).toBe(18.18);
    });
  });

  describe('computeStandardVat (21% standard, others/events)', () => {
    it('splits an integer-priced other sale correctly', () => {
      // price 121€, commission 21€ → taxableBase = 21/1.21 = 17.36, vat = 3.64
      const result = computeStandardVat({ price: 121, commission: 21 });
      expect(result.sellerEarning).toBe(100);
      expect(result.taxableBase).toBe(17.36);
      expect(result.vatAmount).toBe(3.64);
      expect(result.vatRate).toBe(VAT_RATE_STANDARD);
    });

    it('handles decimals without floating-point drift', () => {
      // price 99.99€, commission 9.99€ → seller 90
      // taxableBase = 9.99 / 1.21 = 8.2561… → 8.26
      // vatAmount = 9.99 - 8.26 = 1.73
      const result = computeStandardVat({ price: 99.99, commission: 9.99 });
      expect(result.sellerEarning).toBe(90);
      expect(result.taxableBase).toBe(8.26);
      expect(result.vatAmount).toBe(1.73);
    });

    it('produces zero taxable base and zero VAT when commission is zero', () => {
      const result = computeStandardVat({ price: 80, commission: 0 });
      expect(result.sellerEarning).toBe(80);
      expect(result.taxableBase).toBe(0);
      expect(result.vatAmount).toBe(0);
    });

    it('produces zero seller earning when commission equals price', () => {
      // taxableBase = 50 / 1.21 = 41.32, vatAmount = 8.68
      const result = computeStandardVat({ price: 50, commission: 50 });
      expect(result.sellerEarning).toBe(0);
      expect(result.taxableBase).toBe(41.32);
      expect(result.vatAmount).toBe(8.68);
    });
  });

  describe('input coercion', () => {
    it('treats missing/undefined fields as zero', () => {
      expect(computeRebuVat({})).toEqual({
        sellerEarning: 0,
        taxableBase: 0,
        vatRate: VAT_RATE_REBU,
        vatAmount: 0,
      });
      expect(computeStandardVat({})).toEqual({
        sellerEarning: 0,
        taxableBase: 0,
        vatRate: VAT_RATE_STANDARD,
        vatAmount: 0,
      });
    });
  });
});
