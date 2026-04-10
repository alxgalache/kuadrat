/**
 * VAT calculator — Change #2: stripe-connect-manual-payouts
 *
 * Pure functions that split a single order item into the four figures the
 * payouts flow needs:
 *
 *   - sellerEarning → the net amount the artist will receive (price - commission)
 *   - taxableBase   → the base imponible of the platform's invoice/self-billing
 *   - vatRate       → 0.10 (REBU) or 0.21 (standard)
 *   - vatAmount     → the VAT the platform owes to the tax authority
 *
 * Two regimes are supported:
 *
 *   - REBU 10% (art):
 *       The platform's margin = commission. The commission already contains
 *       VAT included; we extract it at 10%. Seller earning is untouched.
 *
 *   - Standard 21% (others / events):
 *       The commission is what the platform bills back to the seller. It is
 *       stored VAT-included, so we extract the 21% VAT from it. Seller
 *       earning is untouched.
 *
 * In both regimes the seller earning does NOT include the VAT — VAT is part
 * of the commission the platform retains. See design.md §3 for the fiscal
 * rationale.
 *
 * Money is handled as floats (euros) to stay consistent with the rest of the
 * codebase (`price_at_purchase`, `commission_amount`, `available_withdrawal`
 * are all REAL columns). All results are rounded to two decimals to avoid
 * floating-point drift creeping into the `withdrawal_items` rows.
 */

const VAT_RATE_REBU = 0.10;
const VAT_RATE_STANDARD = 0.21;

/**
 * Round to two decimals using half-away-from-zero (JS default is half-to-even
 * only for some numbers — `Math.round` already does half-away-from-zero).
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * REBU 10% (Régimen Especial de Bienes Usados) — used for art sales.
 *
 * @param {object} args
 * @param {number} args.price       - Item price paid by the buyer (€).
 * @param {number} args.commission  - Platform commission on this item (€, VAT-included).
 * @returns {{sellerEarning:number, taxableBase:number, vatRate:number, vatAmount:number}}
 */
function computeRebuVat({ price, commission }) {
  const p = Number(price) || 0;
  const c = Number(commission) || 0;

  const sellerEarning = round2(p - c);
  const taxableBase = round2(c / (1 + VAT_RATE_REBU));
  const vatAmount = round2(c - taxableBase);

  return {
    sellerEarning,
    taxableBase,
    vatRate: VAT_RATE_REBU,
    vatAmount,
  };
}

/**
 * Standard 21% VAT — used for other products and events.
 *
 * @param {object} args
 * @param {number} args.price       - Item price paid by the buyer (€).
 * @param {number} args.commission  - Platform commission on this item (€, VAT-included).
 * @returns {{sellerEarning:number, taxableBase:number, vatRate:number, vatAmount:number}}
 */
function computeStandardVat({ price, commission }) {
  const p = Number(price) || 0;
  const c = Number(commission) || 0;

  const sellerEarning = round2(p - c);
  const taxableBase = round2(c / (1 + VAT_RATE_STANDARD));
  const vatAmount = round2(c - taxableBase);

  return {
    sellerEarning,
    taxableBase,
    vatRate: VAT_RATE_STANDARD,
    vatAmount,
  };
}

module.exports = {
  computeRebuVat,
  computeStandardVat,
  VAT_RATE_REBU,
  VAT_RATE_STANDARD,
};
