const sendcloud = require('./sendcloudApiClient')
const { db } = require('../../config/database')
const logger = require('../../config/logger')
const { ApiError } = require('../../middleware/errorHandler')

/**
 * Sendcloud shipping provider.
 * Wraps Sendcloud API calls and returns normalized responses.
 */

/**
 * Load seller's Sendcloud configuration.
 * Throws if not found.
 */
async function getSellerConfig(sellerId) {
  const result = await db.execute({
    sql: 'SELECT * FROM user_sendcloud_configuration WHERE user_id = ?',
    args: [sellerId],
  })

  if (result.rows.length === 0) {
    throw new ApiError(400,
      'El vendedor no tiene configuración de envío Sendcloud. Contacta al administrador.',
      'Configuración de Sendcloud faltante'
    )
  }

  return result.rows[0]
}

/**
 * Valid values for the Sendcloud first_mile functionality.
 */
const VALID_FIRST_MILE = ['pickup', 'dropoff', 'pickup_dropoff', 'fulfilment']
const VALID_LAST_MILE = ['home_delivery', 'service_point', 'mailbox', 'locker', 'locker_or_service_point']

/**
 * Build the functionalities filter object from seller config.
 */
function buildFunctionalities(sellerConfig) {
  const funcs = {}

  if (sellerConfig.require_signature) funcs.signature = true
  if (sellerConfig.fragile_goods) funcs.fragile_goods = true

  if (sellerConfig.first_mile) {
    if (VALID_FIRST_MILE.includes(sellerConfig.first_mile)) {
      funcs.first_mile = sellerConfig.first_mile
    } else {
      logger.warn(
        { sellerId: sellerConfig.user_id, first_mile: sellerConfig.first_mile },
        'Invalid first_mile value in seller Sendcloud config, skipping'
      )
    }
  }

  if (sellerConfig.last_mile) {
    if (VALID_LAST_MILE.includes(sellerConfig.last_mile)) {
      funcs.last_mile = sellerConfig.last_mile
    } else {
      logger.warn(
        { sellerId: sellerConfig.user_id, last_mile: sellerConfig.last_mile },
        'Invalid last_mile value in seller Sendcloud config, skipping'
      )
    }
  }

  return Object.keys(funcs).length > 0 ? funcs : undefined
}

/**
 * Build parcels array for the Sendcloud shipping-options request.
 * Each parcel has weight and optionally dimensions.
 */
function buildParcels(parcels, sellerConfig) {
  return parcels.map(parcel => {
    const p = {
      weight: {
        value: String((parcel.weight || 1000) / 1000), // grams to kg
        unit: 'kg',
      },
    }

    if (parcel.dimensions) {
      const dims = parcel.dimensions.split('x').map(Number)
      if (dims.length === 3 && dims.every(d => d > 0)) {
        p.dimensions = {
          length: String(dims[0]),
          width: String(dims[1]),
          height: String(dims[2]),
          unit: 'cm',
        }
      }
    }

    // Insurance
    if (sellerConfig.insurance_type === 'full_value' && parcel.totalValue) {
      p.additional_insured_price = {
        value: String(parcel.totalValue.toFixed(2)),
        currency: 'EUR',
      }
    } else if (sellerConfig.insurance_type === 'fixed' && sellerConfig.insurance_fixed_amount) {
      p.additional_insured_price = {
        value: String(sellerConfig.insurance_fixed_amount.toFixed(2)),
        currency: 'EUR',
      }
    }

    return p
  })
}

/**
 * Get delivery options from Sendcloud for a seller's parcels.
 * Calls POST /v3/shipping-options with calculate_quotes: true.
 *
 * @param {object} params
 * @param {number} params.sellerId
 * @param {object[]} params.parcels - Array of { weight, dimensions, totalValue, items }
 * @param {object} params.buyerAddress - { country, postalCode }
 * @returns {object[]} Normalized delivery options
 */
