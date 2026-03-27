const { db } = require('../config/database')
const logger = require('../config/logger')
const { ApiError } = require('../middleware/errorHandler')
const { sendSuccess } = require('../utils/response')
const { getProvider, isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory')
const { groupBySeller } = require('../services/shipping/parcelGrouper')

/**
 * Fetch real weight/dimensions from the DB for each item.
 * Overrides any frontend-provided values to ensure accuracy.
 */
async function enrichItemsFromDB(items) {
  const artIds = items.filter(i => i.productType === 'art').map(i => i.productId)
  const otherIds = items.filter(i => i.productType === 'other' || i.productType === 'others').map(i => i.productId)

  const productData = new Map()

  if (artIds.length > 0) {
    const placeholders = artIds.map(() => '?').join(',')
    const result = await db.execute({
      sql: `SELECT id, weight, dimensions FROM art WHERE id IN (${placeholders})`,
      args: artIds,
    })
    for (const row of result.rows) {
      productData.set(`art-${row.id}`, { weight: row.weight, dimensions: row.dimensions })
    }
  }

  if (otherIds.length > 0) {
    const placeholders = otherIds.map(() => '?').join(',')
    const result = await db.execute({
      sql: `SELECT id, weight, dimensions FROM others WHERE id IN (${placeholders})`,
      args: otherIds,
    })
    for (const row of result.rows) {
      productData.set(`other-${row.id}`, { weight: row.weight, dimensions: row.dimensions })
      productData.set(`others-${row.id}`, { weight: row.weight, dimensions: row.dimensions })
    }
  }

  return items.map(item => {
    const key = `${item.productType}-${item.productId}`
    const dbData = productData.get(key)
    return {
      ...item,
      weight: dbData?.weight || item.weight || 0,
      dimensions: dbData?.dimensions || item.dimensions || null,
    }
  })
}

/**
 * POST /api/shipping/options
 *
 * Returns normalized shipping options grouped by seller.
 * Body: { items: [...], deliveryAddress: { country, postalCode, city, address } }
 */
const getShippingOptions = async (req, res, next) => {
  try {
    const { items, deliveryAddress } = req.body

    // Enrich items with real weight/dimensions from DB
    const enrichedItems = await enrichItemsFromDB(items)

    // Group items by seller and create parcels
    const sellerGroups = groupBySeller(enrichedItems)
    const sellers = []

    for (const [sellerId, group] of sellerGroups) {
      // Determine the product types in this seller group
      const productTypes = [...new Set(group.items.map(i =>
        i.productType === 'others' ? 'other' : i.productType
      ))]

      // Fetch delivery options per product type (may use different providers)
      let allDeliveryOptions = []
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
      const uniqueOptions = allDeliveryOptions.filter(opt => {
        if (seenIds.has(opt.id)) return false
        seenIds.add(opt.id)
        return true
      })

      // Get seller pickup info
      const sellerResult = await db.execute({
        sql: `SELECT full_name, pickup_address, pickup_city, pickup_postal_code,
              pickup_country, pickup_instructions FROM users WHERE id = ?`,
        args: [sellerId],
      })

      let pickupOption = null
      if (sellerResult.rows.length > 0) {
        const seller = sellerResult.rows[0]
        if (seller.pickup_address && seller.pickup_city) {
          pickupOption = {
            address: seller.pickup_address,
            city: seller.pickup_city,
            postalCode: seller.pickup_postal_code || '',
            country: seller.pickup_country || 'ES',
            instructions: seller.pickup_instructions || '',
          }
        }
      }

      sellers.push({
        sellerId,
        sellerName: sellerResult.rows[0]?.full_name || group.sellerName || '',
        parcelCount: group.parcels.length,
        productCount: group.items.reduce((sum, i) => sum + (i.quantity || 1), 0),
        deliveryOptions: uniqueOptions,
        pickupOption,
        deliveryError,
      })
    }

    sendSuccess(res, { sellers })
  } catch (error) {
    next(error)
  }
}

module.exports = { getShippingOptions }
