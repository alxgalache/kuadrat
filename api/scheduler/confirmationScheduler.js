const cron = require('node-cron');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Auto-confirm scheduler for Sendcloud-managed shipments.
 * Runs every hour to find order items with status 'arrived' that have been
 * delivered longer than config.sendcloud.autoConfirmDays, and confirms them
 * (updating status to 'confirmed' and crediting the seller).
 */
module.exports = function startConfirmationScheduler() {
  const days = config.sendcloud.autoConfirmDays;

  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffISO = cutoff.toISOString();

      // Find art order items eligible for auto-confirm
      const artItems = await db.execute({
        sql: `SELECT aoi.id, aoi.order_id, aoi.art_id as product_id,
              aoi.price_at_purchase, aoi.commission_amount, a.seller_id
              FROM art_order_items aoi
              JOIN art a ON aoi.art_id = a.id
              WHERE aoi.status = 'arrived'
              AND aoi.sendcloud_shipment_id IS NOT NULL
              AND aoi.status_modified <= ?`,
        args: [cutoffISO],
      });

      // Find other order items eligible for auto-confirm
      const otherItems = await db.execute({
        sql: `SELECT ooi.id, ooi.order_id, ooi.other_id as product_id,
              ooi.price_at_purchase, ooi.commission_amount, ot.seller_id
              FROM other_order_items ooi
              JOIN others ot ON ooi.other_id = ot.id
              WHERE ooi.status = 'arrived'
              AND ooi.sendcloud_shipment_id IS NOT NULL
              AND ooi.status_modified <= ?`,
        args: [cutoffISO],
      });

      const allItems = [
        ...artItems.rows.map(r => ({ ...r, table: 'art_order_items' })),
        ...otherItems.rows.map(r => ({ ...r, table: 'other_order_items' })),
      ];

      if (allItems.length === 0) return;

      logger.info({ count: allItems.length }, 'Auto-confirm: processing eligible items');

      for (const item of allItems) {
        try {
          // Update status to confirmed
          await db.execute({
            sql: `UPDATE ${item.table} SET status = 'confirmed', status_modified = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [item.id],
          });

          // Credit seller wallet (deducting commission). Change #2 splits the
          // wallet into two VAT buckets: art → REBU 10%, others → standard 21%.
          // Picking the bucket column based on the source table avoids ever
          // mixing fiscal regimes inside a single payout. The legacy
          // `available_withdrawal` column is no longer written to.
          if (item.price_at_purchase && item.seller_id) {
            const sellerEarning = (Number(item.price_at_purchase) || 0) - (Number(item.commission_amount) || 0);
            const bucketColumn = item.table === 'art_order_items'
              ? 'available_withdrawal_art_rebu'
              : 'available_withdrawal_standard_vat';
            await db.execute({
              sql: `UPDATE users SET ${bucketColumn} = COALESCE(${bucketColumn}, 0) + ? WHERE id = ?`,
              args: [sellerEarning, item.seller_id],
            });
          }

          logger.info({
            itemId: item.id,
            table: item.table,
            orderId: item.order_id,
            sellerId: item.seller_id,
          }, 'Auto-confirmed order item');
        } catch (err) {
          logger.error({
            itemId: item.id,
            table: item.table,
            err,
          }, 'Auto-confirm: error processing item');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Auto-confirm scheduler error');
    }
  });

  logger.info({ autoConfirmDays: days }, 'Confirmation scheduler started (hourly)');
};
