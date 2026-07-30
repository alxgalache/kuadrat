/**
 * Unit tests for the regime-aware art commission split
 * (Change: standard-vat-art-commission).
 *
 * Pure function — tested in isolation. The standard_vat figures are pinned to
 * the cooperative reference model in
 * docs/fiscalidad_cooperativa/140d-esquema-iva-cooperativa-desde-PVP.html.
 */
const { artCommissionAmount } = require('../utils/artCommission');
const { computeStandardVat } = require('../utils/vatCalculator');

describe('artCommissionAmount', () => {
  describe('art_rebu (flat split, pre-existing behavior)', () => {
    it('matches price × c for the 320 / 25% reference case', () => {
      const commission = artCommissionAmount({ price: 320, commissionRate: 25, vatRegime: 'art_rebu' });
      expect(commission).toBe(80.0);
    });

    it('rounds the flat split to 2 decimals', () => {
      // 123.45 × 0.25 = 30.8625 → 30.86
      const commission = artCommissionAmount({ price: 123.45, commissionRate: 25, vatRegime: 'art_rebu' });
      expect(commission).toBe(30.86);
    });
  });

  describe('standard_vat (cooperative split, margin grossed up by 21%)', () => {
    it('stores 96.86 for the PVP 337 / 25% reference case (artist 240.14)', () => {
      const commission = artCommissionAmount({ price: 337, commissionRate: 25, vatRegime: 'standard_vat' });
      expect(commission).toBe(96.86);
      expect(337 - commission).toBe(240.14);
    });

    it('honors a different commission rate (no hardcoded 75/25 split)', () => {
      // 337 × 0.70 / 1.063 = 221.919... → artist 221.92, commission 115.08
      const commission = artCommissionAmount({ price: 337, commissionRate: 30, vatRegime: 'standard_vat' });
      expect(commission).toBe(115.08);
      expect(337 - commission).toBeCloseTo(221.92, 2);
    });

    it('keeps the split identity artistGross + commission = price', () => {
      const cases = [
        { price: 337, commissionRate: 25 },
        { price: 337, commissionRate: 30 },
        { price: 1000, commissionRate: 25 },
        { price: 123.45, commissionRate: 17.5 },
        { price: 10, commissionRate: 25 },
      ];
      for (const { price, commissionRate } of cases) {
        const commission = artCommissionAmount({ price, commissionRate, vatRegime: 'standard_vat' });
        const artistGross = Math.round((price - commission) * 100) / 100;
        expect(Math.round((artistGross + commission) * 100) / 100).toBe(price);
      }
    });

    it('decomposes at withdrawal time into margin base 80.05 + VAT 16.81', () => {
      // Sale-time and withdrawal-time share the same margin VAT rate, so
      // computeStandardVat recovers the reference figures exactly.
      const commission = artCommissionAmount({ price: 337, commissionRate: 25, vatRegime: 'standard_vat' });
      const result = computeStandardVat({ price: 337, commission });
      expect(result.sellerEarning).toBe(240.14);
      expect(result.taxableBase).toBe(80.05);
      expect(result.vatAmount).toBe(16.81);
    });
  });

  describe('defensive inputs', () => {
    it('treats missing price or rate as 0', () => {
      expect(artCommissionAmount({ price: null, commissionRate: 25, vatRegime: 'art_rebu' })).toBe(0);
      expect(artCommissionAmount({ price: 320, commissionRate: null, vatRegime: 'standard_vat' })).toBe(0);
    });
  });
});
