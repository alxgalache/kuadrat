'use strict';

/**
 * Fiscal regime derivation for art sales.
 *
 * Two regimes exist platform-wide:
 *   - 'art_rebu'     — the author invoices the reduced 10% VAT rate as the
 *                      original creator, and the gallery may apply the REBU
 *                      (margin) scheme on resale.
 *   - 'standard_vat' — the sale is invoiced under the general regime (21%),
 *                      e.g. artists who invoice through a cooperative, where
 *                      the author is not the invoice issuer and REBU cannot
 *                      apply.
 *
 * The regime for an art sale is DERIVED from the seller's configured
 * `tax_vat_art` rate — there is no separate flag. Only a sale invoiced at the
 * reduced 10% rate gives the right to REBU; any other value → standard.
 *
 * `other` products and events are always 'standard_vat' and never call this.
 */

const REBU_ART_VAT_RATE = 10;

/**
 * Derive the fiscal regime for an art sale from the seller's art VAT rate.
 *
 * @param {number|string|null|undefined} rate - the seller's tax_vat_art
 * @returns {'art_rebu'|'standard_vat'}
 *
 * Decision: only an exact 10 (numeric, so the string '10' also matches via
 * Number()) yields 'art_rebu'. null / undefined / NaN → 'standard_vat', the
 * safe fiscal default (the general regime never under-declares VAT). Note that
 * callers persist a snapshot at sale time and read it back with
 * COALESCE(vat_regime, 'art_rebu'); this helper only governs the derivation
 * from a live rate, not the historical default.
 */
function artVatRegimeForRate(rate) {
  return Number(rate) === REBU_ART_VAT_RATE ? 'art_rebu' : 'standard_vat';
}

module.exports = { REBU_ART_VAT_RATE, artVatRegimeForRate };
