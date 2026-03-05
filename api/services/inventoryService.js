const { db } = require('../config/database');
const { createBatch } = require('../utils/transaction');
const logger = require('../config/logger');

/**
 * Release reserved inventory for a given order.
 * Resets is_sold = 0 for art items and increments stock for variant items.
 * Uses a Turso batch transaction for atomicity.
 *
 * @param {number} orderId - The order ID whose inventory should be released
 * @param {string} reason - Reason for release (e.g., 'payment_failed', 'reservation_expired', 'cancelled')
 * @returns {Promise<{ artReleased: number, variantsReleased: number }>}
 */
async function releaseOrderInventory(orderId, reason = 'unknown') {
  const releaseBatch = createBatch();
  let artReleased = 0;
  let variantsReleased = 0;

  // Find art items for this order
  const artItemsRes = await db.execute({
    sql: 'SELECT aoi.art_id FROM art_order_items aoi WHERE aoi.order_id = ?',
    args: [orderId],
  });
  const uniqueArtIds = [...new Set(artItemsRes.rows.map((r) => r.art_id))];
  for (const artId of uniqueArtIds) {
    releaseBatch.add('UPDATE art SET is_sold = 0 WHERE id = ? AND is_sold = 1', [artId]);
    artReleased++;
  }

  // Find variant items for this order and aggregate quantities
  const otherItemsRes = await db.execute({
    sql: 'SELECT other_var_id FROM other_order_items WHERE order_id = ?',
    args: [orderId],
  });
  const variantCounts = new Map();
  for (const row of otherItemsRes.rows) {
    variantCounts.set(row.other_var_id, (variantCounts.get(row.other_var_id) || 0) + 1);
  }
  for (const [variantId, qty] of variantCounts) {
    releaseBatch.add('UPDATE other_vars SET stock = stock + ? WHERE id = ?', [qty, variantId]);
    variantsReleased++;
  }

  if (releaseBatch.size() > 0) {
    await releaseBatch.execute();
  }

  // Log all releases
  for (const artId of uniqueArtIds) {
    logger.warn(
      { action: 'inventory_released', productId: artId, orderId, type: 'art', reason },
      'Art item inventory released',
    );
  }
  for (const [variantId, qty] of variantCounts) {
    logger.warn(
      { action: 'inventory_released', productId: variantId, orderId, type: 'other_variant', quantity: qty, reason },
      'Variant stock released',
    );
  }

  // Also check if parent products for released variants should have is_sold reset
  if (variantCounts.size > 0) {
    const variantIds = [...variantCounts.keys()];
    const placeholders = variantIds.map(() => '?').join(',');
    const parentRes = await db.execute({
      sql: `SELECT DISTINCT other_id FROM other_vars WHERE id IN (${placeholders})`,
      args: variantIds,
    });
    for (const row of parentRes.rows) {
      const totalRes = await db.execute({
        sql: 'SELECT SUM(stock) as total_stock FROM other_vars WHERE other_id = ?',
        args: [row.other_id],
      });
      if ((totalRes.rows[0]?.total_stock || 0) > 0) {
        await db.execute({ sql: 'UPDATE others SET is_sold = 0 WHERE id = ? AND is_sold = 1', args: [row.other_id] });
      }
    }
  }

  return { artReleased, variantsReleased };
}

module.exports = { releaseOrderInventory };
