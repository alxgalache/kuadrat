/**
 * Unit tests for the shared Spanish tax id validator
 * (Change: checkout-buyer-tax-id).
 *
 * The point of every case below is the CHECK DIGIT. A format-only regex passes
 * `12345678A`, and that value would then be frozen into `orders.dni` and
 * printed on an invoice. The letter is what separates a typo from a NIF.
 */
const {
  validateSpanishTaxId,
  normalizeSpanishTaxId,
} = require('../utils/spanishTaxId');

describe('spanishTaxId', () => {
  describe('validateSpanishTaxId — DNI', () => {
    it('accepts a DNI with the correct control letter', () => {
      expect(validateSpanishTaxId('12345678Z')).toBe(true);
    });

    it('rejects a DNI whose control letter is wrong', () => {
      expect(validateSpanishTaxId('12345678A')).toBe(false);
    });

    it('rejects the all-zeros DNI with a wrong letter', () => {
      // 0 % 23 === 0 → 'T'. 'X' is not it.
      expect(validateSpanishTaxId('00000000X')).toBe(false);
      expect(validateSpanishTaxId('00000000T')).toBe(true);
    });

    it('rejects a DNI with too few or too many digits', () => {
      expect(validateSpanishTaxId('1234567Z')).toBe(false);
      expect(validateSpanishTaxId('123456789Z')).toBe(false);
    });

    it('rejects a DNI with no letter', () => {
      expect(validateSpanishTaxId('12345678')).toBe(false);
    });
  });

  describe('validateSpanishTaxId — NIE', () => {
    it('accepts an X-prefixed NIE', () => {
      expect(validateSpanishTaxId('X1234567L')).toBe(true);
    });

    it('accepts a Y-prefixed NIE', () => {
      expect(validateSpanishTaxId('Y1234567X')).toBe(true);
    });

    it('accepts a Z-prefixed NIE', () => {
      expect(validateSpanishTaxId('Z7654321H')).toBe(true);
    });

    it('rejects a NIE whose control letter is wrong', () => {
      expect(validateSpanishTaxId('X1234567A')).toBe(false);
    });

    it('does not treat the prefix as interchangeable', () => {
      // Same digits and letter as the valid X-NIE, but Y maps to a different
      // number, so the letter no longer matches.
      expect(validateSpanishTaxId('Y1234567L')).toBe(false);
    });
  });

  describe('validateSpanishTaxId — normalization', () => {
    it('accepts lowercase with surrounding whitespace', () => {
      expect(validateSpanishTaxId('  12345678z  ')).toBe(true);
    });

    it('accepts a lowercase NIE', () => {
      expect(validateSpanishTaxId('x1234567l')).toBe(true);
    });

    it('does not tolerate inner separators', () => {
      expect(validateSpanishTaxId('12345678-Z')).toBe(false);
      expect(validateSpanishTaxId('1234 5678Z')).toBe(false);
    });
  });

  describe('validateSpanishTaxId — legal entities', () => {
    it('rejects a CIF, which is deliberately out of scope', () => {
      expect(validateSpanishTaxId('B12345678')).toBe(false);
      expect(validateSpanishTaxId('A58818501')).toBe(false);
    });
  });

  describe('validateSpanishTaxId — non-string input', () => {
    it('returns false without throwing', () => {
      expect(validateSpanishTaxId(null)).toBe(false);
      expect(validateSpanishTaxId(undefined)).toBe(false);
      expect(validateSpanishTaxId('')).toBe(false);
      expect(validateSpanishTaxId('   ')).toBe(false);
      expect(validateSpanishTaxId(12345678)).toBe(false);
      expect(validateSpanishTaxId({})).toBe(false);
      expect(validateSpanishTaxId([])).toBe(false);
    });
  });

  describe('normalizeSpanishTaxId', () => {
    it('trims and upper-cases', () => {
      expect(normalizeSpanishTaxId('  12345678z  ')).toBe('12345678Z');
    });

    it('returns an empty string for non-strings', () => {
      expect(normalizeSpanishTaxId(null)).toBe('');
      expect(normalizeSpanishTaxId(undefined)).toBe('');
      expect(normalizeSpanishTaxId(42)).toBe('');
    });
  });

  describe('the draw and auction services delegate to this module', () => {
    it('drawService.validateDNI behaves identically', () => {
      const drawService = require('../services/drawService');
      expect(drawService.validateDNI('12345678Z')).toBe(true);
      expect(drawService.validateDNI('12345678A')).toBe(false);
      expect(drawService.validateDNI('B12345678')).toBe(false);
    });

    it('auctionService.validateDNI behaves identically', () => {
      const auctionService = require('../services/auctionService');
      expect(auctionService.validateDNI('X1234567L')).toBe(true);
      expect(auctionService.validateDNI('X1234567A')).toBe(false);
      expect(auctionService.validateDNI(null)).toBe(false);
    });
  });
});
