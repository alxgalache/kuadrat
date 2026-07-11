/**
 * Unit tests for the art VAT regime derivation helper
 * (Change: per-seller-vat-rates).
 */
const { REBU_ART_VAT_RATE, artVatRegimeForRate } = require('../utils/vatRegime');

describe('vatRegime', () => {
  it('exposes the reduced REBU rate constant', () => {
    expect(REBU_ART_VAT_RATE).toBe(10);
  });

  describe('artVatRegimeForRate', () => {
    it('returns art_rebu for the reduced 10% rate', () => {
      expect(artVatRegimeForRate(10)).toBe('art_rebu');
    });

    it('returns art_rebu for the string "10" (Number coercion)', () => {
      expect(artVatRegimeForRate('10')).toBe('art_rebu');
    });

    it('returns standard_vat for 21 (cooperativa)', () => {
      expect(artVatRegimeForRate(21)).toBe('standard_vat');
    });

    it('returns standard_vat for 0', () => {
      expect(artVatRegimeForRate(0)).toBe('standard_vat');
    });

    it('returns standard_vat for any other rate (e.g. 15)', () => {
      expect(artVatRegimeForRate(15)).toBe('standard_vat');
    });

    it('returns standard_vat for null (safe fiscal default)', () => {
      expect(artVatRegimeForRate(null)).toBe('standard_vat');
    });

    it('returns standard_vat for undefined (safe fiscal default)', () => {
      expect(artVatRegimeForRate(undefined)).toBe('standard_vat');
    });
  });
});