async function getDeliveryOptions({ sellerId, parcels, buyerAddress }) {
  const sellerConfig = await getSellerConfig(sellerId)

  const requestBody = {
    from_country_code: sellerConfig.sender_country || 'ES',
    from_postal_code: sellerConfig.sender_postal_code,
    to_country_code: buyerAddress.country,
    to_postal_code: buyerAddress.postalCode,
    parcels: buildParcels(parcels, sellerConfig),
    calculate_quotes: true,
  }

  const functionalities = buildFunctionalities(sellerConfig)
  if (functionalities) {
    requestBody.functionalities = functionalities
  }

  // Filter by preferred carriers if set
  const preferred = parseJsonArray(sellerConfig.preferred_carriers)
  if (preferred.length === 1) {
    requestBody.carrier_code = preferred[0]
  }

  const response = await sendcloud.post('shipping-options', { body: requestBody })

  const data = response.data || response || []
  const excluded = parseJsonArray(sellerConfig.excluded_carriers)

  // Normalize the response
  const options = (data || [])
    .filter(opt => {
      // Filter excluded carriers
      if (excluded.length > 0 && opt.carrier?.code && excluded.includes(opt.carrier.code)) {
        return false
      }
      // Filter preferred carriers (if more than 1, filter here since API only accepts one)
      if (preferred.length > 1 && opt.carrier?.code && !preferred.includes(opt.carrier.code)) {
        return false
      }
      // Filter out options without a valid price total
      const quote = opt.quotes?.[0]
      if (!quote?.price?.total?.value) {
        return false
      }
      return true
    })
    .map(opt => normalizeOption(opt))

  return options
}

/**
 * Normalize a Sendcloud shipping option to our standard format.
 */
function normalizeOption(opt) {
  const quote = opt.quotes?.[0]
  const leadTimeHours = quote?.lead_time

  return {
    id: opt.code || opt.id,
    type: opt.requirements?.is_service_point_required ? 'service_point' : 'home_delivery',
    carrier: {
      name: opt.carrier?.name || '',
      code: opt.carrier?.code || '',
      logoUrl: opt.carrier?.logo_url || '',
    },
    price: parseFloat(quote.price.total.value),
    currency: quote.price.total.currency || 'EUR',
    estimatedDays: leadTimeHours ? Math.ceil(leadTimeHours / 24) : null,
    shippingOptionCode: opt.code || '',
    requiresServicePoint: opt.requirements?.is_service_point_required || false,
    name: opt.name || opt.carrier?.name || '',
  }
}

/**
 * Get service points for a carrier near a postal code.
 * Calls GET /v2/service-points.
 */
async function getServicePoints({ carrier, country, postalCode, radius = 5000 }) {
  const data = await sendcloud.get('service-points', {
    version: 'v2',
    baseUrl: 'https://servicepoints.sendcloud.sc/api',
    params: {
      country,
      carrier,
      postal_code: postalCode,
      radius,
    },
  })

  return (data || []).map(sp => ({
    id: sp.id,
    name: sp.name,
    address: `${sp.street || ''} ${sp.house_number || ''}`.trim(),
    city: sp.city,
    postalCode: sp.postal_code,
    country: sp.country,
    carrier: sp.carrier,
    openingTimes: sp.formatted_opening_times || {},
    distance: sp.distance,
    latitude: sp.latitude,
    longitude: sp.longitude,
  }))
}

/**
 * Create shipments in Sendcloud after payment.
 * Creates one shipment per parcel via POST /v3/shipments/announce.
 *
 * @param {object} params
 * @param {object} params.order - Order data { id, deliveryAddress, buyerName, buyerEmail, buyerPhone }
 * @param {object[]} params.itemGroups - Array of { sellerId, parcels, shippingOptionCode, servicePointId }
 * @returns {object[]} Array of { parcelIndex, sendcloudShipmentId, trackingNumber, trackingUrl, labelUrl }
 */
