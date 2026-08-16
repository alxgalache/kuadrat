/**
 * The single resolver of legacy shipping zones.
 *
 * "Which zone applies to this product, shipped to this address?" used to be
 * answered in three places, with three different answers:
 *
 *   1. `shippingController.getAvailableShipping` — quoted the buyer, filtered
 *      by product, preferred product-specific zones over generic ones.
 *   2. `paymentHelpers.verifyShippingCosts` — validated what the buyer was
 *      charged with `WHERE shipping_method_id = ? AND seller_id = ? LIMIT 1`:
 *      no product filter, no destination filter, no ordering.
 *   3. `legacyProvider.getDeliveryOptions` — no product filter, cheapest wins.
 *
 * Nothing forced them to agree, and #2 diverged: once the art shipping
 * calculator started sharing one `shipping_methods` row across every artwork
 * and every zone group, that predicate matched dozens of rows with different
 * costs and returned an arbitrary one. Checkout for the gallery stopped working
 * entirely.
 *
 * The fix is not a better query in #2 — it is that there is only one query.
 * Both the quote and the verification enter through this module, so "the price
 * the buyer was shown" and "the price the server validates" are not two numbers
 * that happen to match: they are the same call.
 *
 * A tariff needs THREE coordinates, and dropping any one of them reintroduces
 * the bug:
 *
 *   method_id    -> which modality the buyer chose        (the column)
 *   postal code  -> which zone group the destination is   (the row)
 *   product_id   -> which artwork's packaging and tariff  (the table)
 */

const { db } = require('../../config/database')
const { ApiError } = require('../../middleware/errorHandler')

/**
 * Three vocabularies describe the same thing in this code path, and mixing them
 * fails silently rather than loudly:
 *
 *   shipping_methods.article_type -> 'art' | 'others' | 'all'
 *   shipping_zones.product_type   -> 'art' | 'other'
 *   cart / payment items          -> 'art' | 'other'
 *
 * This module speaks the cart's vocabulary and translates here, in one place.
 * Comparing `'other'` against `article_type` matches nothing but `'all'`, so
 * every dedicated store method would quietly disappear from the buyer's
 * options — and the gallery, which uses `'art'` in both, would never notice.
 */
const PRODUCT_TYPES = {
  art: { articleType: 'art', zoneProductType: 'art', table: 'art' },
  other: { articleType: 'others', zoneProductType: 'other', table: 'others' },
}

/**
 * Accepts either vocabulary and answers in the canonical one, so callers on the
 * HTTP edge ('others') and callers on the cart edge ('other') can both use it.
 */
function canonicalProductType(productType) {
  if (productType === 'art') return 'art'
  if (productType === 'other' || productType === 'others') return 'other'
  return null
}

/**
 * Does the product physically fit this method's limits?
 *
 * Dimensions are compared sorted, largest against largest, so a 70x50x5 parcel
 * fits a 50x70x10 limit — orientation is the shipper's problem, not a reason to
 * refuse the option.
 */
function checkProductFits(productWeight, productDimensions, maxWeight, maxDimensions) {
  if (maxWeight && productWeight && productWeight > maxWeight) {
    return false
  }

  if (maxDimensions && productDimensions) {
    const productDims = productDimensions.split('x').map(Number).sort((a, b) => b - a)
    const maxDims = maxDimensions.split('x').map(Number).sort((a, b) => b - a)

    for (let i = 0; i < 3; i++) {
      if (productDims[i] > maxDims[i]) {
        return false
      }
    }
  }

  return true
}

/**
 * One winning zone per shipping method.
 *
 * A zone bound to this product beats a generic one; a zone bound to a DIFFERENT
 * product is discarded outright rather than falling back to generic, because
 * offering the generic price for a product that has its own tariff would
 * undercharge exactly the products someone bothered to price individually.
 * Within a tier the cheapest wins — that is the price the buyer is shown, so it
 * is the price the server must validate.
 */
