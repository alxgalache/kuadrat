'use strict';

/**
 * Regime-aware art commission split — Change: standard-vat-art-commission.
 *
 * Computes the `commission_amount` stored on `art_order_items` at sale time
 * (cart checkout, auction bid billing, draw billing). No backend code may
 * compute an art commission outside this helper.
 *
 * Two regimes (see api/utils/vatRegime.js for the derivation):
 *
 *   - 'art_rebu'     — flat split: commission = round2(price × c). The
 *                      gallery's 21% margin VAT lives INSIDE the commission
 *                      and is extracted at withdrawal time (computeRebuVat).
 *
 *   - 'standard_vat' — cooperative billing, REBU cannot apply. The gallery's
 *                      margin is grossed up by its own margin VAT V on TOP of
 *                      the artist's share:
 *                        artistGross = round2(price × (1 − c) / (1 + c × V))
 *                        commission  = price − artistGross
 *                      Reference case (docs/fiscalidad_cooperativa/
 *                      140d-esquema-iva-cooperativa-desde-PVP.html):
 *                      price 337, commission rate 25 → artist 240.14,
 *                      commission 96.86 (= margin base 80.05 + VAT 16.81,
 *                      recovered by computeStandardVat at withdrawal time).
 *
 * Rounding order is normative: the artist share is rounded FIRST and the
 * commission is obtained by difference, so `artistGross + commission ≡ price`
 * holds exactly and every downstream `price_at_purchase − commission_amount`
 * consumer (wallet credit, cancellation reversals, seller emails, withdrawal
 * lines) yields exactly the rounded artist share the publish form previewed.
 *
 * V is the platform's own margin VAT (general rate) shared with the
 * withdrawal-side extraction — NOT the seller's tax_vat_art, which only
 * discriminates the regime. Two standard_vat sellers with different
 * tax_vat_art values get the same gross-up. If the margin VAT ever needs to
 * vary, see design.md Decision 4 of this change (platform-level configurable
 * rate preferred; the owner's per-seller `tax_vat_*_gallery` idea is recorded
 * there and would additionally require a per-item snapshot at sale time).
 */

const { VAT_RATE_STANDARD } = require('./vatCalculator');

/** Half-away-from-zero rounding to 2 decimals, same as vatCalculator. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the commission the gallery retains on an art sale.
 *
 * @param {object} args
 * @param {number} args.price          - Sale price / PVP paid by the buyer (€).
 * @param {number} args.commissionRate - Seller's dealer_commission_art (whole percentage, e.g. 25).
 * @param {'art_rebu'|'standard_vat'} args.vatRegime - Regime derived from the seller's tax_vat_art.
 * @returns {number} commission_amount to store on the art_order_items row.
 */
function artCommissionAmount({ price, commissionRate, vatRegime }) {
  const p = Number(price) || 0;
  const c = (Number(commissionRate) || 0) / 100;

  if (vatRegime === 'standard_vat') {
    const artistGross = round2((p * (1 - c)) / (1 + c * VAT_RATE_STANDARD));
    return round2(p - artistGross);
  }
  return round2(p * c);
}

module.exports = { artCommissionAmount };