async function createShipments({ order, itemGroups }) {
  const results = []

  for (const group of itemGroups) {
    const sellerConfig = await getSellerConfig(group.sellerId)

    for (let i = 0; i < group.parcels.length; i++) {
      const parcel = group.parcels[i]

      const shipmentBody = {
        from_address: {
          name: sellerConfig.sender_name || '',
          company_name: sellerConfig.sender_company_name || '',
          address_line_1: sellerConfig.sender_address_1 || '',
          address_line_2: sellerConfig.sender_address_2 || '',
          house_number: sellerConfig.sender_house_number || '',
          postal_code: sellerConfig.sender_postal_code || '',
          city: sellerConfig.sender_city || '',
          country_code: sellerConfig.sender_country || 'ES',
          phone_number: sellerConfig.sender_phone || '',
          email: sellerConfig.sender_email || '',
        },
        to_address: {
          name: order.buyerName || '',
          address_line_1: order.deliveryAddress.addressLine1 || '',
          address_line_2: order.deliveryAddress.addressLine2 || '',
          postal_code: order.deliveryAddress.postalCode || '',
          city: order.deliveryAddress.city || '',
          country_code: order.deliveryAddress.country || '',
          phone_number: order.buyerPhone || '',
          email: order.buyerEmail || '',
        },
        ship_with: {
          type: 'shipping_option_code',
          properties: {
            shipping_option_code: group.shippingOptionCode,
          },
        },
        order_number: String(order.id),
        external_reference_id: `order-${order.id}-seller-${group.sellerId}-parcel-${i}`,
        total_order_price: {
          currency: 'EUR',
          value: String(parcel.totalValue?.toFixed(2) || '0.00'),
        },
        parcels: [{
          weight: {
            value: String((parcel.weight || 1000) / 1000),
            unit: 'kg',
          },
          parcel_items: (parcel.items || []).map(item => ({
            item_id: String(item.id),
            description: item.name || 'Producto',
            quantity: item.quantity || 1,
            weight: {
              value: (item.weight || 0) / 1000,
              unit: 'kg',
            },
            price: {
              value: String(item.price?.toFixed(2) || '0.00'),
              currency: 'EUR',
            },
            hs_code: sellerConfig.default_hs_code || '',
            origin_country: sellerConfig.origin_country || 'ES',
          })),
        }],
      }

      // Add dimensions if available
      if (parcel.dimensions) {
        const dims = parcel.dimensions.split('x').map(Number)
        if (dims.length === 3 && dims.every(d => d > 0)) {
          shipmentBody.parcels[0].dimensions = {
            length: String(dims[0]),
            width: String(dims[1]),
            height: String(dims[2]),
            unit: 'cm',
          }
        }
      }

      // Add service point if selected
      if (group.servicePointId) {
        shipmentBody.to_address.to_service_point = group.servicePointId
      }

      try {
        const response = await sendcloud.post('shipments', { body: shipmentBody })
        const shipment = response.data || response

        results.push({
          parcelIndex: i,
          sellerId: group.sellerId,
          sendcloudShipmentId: shipment.id || null,
          sendcloudParcelId: shipment.parcels?.[0]?.id ? String(shipment.parcels[0].id) : null,
          trackingNumber: shipment.parcels?.[0]?.tracking_number || null,
          trackingUrl: shipment.parcels?.[0]?.tracking_url || null,
          labelUrl: shipment.parcels?.[0]?.documents?.[0]?.link || null,
          carrierCode: shipment.carrier?.code || shipment.parcels?.[0]?.carrier?.code || null,
          itemIds: parcel.itemIds || [],
        })
      } catch (error) {
        logger.error({
          orderId: order.id,
          sellerId: group.sellerId,
          parcelIndex: i,
          err: error,
        }, 'Failed to create Sendcloud shipment for parcel')

        results.push({
          parcelIndex: i,
          sellerId: group.sellerId,
          sendcloudShipmentId: null,
          sendcloudParcelId: null,
          trackingNumber: null,
          trackingUrl: null,
          labelUrl: null,
          itemIds: parcel.itemIds || [],
          error: error.message,
        })
      }
    }
  }

  return results
}