function applyProductPriority(rows, { productId, zoneProductType }) {
  const grouped = {}

  for (const row of rows) {
    if (!grouped[row.id]) {
      grouped[row.id] = { specific: [], generic: [] }
    }

    if (row.zone_product_id !== null && row.zone_product_id !== undefined) {
      if (
        Number(row.zone_product_id) === Number(productId) &&
        row.zone_product_type === zoneProductType
      ) {
        grouped[row.id].specific.push(row)
      }
      // Zones for other products are silently discarded
    } else {
      grouped[row.id].generic.push(row)
    }
  }

  const result = []
  for (const methodId of Object.keys(grouped)) {
    const { specific, generic } = grouped[methodId]
    const candidates = specific.length > 0 ? specific : generic
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.cost - b.cost)
      result.push(candidates[0])
    }
  }
  return result
}

/**
 * `zoneId` travels out so a decision can be reconstructed from the logs months
 * later. It is deliberately NOT accepted on the way in: letting the client name
 * the priced row is precisely the hole this module closes.
 */
function toOption(row) {
  return {
    methodId: Number(row.id),
    zoneId: row.zone_id === null || row.zone_id === undefined ? null : Number(row.zone_id),
    cost: row.cost,
    methodType: row.type,
    name: row.name,
    description: row.description,
    maxArticles: row.max_articles,
    estimatedDeliveryDays: row.estimated_delivery_days,
    maxWeight: row.max_weight,
    maxDimensions: row.max_dimensions,
  }
}

function toPickupOption(row) {
  return {
    ...toOption(row),
    pickupAddress: row.pickup_address,
    pickupCity: row.pickup_city,
    pickupPostalCode: row.pickup_postal_code,
    pickupCountry: row.pickup_country,
    pickupInstructions: row.pickup_instructions,
  }
}

/**
 * The product row is loaded here rather than passed in, so no caller can ask
 * for the zones of one product under another product's seller.
 */
async function loadProduct(productId, canonicalType) {
  const { table } = PRODUCT_TYPES[canonicalType]

  const result = await db.execute({
    sql: `SELECT seller_id, weight, dimensions FROM ${table} WHERE id = ? AND visible = 1`,
    args: [productId],
  })

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Producto no encontrado', 'Producto no encontrado')
  }

  return result.rows[0]
}

async function loadPickupZones({ articleType, sellerId }) {
  const result = await db.execute({
    sql: `
      SELECT DISTINCT
        sm.id,
        sm.name,
        sm.description,
        sm.type,
        sm.article_type,
        sm.max_weight,
        sm.max_dimensions,
        sm.max_articles,
        sm.estimated_delivery_days,
        sz.cost,
        sz.id as zone_id,
        sz.product_id as zone_product_id,
        sz.product_type as zone_product_type,
        u.pickup_address,
        u.pickup_city,
        u.pickup_postal_code,
        u.pickup_country,
        u.pickup_instructions
      FROM shipping_methods sm
      INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
      INNER JOIN users u ON sz.seller_id = u.id
      WHERE sm.type = 'pickup'
        AND sm.is_active = 1
        AND (sm.article_type = 'all' OR sm.article_type = ?)
        AND sz.seller_id = ?
    `,
    args: [articleType, sellerId],
  })

  return result.rows
}

/**
 * A zone matches the destination if it has no postal refs at all (country-wide),
 * or if one of its refs resolves to the buyer's postal code — directly, through
 * its province, or through its country.
 */
