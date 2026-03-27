const { db } = require('../config/database')
const logger = require('../config/logger')
const { ApiError } = require('../middleware/errorHandler')
const { sendSuccess } = require('../utils/response')
const sendcloudProvider = require('../services/shipping/sendcloudProvider')

/**
 * GET /api/seller/orders
 * Query: ?status=paid|sent|arrived|confirmed&page=1&limit=20
 *
 * Returns orders grouped by order_id, sorted by created_at DESC,
 * with sellerConfig and pickup info.
 */
const getSellerOrders = async (req, res, next) => {
  try {
    const sellerId = req.user.id
    const { status, page = 1, limit = 20 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10))
    const limitVal = Math.min(100, Math.max(1, parseInt(limit, 10)))

    const statusFilter = status ? 'AND item_alias.status = ?' : ''
    const statusArgs = status ? [status] : []

    // Art order items
    const artSql = `
      SELECT aoi.id, aoi.order_id, aoi.art_id as product_id, 'art' as product_type,
             aoi.status, aoi.price_at_purchase, aoi.tracking, aoi.sendcloud_shipment_id,
             aoi.sendcloud_tracking_url, aoi.sendcloud_carrier_code,
             NULL as variant_id, NULL as variant_name,
             a.name as product_name, a.basename as product_basename,
             o.created_at as order_created_at,
             o.delivery_address_line_1, o.delivery_address_line_2,
             o.delivery_city, o.delivery_postal_code, o.delivery_country
      FROM art_order_items aoi
      JOIN art a ON aoi.art_id = a.id
      JOIN orders o ON aoi.order_id = o.id
      WHERE a.seller_id = ? ${statusFilter.replace('item_alias.', 'aoi.')}
    `

    // Other order items (JOIN with other_vars for variant info)
    const otherSql = `
      SELECT ooi.id, ooi.order_id, ooi.other_id as product_id, 'others' as product_type,
             ooi.status, ooi.price_at_purchase, ooi.tracking, ooi.sendcloud_shipment_id,
             ooi.sendcloud_tracking_url, ooi.sendcloud_carrier_code,
             ooi.other_var_id as variant_id,
             CASE WHEN ov.key IS NOT NULL AND ov.value IS NOT NULL AND ov.value != ''
                  THEN ov.key || ': ' || ov.value
                  ELSE ov.key END as variant_name,
             ot.name as product_name, ot.basename as product_basename,
             o.created_at as order_created_at,
             o.delivery_address_line_1, o.delivery_address_line_2,
             o.delivery_city, o.delivery_postal_code, o.delivery_country
      FROM other_order_items ooi
      JOIN others ot ON ooi.other_id = ot.id
      LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
      JOIN orders o ON ooi.order_id = o.id
      WHERE ot.seller_id = ? ${statusFilter.replace('item_alias.', 'ooi.')}
    `

    const [artResult, otherResult] = await Promise.all([
      db.execute({ sql: artSql, args: [sellerId, ...statusArgs] }),
      db.execute({ sql: otherSql, args: [sellerId, ...statusArgs] }),
    ])

    // Combine all items
    const allItems = [...artResult.rows, ...otherResult.rows]

    // Group by order_id
    const orderMap = new Map()
    for (const item of allItems) {
      if (!orderMap.has(item.order_id)) {
        orderMap.set(item.order_id, {
          orderId: item.order_id,
          createdAt: item.order_created_at,
          status: item.status,
          deliveryAddress: {
            line1: item.delivery_address_line_1 || '',
            line2: item.delivery_address_line_2 || '',
            city: item.delivery_city || '',
            postalCode: item.delivery_postal_code || '',
            country: item.delivery_country || '',
          },
          rawItems: [],
          pickup: null,
        })
      }
      orderMap.get(item.order_id).rawItems.push(item)
    }

    // Aggregate items by (product_type, product_id, variant_id) counting quantities
    const orders = []
    for (const order of orderMap.values()) {
      const itemMap = new Map()
      for (const raw of order.rawItems) {
        const key = `${raw.product_type}-${raw.product_id}-${raw.variant_id || 'null'}`
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            productType: raw.product_type,
            productId: raw.product_id,
            productName: raw.product_name,
            productBasename: raw.product_basename,
            variantId: raw.variant_id || null,
            variantName: raw.variant_name || null,
            quantity: 0,
            status: raw.status,
            sendcloudShipmentId: raw.sendcloud_shipment_id || null,
            sendcloudTrackingUrl: raw.sendcloud_tracking_url || null,
            sendcloudCarrierCode: raw.sendcloud_carrier_code || null,
          })
        }
        itemMap.get(key).quantity += 1
        // Keep the most recent sendcloud data
        const existing = itemMap.get(key)
        if (!existing.sendcloudShipmentId && raw.sendcloud_shipment_id) {
          existing.sendcloudShipmentId = raw.sendcloud_shipment_id
        }
        if (!existing.sendcloudTrackingUrl && raw.sendcloud_tracking_url) {
          existing.sendcloudTrackingUrl = raw.sendcloud_tracking_url
        }
        if (!existing.sendcloudCarrierCode && raw.sendcloud_carrier_code) {
          existing.sendcloudCarrierCode = raw.sendcloud_carrier_code
        }
      }

      orders.push({
        orderId: order.orderId,
        createdAt: order.createdAt,
        status: order.status,
        deliveryAddress: order.deliveryAddress,
        items: Array.from(itemMap.values()),
        pickup: null,
      })
      delete order.rawItems
    }

    // Sort by created_at DESC
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

    // Load pickup status for all orders in one query
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.orderId)
      const placeholders = orderIds.map(() => '?').join(',')
      const pickupResult = await db.execute({
        sql: `SELECT id, order_id, sendcloud_pickup_id, status, created_at
              FROM sendcloud_pickups
              WHERE seller_id = ? AND order_id IN (${placeholders})`,
        args: [sellerId, ...orderIds],
      })

      const pickupMap = new Map()
      for (const row of pickupResult.rows) {
        pickupMap.set(row.order_id, {
          id: row.id,
          sendcloudPickupId: row.sendcloud_pickup_id,
          status: row.status,
          createdAt: row.created_at,
        })
      }

      for (const order of orders) {
        order.pickup = pickupMap.get(order.orderId) || null
      }
    }

    // Paginate over orders
    const total = orders.length
    const offset = (pageNum - 1) * limitVal
    const paginatedOrders = orders.slice(offset, offset + limitVal)

    // Load seller's Sendcloud config
    let sellerConfig = null
    const configResult = await db.execute({
      sql: `SELECT first_mile, sender_name, sender_company_name, sender_address_1,
                   sender_address_2, sender_house_number, sender_city, sender_postal_code,
                   sender_country, sender_phone, sender_email
            FROM user_sendcloud_configuration WHERE user_id = ?`,
      args: [sellerId],
    })

    if (configResult.rows.length > 0) {
      const cfg = configResult.rows[0]
      sellerConfig = {
        firstMile: cfg.first_mile || null,
        defaultAddress: {
          name: cfg.sender_name || '',
          companyName: cfg.sender_company_name || '',
          address1: cfg.sender_address_1 || '',
          address2: cfg.sender_address_2 || '',
          houseNumber: cfg.sender_house_number || '',
          city: cfg.sender_city || '',
          postalCode: cfg.sender_postal_code || '',
          country: cfg.sender_country || 'ES',
          phone: cfg.sender_phone || '',
          email: cfg.sender_email || '',
        },
      }
    }

    sendSuccess(res, {
      orders: paginatedOrders,
      pagination: {
        page: pageNum,
        limit: limitVal,
        total,
        totalPages: Math.ceil(total / limitVal),
      },
      sellerConfig,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/seller/orders/:itemType/:itemId/label
 * Proxies label download from Sendcloud.
 */
const downloadOrderLabel = async (req, res, next) => {
  try {
    const sellerId = req.user.id
    const { itemType, itemId } = req.params

    if (itemType !== 'art' && itemType !== 'others') {
      throw new ApiError(400, 'Tipo de producto inválido', 'Tipo inválido')
    }

    const table = itemType === 'art' ? 'art_order_items' : 'other_order_items'
    const joinTable = itemType === 'art' ? 'art' : 'others'
    const fk = itemType === 'art' ? 'art_id' : 'other_id'

    const result = await db.execute({
      sql: `SELECT item.sendcloud_shipment_id, item.sendcloud_parcel_id
            FROM ${table} item
            JOIN ${joinTable} p ON item.${fk} = p.id
            WHERE item.id = ? AND p.seller_id = ?`,
      args: [itemId, sellerId],
    })

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'No encontrado')
    }

    const { sendcloud_shipment_id: shipmentId, sendcloud_parcel_id: parcelId } = result.rows[0]

    if (!shipmentId && !parcelId) {
      throw new ApiError(404, 'No hay etiqueta de envío disponible', 'Sin etiqueta')
    }

    // Try PDF download via parcel ID first
    if (parcelId) {
      const pdfBuffer = await sendcloudProvider.getLabelPdf(parcelId)
      if (pdfBuffer) {
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="etiqueta-envio-${itemId}.pdf"`)
        return res.send(pdfBuffer)
      }
    }

    // Fallback to label URL via shipment ID
    if (shipmentId) {
      const labelUrl = await sendcloudProvider.getLabelUrl(shipmentId)
      if (labelUrl) {
        return sendSuccess(res, { labelUrl })
      }
    }

    throw new ApiError(404, 'La etiqueta se está generando. Por favor, inténtalo de nuevo en unos minutos.', 'Etiqueta pendiente')
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/seller/orders/:orderId/pickup
 * Schedule a Sendcloud pickup for a seller's items in an order.
 */
const schedulePickup = async (req, res, next) => {
  try {
    const sellerId = req.user.id
    const orderId = parseInt(req.params.orderId, 10)
    const { address, timeSlotStart, timeSlotEnd, specialInstructions } = req.body

    if (!orderId || isNaN(orderId)) {
      throw new ApiError(400, 'ID de pedido inválido', 'ID inválido')
    }

    // Check if pickup already exists for this order+seller
    const existingPickup = await db.execute({
      sql: 'SELECT id FROM sendcloud_pickups WHERE order_id = ? AND seller_id = ?',
      args: [orderId, sellerId],
    })
    if (existingPickup.rows.length > 0) {
      throw new ApiError(400, 'Ya existe una recogida programada para este pedido', 'Recogida duplicada')
    }

    // Load seller's art order items for this order
    const artItems = await db.execute({
      sql: `SELECT aoi.id, aoi.status, aoi.sendcloud_carrier_code, a.weight
            FROM art_order_items aoi
            JOIN art a ON aoi.art_id = a.id
            WHERE aoi.order_id = ? AND a.seller_id = ?`,
      args: [orderId, sellerId],
    })

    // Load seller's other order items for this order
    const otherItems = await db.execute({
      sql: `SELECT ooi.id, ooi.status, ooi.sendcloud_carrier_code, ot.weight
            FROM other_order_items ooi
            JOIN others ot ON ooi.other_id = ot.id
            WHERE ooi.order_id = ? AND ot.seller_id = ?`,
      args: [orderId, sellerId],
    })

    const allItems = [...artItems.rows, ...otherItems.rows]

    if (allItems.length === 0) {
      throw new ApiError(404, 'No se encontraron artículos tuyos en este pedido', 'No encontrado')
    }

    // Verify all items are in 'paid' status
    const nonPaid = allItems.filter(i => i.status !== 'paid')
    if (nonPaid.length > 0) {
      throw new ApiError(400, 'Solo se puede programar recogida para pedidos en estado "Pagado"', 'Estado inválido')
    }

    // Get carrier code from items (all should share the same one)
    const carrierCode = allItems.find(i => i.sendcloud_carrier_code)?.sendcloud_carrier_code
    if (!carrierCode) {
      throw new ApiError(400, 'No se encontró el código del transportista para este pedido. Contacta al administrador.', 'Sin transportista')
    }

    // Calculate total weight (grams → kg)
    const totalWeightGrams = allItems.reduce((sum, item) => sum + (item.weight || 1000), 0)
    const totalWeightKg = (totalWeightGrams / 1000).toFixed(2)

    // Create pickup in Sendcloud
    const pickupResult = await sendcloudProvider.createPickup({
      carrierCode,
      address: {
        name: address.name,
        companyName: address.companyName || '',
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        houseNumber: address.houseNumber || '',
        city: address.city,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
        phoneNumber: address.phoneNumber,
        email: address.email,
      },
      timeSlots: [{ startAt: timeSlotStart, endAt: timeSlotEnd }],
      items: [{ quantity: 1, containerType: 'parcel', totalWeight: totalWeightKg }],
      specialInstructions: specialInstructions || '',
    })

    // Store pickup in database
    const pickupAddress = JSON.stringify(address)
    await db.execute({
      sql: `INSERT INTO sendcloud_pickups
            (order_id, seller_id, sendcloud_pickup_id, carrier_code, status,
             pickup_address, time_slot_start, time_slot_end, special_instructions, total_weight_kg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        orderId,
        sellerId,
        pickupResult.id ? String(pickupResult.id) : null,
        carrierCode,
        pickupResult.status || 'ANNOUNCING',
        pickupAddress,
        timeSlotStart,
        timeSlotEnd,
        specialInstructions || null,
        parseFloat(totalWeightKg),
      ],
    })

    // Update all seller's items in this order to status='sent'
    for (const item of artItems.rows) {
      await db.execute({
        sql: `UPDATE art_order_items SET status = 'sent', status_modified = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [item.id],
      })
    }
    for (const item of otherItems.rows) {
      await db.execute({
        sql: `UPDATE other_order_items SET status = 'sent', status_modified = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [item.id],
      })
    }

    logger.info({ orderId, sellerId, pickupId: pickupResult.id, carrierCode },
      'Pickup scheduled successfully')

    sendSuccess(res, {
      pickup: {
        id: pickupResult.id,
        status: pickupResult.status,
        carrierCode,
      },
    })
  } catch (error) {
    next(error)
  }
}

module.exports = { getSellerOrders, downloadOrderLabel, schedulePickup }
