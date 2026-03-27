const cron = require('node-cron');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { sendShipmentFailedAdminEmail } = require('../services/emailService');

/**
 * Shipment retry scheduler.
 * Runs every 15 minutes to find order items where the Sendcloud shipment
 * was created but the announcement hasn't completed (sendcloud_parcel_id is NULL).
 * Retries the shipment creation and notifies admin after max retries.
 */
module.exports = function startShipmentRetryScheduler() {
  const maxRetries = config.sendcloud.maxAnnouncementRetries;

  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const sendcloudProvider = require('../services/shipping/sendcloudProvider');

      // Find art order items needing retry
      const artItems = await db.execute({
        sql: `SELECT aoi.id, aoi.order_id, aoi.art_id as product_id, aoi.price_at_purchase,
              aoi.sendcloud_shipping_option_code, aoi.sendcloud_service_point_id,
              aoi.sendcloud_announcement_retries,
              a.seller_id, a.name as product_name, a.weight, a.dimensions,
              o.delivery_address_line_1, o.delivery_address_line_2, o.delivery_postal_code,
              o.delivery_city, o.delivery_country, o.full_name as buyer_name,
              o.email as buyer_email, o.guest_email, o.phone as buyer_phone,
              u.email as seller_email, u.full_name as seller_name
              FROM art_order_items aoi
              JOIN art a ON aoi.art_id = a.id
              JOIN orders o ON aoi.order_id = o.id
              JOIN users u ON a.seller_id = u.id
              WHERE aoi.sendcloud_shipment_id IS NOT NULL
              AND aoi.sendcloud_parcel_id IS NULL
              AND aoi.sendcloud_announcement_retries < ?`,
        args: [maxRetries],
      });

      // Find other order items needing retry
      const otherItems = await db.execute({
        sql: `SELECT ooi.id, ooi.order_id, ooi.other_id as product_id, ooi.price_at_purchase,
              ooi.sendcloud_shipping_option_code, ooi.sendcloud_service_point_id,
              ooi.sendcloud_announcement_retries,
              ot.seller_id, ot.name as product_name, ot.weight, ot.dimensions,
              o.delivery_address_line_1, o.delivery_address_line_2, o.delivery_postal_code,
              o.delivery_city, o.delivery_country, o.full_name as buyer_name,
              o.email as buyer_email, o.guest_email, o.phone as buyer_phone,
              u.email as seller_email, u.full_name as seller_name
              FROM other_order_items ooi
              JOIN others ot ON ooi.other_id = ot.id
              JOIN orders o ON ooi.order_id = o.id
              JOIN users u ON ot.seller_id = u.id
              WHERE ooi.sendcloud_shipment_id IS NOT NULL
              AND ooi.sendcloud_parcel_id IS NULL
              AND ooi.sendcloud_announcement_retries < ?`,
        args: [maxRetries],
      });

      const allItems = [
        ...artItems.rows.map(r => ({ ...r, table: 'art_order_items', itemType: 'art' })),
        ...otherItems.rows.map(r => ({ ...r, table: 'other_order_items', itemType: 'other' })),
      ];

      if (allItems.length === 0) return;

      logger.info({ count: allItems.length }, 'Shipment retry: processing eligible items');

      for (const item of allItems) {
        const retryAttempt = (item.sendcloud_announcement_retries || 0) + 1;

        try {
          const results = await sendcloudProvider.createShipments({
            order: {
              id: item.order_id,
              deliveryAddress: {
                addressLine1: item.delivery_address_line_1 || '',
                addressLine2: item.delivery_address_line_2 || '',
                postalCode: item.delivery_postal_code || '',
                city: item.delivery_city || '',
                country: item.delivery_country || 'ES',
              },
              buyerName: item.buyer_name || '',
              buyerEmail: item.buyer_email || item.guest_email || '',
              buyerPhone: item.buyer_phone || '',
            },
            itemGroups: [{
              sellerId: item.seller_id,
              shippingOptionCode: item.sendcloud_shipping_option_code,
              servicePointId: item.sendcloud_service_point_id || null,
              parcels: [{
                weight: item.weight || 1000,
                dimensions: item.dimensions || null,
                totalValue: item.price_at_purchase || 0,
                items: [{
                  id: item.product_id,
                  name: item.product_name,
                  weight: item.weight,
                  price: item.price_at_purchase,
                  quantity: 1,
                }],
                itemIds: [{ itemId: item.id, itemType: item.itemType }],
              }],
            }],
          });

          const result = results[0];

          if (result && result.sendcloudShipmentId) {
            // Success — update with new shipment data
            await db.execute({
              sql: `UPDATE ${item.table} SET
                    sendcloud_shipment_id = ?,
                    sendcloud_parcel_id = ?,
                    sendcloud_announcement_retries = 0,
                    sendcloud_announcement_failed_at = NULL
                    WHERE id = ?`,
              args: [result.sendcloudShipmentId, result.sendcloudParcelId || null, item.id],
            });

            logger.info({
              itemId: item.id,
              table: item.table,
              orderId: item.order_id,
              retryAttempt,
              newShipmentId: result.sendcloudShipmentId,
            }, 'Shipment retry succeeded');
          } else {
            // API call succeeded but no shipment ID — treat as failure
            throw new Error(result?.error || 'No shipment ID returned');
          }
        } catch (err) {
          logger.error({
            itemId: item.id,
            table: item.table,
            orderId: item.order_id,
            retryAttempt,
            err,
          }, 'Shipment retry failed');

          // Increment retry counter
          await db.execute({
            sql: `UPDATE ${item.table} SET
                  sendcloud_announcement_retries = ?,
                  sendcloud_announcement_failed_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            args: [retryAttempt, item.id],
          });

          // Notify admin if max retries reached
          if (retryAttempt >= maxRetries) {
            try {
              await sendShipmentFailedAdminEmail({
                orderId: item.order_id,
                orderItemId: item.id,
                productName: item.product_name,
                sellerName: item.seller_name,
                buyerEmail: item.buyer_email || item.guest_email,
                retryCount: retryAttempt,
                lastError: err.message || 'Unknown error',
              });
            } catch (emailErr) {
              logger.error({ err: emailErr, orderId: item.order_id }, 'Failed to send shipment failure admin email');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Shipment retry scheduler error');
    }
  });

  logger.info({ maxRetries }, 'Shipment retry scheduler started (every 15 minutes)');
};
