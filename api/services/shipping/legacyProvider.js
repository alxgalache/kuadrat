const logger = require('../../config/logger')
const { resolveShippingOptions, checkProductFits } = require('./zoneResolver')

/**
 * Legacy shipping provider.
 * Adapts the database-backed shipping zones to the standard provider interface.
 */

/**
 * Get delivery options from the legacy shipping system.
 *
 * Which zone applies is decided by the shared resolver (`zoneResolver.js`), the
 * same one that quotes the buyer and validates the cost at payment. This module
 * used to run its own query, without the product filter and with a different
 * tie-break, which is how three implementations of one rule ended up disagreeing.
 *
 * For legacy, pricing is per-product (not per-seller-group), so the first
 * parcel's first item stands in as the representative product.
 *
 * The resolver decides WHICH zones apply and already excludes methods the
 * product itself does not fit. This module additionally checks the PARCEL
 * against those limits, which is its own concern: several copacked store items
 * travel as one box that can exceed a limit no single item does.
 */
async function getDeliveryOptions({ sellerId, parcels, buyerAddress }) {
  const options = []

  // Use the first parcel's product info as representative
  const parcel = parcels[0]
  const representative = parcel.items && parcel.items[0]
  if (!representative) return options

  // Pickup options are added by shippingOptionsController, not here.
  if (!buyerAddress.country || !buyerAddress.postalCode) return options

  const { delivery } = await resolveShippingOptions({
    productId: representative.productId,
    productType: parcel.productType || 'art',
    country: buyerAddress.country,
    postalCode: buyerAddress.postalCode,
  })

  // The only thing this provider adds on top of the resolver: legacy methods
  // price per shipment, so N units of a method that carries `max_articles` at a
  // time cost `ceil(N / max_articles)` shipments.
  const totalUnits = parcels.reduce((sum, p) => sum + (p.quantity || 1), 0)

  for (const option of delivery) {
    if (!checkProductFits(parcel.weight, parcel.dimensions, option.maxWeight, option.maxDimensions)) {
      continue
    }

    const maxArticles = option.maxArticles || 1
    const shipmentCount = Math.ceil(totalUnits / maxArticles)

    options.push({
      id: `legacy_${option.methodId}`,
      type: 'home_delivery',
      carrier: { name: option.name, code: '', logoUrl: '' },
      price: shipmentCount * option.cost,
      currency: 'EUR',
      estimatedDays: {
        min: option.estimatedDeliveryDays || null,
        max: option.estimatedDeliveryDays || null,
      },
      shippingOptionCode: `legacy_${option.methodId}`,
      requiresServicePoint: false,
      name: option.name,
      description: option.description,
      maxArticles: option.maxArticles,
      legacyMethodId: option.methodId,
      legacyCostPerShipment: option.cost,
      shipmentCount,
    })
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
