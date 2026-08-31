'use strict';

/**
 * Spanish natural-person tax id (NIF) validation — DNI and NIE.
 *
 * The check digit is a modulo-23 lookup, not a format: `12345678A` matches
 * every DNI regex ever written and is not a DNI. Validating the letter is what
 * turns a typo into a rejected form instead of a wrong NIF frozen into an
 * invoice.
 *
 *   DNI — 8 digits + letter               → 12345678Z
 *   NIE — X|Y|Z + 7 digits + letter       → X1234567L
 *         (the prefix is replaced by 0|1|2 before the modulo)
 *
 * Legal-entity CIFs (`B12345678`) are DELIBERATELY rejected here. This module
 * answers "who is the buyer" for a cart checkout, where the decision was to
 * accept individuals only. `api/validators/fiscalSchemas.js` answers a
 * different question — the SELLER's fiscal identity, where a company is
 * legitimate — and keeps its own, format-only, CIF-accepting rules. Do not
 * merge the two.
 *
 * MIRRORED IN `client/lib/spanishTaxId.js`. The monorepo has no shared package
 * and the two apps build into separate images, so the algorithm exists twice on
 * purpose; any change here must be applied there. Same arrangement as
 * `fiscalSchemas.js` ↔ `client/components/admin/SellerFiscalForm.js`.
 */

const CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

const DNI_PATTERN = /^(\d{8})([A-Z])$/;
const NIE_PATTERN = /^([XYZ])(\d{7})([A-Z])$/;
const NIE_PREFIX_DIGIT = { X: '0', Y: '1', Z: '2' };

/**
 * Normalize a tax id for storage and comparison: trimmed and upper-cased.
 * Returns '' for anything that is not a string, so callers can treat the
 * result as a string unconditionally.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeSpanishTaxId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

/**
 * Validate a Spanish DNI or NIE, check digit included.
 *
 * @param {*} value
 * @returns {boolean}
 */
function validateSpanishTaxId(value) {
  const normalized = normalizeSpanishTaxId(value);
  if (!normalized) return false;

  const nie = normalized.match(NIE_PATTERN);
  if (nie) {
    const number = parseInt(NIE_PREFIX_DIGIT[nie[1]] + nie[2], 10);
    return nie[3] === CONTROL_LETTERS[number % 23];
  }

  const dni = normalized.match(DNI_PATTERN);
  if (dni) {
    const number = parseInt(dni[1], 10);
    return dni[2] === CONTROL_LETTERS[number % 23];
  }

  return false;
}

module.exports = {
  validateSpanishTaxId,
  normalizeSpanishTaxId,
};
