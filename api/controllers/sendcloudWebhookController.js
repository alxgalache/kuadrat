const crypto = require('crypto')
const { db } = require('../config/database')
const config = require('../config/env')
const logger = require('../config/logger')
const { sendShipmentSentEmail, sendShipmentDeliveredEmail, sendLabelReadyEmail } = require('../services/emailService')

/**
 * Map Sendcloud parcel status IDs to internal status values.
 * See: https://api.sendcloud.dev/docs/sendcloud-public-api/parcel-statuses
 */
const STATUS_MAP = {
  // Ready / announced
  1000: null,     // Ready to send — no change (already 'paid')
  1001: null,     // Being announced
  1002: null,     // Announced

  // In transit
  3: 'sent',      // Delivered to carrier / en route
  4: 'sent',      // Sorting
  5: 'sent',      // In transit
  8: 'sent',      // Being sorted
  11: 'sent',     // At sorting center
  22: 'sent',     // Collected by driver
  62: 'sent',     // Being sorted
  91: 'sent',     // At sorting center
  21: 'sent',     // Out for delivery

  // Delivered
  6: 'arrived',   // Delivered (service point)
  7: 'arrived',   // Not collected at service point
  12: 'arrived',  // Delivered

  // Issues
  80: null,       // Delivery attempt failed — log, don't change status
  15: null,       // Returned to sender

  // Cancelled
  2000: null,     // Cancelled — manual handling
}

/**
 * Look up an order item by sendcloud_parcel_id first, then fallback to sendcloud_shipment_id.
 * Returns { orderItem, itemTable } or { orderItem: null, itemTable: null }.
 */
async function findOrderItem(parcelId, shipmentUuid) {
  const tables = [
    {
      name: 'art_order_items',
      sql: (whereCol) => `SELECT aoi.id, aoi.order_id, aoi.status, aoi.art_id as product_id,
            aoi.sendcloud_parcel_id, aoi.sendcloud_announcement_retries,
            a.seller_id, a.name as product_name, o.email, o.guest_email, o.phone,
            o.delivery_address_line_1, u.email as seller_email, u.full_name as seller_name
            FROM art_order_items aoi
            JOIN art a ON aoi.art_id = a.id
            JOIN orders o ON aoi.order_id = o.id
            JOIN users u ON a.seller_id = u.id
            WHERE aoi.${whereCol} = ?`,
    },
    {
      name: 'other_order_items',
      sql: (whereCol) => `SELECT ooi.id, ooi.order_id, ooi.status, ooi.other_id as product_id,
            ooi.sendcloud_parcel_id, ooi.sendcloud_announcement_retries,
            ot.seller_id, ot.name as product_name, o.email, o.guest_email, o.phone,
            o.delivery_address_line_1, u.email as seller_email, u.full_name as seller_name
            FROM other_order_items ooi
            JOIN others ot ON ooi.other_id = ot.id
            JOIN orders o ON ooi.order_id = o.id
            JOIN users u ON ot.seller_id = u.id
            WHERE ooi.${whereCol} = ?`,
    },
  ]

  // Try parcel ID first
  if (parcelId) {
    for (const table of tables) {
      const result = await db.execute({ sql: table.sql('sendcloud_parcel_id'), args: [String(parcelId)] })
      if (result.rows.length > 0) return { orderItem: result.rows[0], itemTable: table.name }
    }
  }

  // Fallback to shipment UUID
  if (shipmentUuid) {
    for (const table of tables) {
      const result = await db.execute({ sql: table.sql('sendcloud_shipment_id'), args: [String(shipmentUuid)] })
      if (result.rows.length > 0) return { orderItem: result.rows[0], itemTable: table.name }
    }
  }

  return { orderItem: null, itemTable: null }
}

/**
 * POST /api/shipping/webhook
 * Receives status update notifications from Sendcloud.
 */
