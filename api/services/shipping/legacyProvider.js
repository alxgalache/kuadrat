const { db } = require('../../config/database')
const logger = require('../../config/logger')
const { postcodeValidator } = require('postcode-validator')

/**
 * Legacy shipping provider.
 * Wraps the existing DB-based shipping logic into the standard provider interface.
 */

/**
 * Check if a product fits within shipping method limits.
 */
function checkProductFits(productWeight, productDimensions, maxWeight, maxDimensions) {
  if (maxWeight && productWeight && productWeight > maxWeight) {
    return false
  }

  if (maxDimensions && productDimensions) {
    const productDims = productDimensions.split('x').map(Number).sort((a, b) => b - a)
    const maxDims = maxDimensions.split('x').map(Number).sort((a, b) => b - a)

    for (let i = 0; i < 3; i++) {
      if (productDims[i] > maxDims[i]) return false
    }
  }

  return true
}

/**
 * Get delivery options from the legacy shipping system.
 * Queries shipping_methods, shipping_zones, and shipping_zones_postal_codes.
 *
 * For legacy, this is per-product (not per-seller-group). We adapt it by querying
 * for a representative product from the seller.
 */
async function getDeliveryOptions({ sellerId, parcels, buyerAddress }) {
  const options = []

  // Use the first parcel's product info as representative
  const parcel = parcels[0]
  const productType = parcel.productType || 'art'
  const productWeight = parcel.weight
  const productDimensions = parcel.dimensions

  // Get pickup methods
  const pickupResult = await db.execute({
    sql: `
      SELECT DISTINCT
        sm.id, sm.name, sm.description, sm.type,
        sm.max_weight, sm.max_dimensions, sm.max_articles,
        sm.estimated_delivery_days, sz.cost,
        u.pickup_address, u.pickup_city, u.pickup_postal_code,
        u.pickup_country, u.pickup_instructions
      FROM shipping_methods sm
      INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
      INNER JOIN users u ON sz.seller_id = u.id
      WHERE sm.type = 'pickup' AND sm.is_active = 1
        AND (sm.article_type = 'all' OR sm.article_type = ?)
        AND sz.seller_id = ?
    `,
    args: [productType === 'other' ? 'others' : productType, sellerId],
  })

  // Note: pickup options are added by the shippingOptionsController, not here

  // Get delivery methods if country is provided
  if (buyerAddress.country && buyerAddress.postalCode) {
    const deliveryResult = await db.execute({
      sql: `
        SELECT DISTINCT
          sm.id, sm.name, sm.description, sm.type,
          sm.max_weight, sm.max_dimensions, sm.max_articles,
          sm.estimated_delivery_days, sz.cost, sz.id as zone_id
        FROM shipping_methods sm
        INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
        WHERE sm.type = 'delivery' AND sm.is_active = 1
          AND (sm.article_type = 'all' OR sm.article_type = ?)
          AND sz.seller_id = ?
          AND sz.country = ?
          AND (
            NOT EXISTS (
              SELECT 1 FROM shipping_zones_postal_codes szpc WHERE szpc.shipping_zone_id = sz.id
            )
            OR EXISTS (
              SELECT 1 FROM shipping_zones_postal_codes szpc
              JOIN postal_codes pc ON szpc.postal_code_id = pc.id
              WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'postal_code'
                AND pc.postal_code = ? AND pc.country = ?
            )
            OR EXISTS (
              SELECT 1 FROM shipping_zones_postal_codes szpc
              WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'province'
                AND EXISTS (
                  SELECT 1 FROM postal_codes pc
                  WHERE pc.postal_code = ? AND pc.country = ? AND pc.province = szpc.ref_value
                )
            )
            OR EXISTS (
              SELECT 1 FROM shipping_zones_postal_codes szpc
              WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'country'
                AND EXISTS (
                  SELECT 1 FROM postal_codes pc
                  WHERE pc.postal_code = ? AND pc.country = szpc.ref_value
                )
            )
          )
      `,
      args: [
        productType === 'other' ? 'others' : productType,
        sellerId,
        buyerAddress.country,
        buyerAddress.postalCode, buyerAddress.country,
        buyerAddress.postalCode, buyerAddress.country,
        buyerAddress.postalCode,
      ],
    })

    // Deduplicate by method ID (keep cheapest)
    const groupedByMethod = {}
    for (const row of deliveryResult.rows) {
      if (!groupedByMethod[row.id] || row.cost < groupedByMethod[row.id].cost) {
        groupedByMethod[row.id] = row
      }
    }

    for (const method of Object.values(groupedByMethod)) {
      if (!checkProductFits(productWeight, productDimensions, method.max_weight, method.max_dimensions)) {
        continue
      }

      // Calculate total cost for all parcels: ceil(totalUnits / maxArticles) * cost
      const totalUnits = parcels.reduce((sum, p) => sum + (p.quantity || 1), 0)
      const maxArticles = method.max_articles || 1
      const shipmentCount = Math.ceil(totalUnits / maxArticles)

      options.push({
        id: `legacy_${method.id}`,
        type: 'home_delivery',
        carrier: { name: method.name, code: '', logoUrl: '' },
        price: shipmentCount * method.cost,
        currency: 'EUR',
        estimatedDays: {
          min: method.estimated_delivery_days || null,
          max: method.estimated_delivery_days || null,
        },
        shippingOptionCode: `legacy_${method.id}`,
        requiresServicePoint: false,
        name: method.name,
        description: method.description,
        maxArticles: method.max_articles,
        legacyMethodId: method.id,
        legacyCostPerShipment: method.cost,
        shipmentCount,
      })
    }
  }

  return options
}

/**
 * Legacy provider does not support service points.
 */
async function getServicePoints() {
  return []
}

/**
 * Legacy provider: no-op for shipment creation.
 * Sellers manage shipping manually.
 */
async function createShipments() {
  logger.debug('Legacy provider: createShipments is a no-op')
  return []
}

/**
 * Legacy provider: read status from DB.
 */
async function getShipmentStatus() {
  return null
}

/**
 * Legacy provider: no-op.
 */
async function cancelShipment() {
  return false
}

async function getLabelUrl() {
  return null
}

module.exports = {
  getDeliveryOptions,
  getServicePoints,
  createShipments,
  getShipmentStatus,
  cancelShipment,
  getLabelUrl,
}
