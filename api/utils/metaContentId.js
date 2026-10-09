/**
 * Identifier of a product in the Meta catalogue: `art_<id>` for an artwork,
 * `other_<id>_v<variantId>` for a variant of a store product, and
 * `other_<id>` for the product itself (its `item_group_id`).
 *
 * The Meta Pixel and the Conversions API already identify products this way:
 * `contentId()` in client/lib/metaPixel.js is the counterpart of this function,
 * and the two apps share no code. The catalogue has to use the very same ids,
 * or Meta matches no event to any item. They also come back to the site in the
 * checkout URL (`/cesta?products=<id>:<qty>`), which parses them on the client.
 *
 * Both definitions change together or not at all: a different format means a
 * new catalogue in Meta, and every product tag on Instagram is lost with the
 * old items. Numeric ids, and not slugs, because a slug changes when a product
 * is renamed.
 *
 * @param {'art'|'other'} productType
 * @param {number} productId
 * @param {number|null} [variantId]
 * @returns {string}
 */
function contentId(productType, productId, variantId = null) {
  const base = `${productType}_${productId}`
  return variantId ? `${base}_v${variantId}` : base
}

module.exports = { contentId }