const handleSendcloudWebhook = async (req, res) => {
  try {
    // Validate webhook signature if secret is configured
    if (config.sendcloud.webhookSecret) {
      const signature = req.headers['sendcloud-signature'] || req.headers['x-sendcloud-signature']
      if (!signature) {
        logger.warn('Sendcloud webhook: missing signature header')
        return res.status(401).json({ error: 'Missing signature' })
      }

      const payload = req.rawBody || JSON.stringify(req.body)
      const expectedSignature = crypto
        .createHmac('sha256', config.sendcloud.webhookSecret)
        .update(payload)
        .digest('hex')

      if (signature !== expectedSignature) {
        logger.warn('Sendcloud webhook: invalid signature')
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    const { action, parcel, timestamp } = req.body

    if (!parcel) {
      logger.warn({ body: req.body }, 'Sendcloud webhook: no parcel data')
      return res.status(200).json({ received: true })
    }

    const parcelId = parcel.id
    const shipmentUuid = parcel.shipment_uuid
    const statusId = parcel.status?.id
    const statusMessage = parcel.status?.message
    const trackingNumber = parcel.tracking_number
    const trackingUrl = parcel.tracking_url

    if (!parcelId && !shipmentUuid) {
      logger.warn({ body: req.body }, 'Sendcloud webhook: no parcel or shipment ID')
      return res.status(200).json({ received: true })
    }

    logger.info({
      parcelId,
      shipmentUuid,
      statusId,
      statusMessage,
      action,
      trackingNumber,
    }, 'Sendcloud webhook received')

    // Look up order item by parcel ID first, then shipment UUID
    const { orderItem, itemTable } = await findOrderItem(parcelId, shipmentUuid)

    if (!orderItem) {
      logger.warn({ parcelId, shipmentUuid }, 'Sendcloud webhook: order item not found')
      return res.status(200).json({ received: true })
    }

    // Store parcel ID if not already stored (e.g., first webhook after async creation)
    if (parcelId && !orderItem.sendcloud_parcel_id) {
      await db.execute({
        sql: `UPDATE ${itemTable} SET sendcloud_parcel_id = ? WHERE id = ?`,
        args: [String(parcelId), orderItem.id],
      })
      logger.info({ orderItemId: orderItem.id, parcelId }, 'Stored sendcloud_parcel_id from webhook')
    }

    // Update tracking info regardless of status change
    if (trackingNumber || trackingUrl) {
      await db.execute({
        sql: `UPDATE ${itemTable} SET
              tracking = COALESCE(?, tracking),
              sendcloud_tracking_url = COALESCE(?, sendcloud_tracking_url)
              WHERE id = ?`,
        args: [trackingNumber || null, trackingUrl || null, orderItem.id],
      })
    }

    // Handle announcement failure — mark for retry
    if (statusMessage && statusMessage.toLowerCase().includes('announcement failed')) {
      logger.warn({
        parcelId,
        orderItemId: orderItem.id,
        statusId,
        statusMessage,
      }, 'Sendcloud shipment announcement failed')

      await db.execute({
        sql: `UPDATE ${itemTable} SET
              sendcloud_parcel_id = NULL,
              sendcloud_announcement_retries = sendcloud_announcement_retries + 1,
              sendcloud_announcement_failed_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [orderItem.id],
      })

      return res.status(200).json({ received: true })
    }

    // Status 1000 (Ready to send) — notify seller with label
    if (statusId === 1000) {
      try {
        if (orderItem.seller_email && parcelId) {
          await sendLabelReadyEmail({
            sellerEmail: orderItem.seller_email,
            sellerName: orderItem.seller_name || '',
            orderId: orderItem.order_id,
            orderItemId: orderItem.id,
            trackingNumber: trackingNumber || '',
            parcelId: String(parcelId),
          })
        }
      } catch (emailError) {
        logger.error({ err: emailError, orderId: orderItem.order_id }, 'Failed to send label ready email to seller')
      }
    }

    // Map status and update if applicable
    const newStatus = STATUS_MAP[statusId]

    if (newStatus && newStatus !== orderItem.status) {
      // Don't go backwards (e.g., don't change 'arrived' back to 'sent')
      const statusOrder = { paid: 0, sent: 1, arrived: 2, confirmed: 3 }
      if ((statusOrder[newStatus] || 0) <= (statusOrder[orderItem.status] || 0)) {
        logger.debug({
          parcelId,
          currentStatus: orderItem.status,
          newStatus,
        }, 'Sendcloud webhook: ignoring backward status transition')
        return res.status(200).json({ received: true })
      }

      await db.execute({
        sql: `UPDATE ${itemTable} SET status = ?, status_modified = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [newStatus, orderItem.id],
      })

      logger.info({
        parcelId,
        orderItemId: orderItem.id,
        oldStatus: orderItem.status,
        newStatus,
      }, 'Order item status updated via webhook')

      // Send buyer notifications
      const buyerEmail = orderItem.email || orderItem.guest_email
      if (buyerEmail) {
        try {
          if (newStatus === 'sent') {
            await sendShipmentSentEmail({
              buyerEmail,
              orderId: orderItem.order_id,
              trackingNumber: trackingNumber || '',
              trackingUrl: trackingUrl || '',
            })
          } else if (newStatus === 'arrived') {
            await sendShipmentDeliveredEmail({
              buyerEmail,
              orderId: orderItem.order_id,
            })
          }
        } catch (emailError) {
          logger.error({ err: emailError, orderId: orderItem.order_id }, 'Failed to send status notification email')
        }
      }
    }

    // Handle cancellation — alert admin
    if (statusId === 2000) {
      logger.warn({
        parcelId,
        orderItemId: orderItem.id,
        orderId: orderItem.order_id,
      }, 'Sendcloud shipment cancelled — requires manual handling')
    }

    res.status(200).json({ received: true })
  } catch (error) {
    logger.error({ err: error }, 'Sendcloud webhook processing error')
    // Always return 200 to prevent retries
    res.status(200).json({ received: true, error: 'Processing error logged' })
  }
}

module.exports = { handleSendcloudWebhook }
