/**
 * Turning a cart into per-seller shipping quotes — the single place that does it.
 *
 * Two callers need this and they must not disagree: the buyer's quote endpoint
 * (`POST /api/shipping/options`), which produces the price on screen, and the
 * payment endpoints, which charge for it. Duplicating the grouping and the
 * provider dispatch is exactly how `verifyShippingCosts` once ended up pricing
 * a different row than the one the buyer had been shown — the outage this
 * codebase already paid for once, documented in `zoneResolver.js`.
 *
 * So the price shown and the price charged are the same number produced by the
 * same code, rather than two numbers that have to agree.
 */

const { db } = require('../../config/database')
const logger = require('../../config/logger')
const { getProvider } = require('./shippingProviderFactory')
const { groupBySeller } = require('./parcelGrouper')

/**
 * Fetch every price-determining attribute of each item from the DB.
 * Overrides any frontend-provided values to ensure accuracy.
 *
 * `weight` and `dimensions` keep a fallback to the request's value, which is
 * defensible because the cart itself read them from the database. `price` and
 * `can_copack` do NOT: a fallback is a way to set them from outside, and this
 * endpoint is public and unauthenticated. Both fields set a price — `price` is
 * the insured value the buyer is quoted for, `can_copack` decides how many
 * parcels the shipment has — so the client never gets a say.
 */
async function enrichItemsFromDB(items) {
  const artIds = items.filter(i => i.productType === 'art').map(i => i.productId)
  const otherIds = items.filter(i => i.productType === 'other' || i.productType === 'others').map(i => i.productId)

  const productData = new Map()

  if (artIds.length > 0) {
    const placeholders = artIds.map(() => '?').join(',')
    const result = await db.execute({
      sql: `SELECT id, name, weight, dimensions, price FROM art WHERE id IN (${placeholders})`,
      args: artIds,
    })
    for (const row of result.rows) {
      // Art is never co-packed: `groupIntoParcels` gives each piece its own
      // parcel before co-packability is ever consulted.
      productData.set(`art-${row.id}`, {
        name: row.name,
        weight: row.weight,
        dimensions: row.dimensions,
        price: row.price,
        canCopack: 0,
      })
    }
  }

  if (otherIds.length > 0) {
    const placeholders = otherIds.map(() => '?').join(',')
    const result = await db.execute({
      sql: `SELECT id, name, weight, dimensions, price, can_copack FROM others WHERE id IN (${placeholders})`,
      args: otherIds,
    })
    for (const row of result.rows) {
      // `other_vars` carries only key/value/stock, so a variant's weight,
      // dimensions and price are always its parent product's.
      const data = {
        name: row.name,
        weight: row.weight,
        dimensions: row.dimensions,
        price: row.price,
        canCopack: row.can_copack,
      }
      productData.set(`other-${row.id}`, data)
      productData.set(`others-${row.id}`, data)
    }
  }

  return items.map(item => {
    const key = `${item.productType}-${item.productId}`
    const dbData = productData.get(key)

    // `buildParcels` falls back to 1000 g for a parcel with no weight, which
    // prices a store product as a one-kilo parcel with nothing to show for it.
    // The fallback stays; what changes is that it stops being invisible.
    if (dbData && !dbData.weight) {
      logger.warn(
        { productId: item.productId, productType: item.productType, name: dbData.name },
        'Product has no weight recorded; its parcel will be quoted at the 1000 g fallback'
      )
    }

    return {
      ...item,
      weight: dbData?.weight || item.weight || 0,
      dimensions: dbData?.dimensions || item.dimensions || null,
      price: dbData?.price || 0,
      canCopack: dbData ? dbData.canCopack : 1,
    }
  })
}

/**
 * Quote every seller group of a cart.
 *
 * Returns one entry per seller with the parcels that were built, the delivery
 * options they were quoted at, and the product types involved — everything the
 * quote endpoint needs to render and the payment endpoints need to verify.
 *
 * @param {object[]} items - `{ productId, productType, quantity, sellerId, variantId? }`
 * @param {{country: string, postalCode: string}} deliveryAddress
 * @returns {Promise<object[]>} `{ sellerId, group, productTypes, deliveryOptions, deliveryError }`
 */
async function quoteSellerGroups({ items, deliveryAddress }) {
  const enrichedItems = await enrichItemsFromDB(items)
  const sellerGroups = groupBySeller(enrichedItems)

  const results = []

  for (const [sellerId, group] of sellerGroups) {
    const productTypes = [...new Set(group.items.map(i =>
      i.productType === 'others' ? 'other' : i.productType
    ))]

    // Fetch delivery options per product type (may use different providers)
    const allDeliveryOptions = []
    let deliveryError = null

    for (const pType of productTypes) {
      const provider = getProvider(pType)
      const typeParcels = group.parcels.filter(p => {
        const normalized = p.productType === 'others' ? 'other' : p.productType
        return normalized === pType
      })

      if (typeParcels.length === 0) continue

      try {
        const options = await provider.getDeliveryOptions({
          sellerId,
          parcels: typeParcels,
          buyerAddress: deliveryAddress,
        })
        allDeliveryOptions.push(...options)
      } catch (error) {
        logger.error({
          sellerId,
          productType: pType,
          err: error,
        }, 'Error fetching delivery options for seller')
        deliveryError = error.message || 'No se pudieron obtener las opciones de envío a domicilio'
        // Continue with other product types, don't fail the whole request
      }
    }

    // Deduplicate by option ID
    const seenIds = new Set()
    const deliveryOptions = allDeliveryOptions.filter(opt => {
      if (seenIds.has(opt.id)) return false
      seenIds.add(opt.id)
      return true
    })

    results.push({ sellerId, group, productTypes, deliveryOptions, deliveryError })
  }

  return results
}

module.exports = { enrichItemsFromDB, quoteSellerGroups }
