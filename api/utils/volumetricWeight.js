/**
 * Volumetric weight for a parcel whose box we do not know.
 *
 * Carriers bill the greater of a parcel's real weight and its volumetric
 * weight. Sendcloud applies that rule itself — measured against the live API, a
 * parcel of 1,2 kg declared as 60x60x60 cm was quoted as 36 kg (216000/6000)
 * and its price went from 5,06 € to 39,48 € — but only on the `dimensions` it
 * receives, and the co-packed store parcel sends none: `parcelGrouper` cannot
 * know the shape of a box holding several different products.
 *
 * So for that one parcel we compute the volume ourselves and carry it INSIDE
 * the weight. The rule that comes with it, and that will break whoever forgets
 * it: **a parcel carries either a volumetric-adjusted weight or its
 * dimensions, never both**. Sendcloud would apply its own volumetric
 * calculation on top of an already-inflated weight and bill the volume twice.
 * Single-item parcels therefore keep sending real weight plus real dimensions
 * and let Sendcloud do it, which is strictly better: it uses each carrier's own
 * divisor and enforces that carrier's size limits.
 *
 * ## Why the divisor is 5000 and not the 6000 Sendcloud uses
 *
 * Summing the volume of each item is the FLOOR of any real box: a box holding
 * them all occupies at least that, plus the void space we have no way to
 * estimate. That bias points down. A smaller divisor yields a larger volumetric
 * weight, which points up. 5000 — the divisor DHL, UPS and GLS use — makes the
 * two biases cancel rather than accumulate, and picks the safe direction for
 * the error: charging the buyer slightly more beats losing money on every
 * shipment.
 */

const VOLUMETRIC_DIVISOR = 5000

/**
 * Volumetric weight in GRAMS for a `LxWxH` centimetre string.
 *
 * Returns 0 for an absent or malformed value, so a product without dimensions
 * contributes nothing and its parcel falls back to real weight alone. The unit
 * is grams because that is what `others.weight` and `art.weight` store and what
 * `buildParcels` divides by 1000 on its way out.
 *
 * @param {string|null} dimensions - e.g. `'30x30x4'`.
 * @returns {number} Grams, or 0 when the value cannot be parsed.
 */
function volumetricGrams(dimensions) {
  if (!dimensions || typeof dimensions !== 'string') return 0

  const parts = dimensions.split('x').map(Number)
  if (parts.length !== 3 || !parts.every(n => Number.isFinite(n) && n > 0)) return 0

  // cm³ / divisor gives kilograms; × 1000 gives grams.
  const [length, width, height] = parts
  return Math.round((length * width * height * 1000) / VOLUMETRIC_DIVISOR)
}

/**
 * The weight to declare for a parcel holding `items`, in grams: the greater of
 * the summed real weight and the summed volumetric weight, each multiplied by
 * its item's quantity.
 *
 * @param {object[]} items - `{ weight, dimensions, quantity }`, weight in grams.
 * @returns {{ weight: number, realWeight: number, volumetricWeight: number }}
 */
function parcelWeightGrams(items) {
  let realWeight = 0
  let volumetricWeight = 0

  for (const item of items) {
    const quantity = item.quantity || 1
    realWeight += (item.weight || 0) * quantity
    volumetricWeight += volumetricGrams(item.dimensions) * quantity
  }

  return {
    weight: Math.max(realWeight, volumetricWeight),
    realWeight,
    volumetricWeight,
  }
}

module.exports = { volumetricGrams, parcelWeightGrams, VOLUMETRIC_DIVISOR }
