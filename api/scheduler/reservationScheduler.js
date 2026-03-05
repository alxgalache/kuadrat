const cron = require('node-cron');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { releaseOrderInventory } = require('../services/inventoryService');

/**
 * Reservation cleanup scheduler.
 * Runs every 60 seconds to release inventory for orders that have been
 * in 'pending' status longer than the configured TTL (default: 30 minutes).
 */
module.exports = function startReservationScheduler() {
  const ttlMinutes = config.orderReservationTtlMinutes;

  // Run every 60 seconds
  cron.schedule('*/60 * * * * *', async () => {
    try {
      // Find pending orders whose reservation has expired
      const expiredOrders = await db.execute({
        sql: `SELECT id FROM orders
              WHERE status = 'pending'
              AND reserved_at IS NOT NULL
              AND reserved_at <= datetime('now', ? || ' minutes')`,
        args: [`-${ttlMinutes}`],
      });

      if (expiredOrders.rows.length === 0) return;

      logger.info({ count: expiredOrders.rows.length, ttlMinutes }, 'Reservation cleanup: found expired orders');

      for (const order of expiredOrders.rows) {
        try {
          await releaseOrderInventory(order.id, 'reservation_expired');
          await db.execute({
            sql: "UPDATE orders SET status = 'expired', reserved_at = NULL WHERE id = ? AND status = 'pending'",
            args: [order.id],
          });
          logger.warn(
            { action: 'inventory_released', orderId: order.id, reason: 'reservation_expired' },
            'Expired reservation cleaned up',
          );
        } catch (err) {
          logger.error({ err, orderId: order.id }, 'Failed to release expired reservation');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Reservation cleanup scheduler error');
    }
  });

  logger.info({ ttlMinutes }, 'Reservation cleanup scheduler started');
};