async function loadDeliveryZonesForPostalCode({ articleType, sellerId, country, postalCode }) {
  const result = await db.execute({
    sql: `
      SELECT DISTINCT
        sm.id,
        sm.name,
        sm.description,
        sm.type,
        sm.article_type,
        sm.max_weight,
        sm.max_dimensions,
        sm.max_articles,
        sm.estimated_delivery_days,
        sz.cost,
        sz.id as zone_id,
        sz.product_id as zone_product_id,
        sz.product_type as zone_product_type
      FROM shipping_methods sm
      INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
      WHERE sm.type = 'delivery'
        AND sm.is_active = 1
        AND (sm.article_type = 'all' OR sm.article_type = ?)
        AND sz.seller_id = ?
        AND sz.country = ?
        AND (
          -- Zone has no postal refs (applies to entire country)
          NOT EXISTS (
            SELECT 1 FROM shipping_zones_postal_codes szpc WHERE szpc.shipping_zone_id = sz.id
          )
          OR
          -- Direct postal_code ref match
          EXISTS (
            SELECT 1 FROM shipping_zones_postal_codes szpc
            JOIN postal_codes pc ON szpc.postal_code_id = pc.id
            WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'postal_code'
              AND pc.postal_code = ? AND pc.country = ?
          )
          OR
          -- Province ref match
          EXISTS (
            SELECT 1 FROM shipping_zones_postal_codes szpc
            WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'province'
              AND EXISTS (
                SELECT 1 FROM postal_codes pc
                WHERE pc.postal_code = ? AND pc.country = ? AND pc.province = szpc.ref_value
              )
          )
          OR
          -- Country ref match
          EXISTS (
            SELECT 1 FROM shipping_zones_postal_codes szpc
            WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'country'
              AND EXISTS (
                SELECT 1 FROM postal_codes pc
                WHERE pc.postal_code = ? AND pc.country = szpc.ref_value
              )
          )
        )
    `,
    args: [articleType, sellerId, country, postalCode, country, postalCode, country, postalCode],
  })

  return result.rows
}

/**
 * Without a postal code only country-wide zones can be offered: any zone with
 * refs is, by definition, waiting for one.
 */
async function loadDeliveryZonesForCountry({ articleType, sellerId, country }) {
  const result = await db.execute({
    sql: `
      SELECT DISTINCT
        sm.id,
        sm.name,
        sm.description,
        sm.type,
        sm.article_type,
        sm.max_weight,
        sm.max_dimensions,
        sm.max_articles,
        sm.estimated_delivery_days,
        sz.cost,
        sz.id as zone_id,
        sz.product_id as zone_product_id,
        sz.product_type as zone_product_type
      FROM shipping_methods sm
      INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
      WHERE sm.type = 'delivery'
        AND sm.is_active = 1
        AND (sm.article_type = 'all' OR sm.article_type = ?)
        AND sz.seller_id = ?
        AND sz.country = ?
        AND NOT EXISTS (
          SELECT 1 FROM shipping_zones_postal_codes szpc
          WHERE szpc.shipping_zone_id = sz.id
        )
    `,
    args: [articleType, sellerId, country],
  })

  return result.rows
}

/**
 * Resolve every shipping option that applies to a product for a destination.
 *
 * @param {object} params
 * @param {number|string} params.productId
 * @param {string} params.productType  'art' | 'other' (also accepts 'others')
 * @param {string} [params.country]    omit for pickup-only resolution
 * @param {string} [params.postalCode]
 * @returns {Promise<{ sellerId: number, pickup: object[], delivery: object[] }>}
 * @throws {ApiError} 404 when the product does not exist or is not visible
 */
async function resolveShippingOptions({ productId, productType, country, postalCode }) {
  const canonicalType = canonicalProductType(productType)
  if (!canonicalType) {
    throw new ApiError(400, 'Tipo de producto debe ser "art" o "others"', 'Tipo inválido')
  }

  const { articleType, zoneProductType } = PRODUCT_TYPES[canonicalType]
  const product = await loadProduct(productId, canonicalType)
  const sellerId = product.seller_id

  const prioritize = (rows) => applyProductPriority(rows, { productId, zoneProductType })
  const fits = (row) =>
    checkProductFits(product.weight, product.dimensions, row.max_weight, row.max_dimensions)

  const pickupRows = await loadPickupZones({ articleType, sellerId })
  const pickup = prioritize(pickupRows).filter(fits).map(toPickupOption)

  let delivery = []
  if (country) {
    const deliveryRows = postalCode
      ? await loadDeliveryZonesForPostalCode({ articleType, sellerId, country, postalCode })
      : await loadDeliveryZonesForCountry({ articleType, sellerId, country })

    delivery = prioritize(deliveryRows).filter(fits).map(toOption)
  }

  return { sellerId, pickup, delivery }
}

module.exports = {
  resolveShippingOptions,
  canonicalProductType,
  // Exported for the parity test and for callers that already hold their rows.
  applyProductPriority,
  checkProductFits,
}