/**
 * Get shipment status from Sendcloud.
 */
async function getShipmentStatus(shipmentId) {
  const data = await sendcloud.get(`shipments/${shipmentId}`)
  return {
    status: data.status?.id || data.parcel_status?.id,
    statusMessage: data.status?.message || data.parcel_status?.message,
    trackingNumber: data.tracking_number,
    trackingUrl: data.tracking_url,
  }
}

/**
 * Cancel a Sendcloud shipment.
 */
async function cancelShipment(shipmentId) {
  try {
    await sendcloud.del(`shipments/${shipmentId}`)
    return true
  } catch (error) {
    logger.error({ shipmentId, err: error }, 'Failed to cancel Sendcloud shipment')
    return false
  }
}

/**
 * Get label PDF URL for a shipment.
 */
async function getLabelUrl(shipmentId) {
  const data = await sendcloud.get(`shipments/${shipmentId}`)
  return data.label?.label_printer || data.label?.normal_printer?.[0] || null
}

/**
 * Download label PDF for a parcel by parcel ID.
 * Returns a Buffer on success or null if not available.
 */
async function getLabelPdf(parcelId) {
  try {
    const buffer = await sendcloud.getBinary(`parcels/${parcelId}/documents/label`)
    if (!buffer || buffer.length === 0) {
      logger.debug({ parcelId }, 'Sendcloud label PDF not available yet')
      return null
    }
    return buffer
  } catch (error) {
    logger.error({ parcelId, err: error }, 'Failed to download Sendcloud label PDF')
    return null
  }
}

/**
 * Create a pickup in Sendcloud.
 * Calls POST /v3/pickups with common fields.
 *
 * @param {object} params
 * @param {string} params.carrierCode - Carrier code (e.g. 'correos', 'dhl')
 * @param {object} params.address - Pickup address
 * @param {object[]} params.timeSlots - Array of { startAt, endAt } ISO strings
 * @param {object[]} params.items - Array of { quantity, containerType, totalWeight }
 * @param {string} [params.specialInstructions]
 * @returns {object} Sendcloud pickup response data
 */
async function createPickup({ carrierCode, address, timeSlots, items, specialInstructions }) {
  const body = {
    carrier_code: carrierCode,
    address: {
      name: address.name || '',
      company_name: address.companyName || '',
      country_code: address.countryCode || 'ES',
      city: address.city || '',
      email: address.email || '',
      address_line_1: address.addressLine1 || '',
      house_number: address.houseNumber || '',
      address_line_2: address.addressLine2 || '',
      postal_code: address.postalCode || '',
      phone_number: address.phoneNumber || '',
    },
    time_slots: timeSlots.map(slot => ({
      start_at: slot.startAt,
      end_at: slot.endAt,
    })),
    items: items.map(item => ({
      quantity: item.quantity || 1,
      container_type: item.containerType || 'parcel',
      total_weight: {
        value: String(item.totalWeight || '1.00'),
        unit: 'kg',
      },
    })),
  }

  if (specialInstructions) {
    body.special_instructions = specialInstructions
  }

  const response = await sendcloud.post('pickups', { body })
  const data = response.data || response

  return {
    id: data.id,
    status: data.status || 'ANNOUNCING',
    carrierCode: data.carrier_code || carrierCode,
    trackingNumber: data.tracking_number || null,
    createdAt: data.created_at || null,
  }
}

/**
 * Parse a JSON array string safely.
 */
function parseJsonArray(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

module.exports = {
  getDeliveryOptions,
  getServicePoints,
  createShipments,
  getShipmentStatus,
  cancelShipment,
  getLabelUrl,
  getLabelPdf,
  createPickup,
}
