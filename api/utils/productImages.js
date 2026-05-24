const { db } = require('../config/database');

/**
 * Fetch product_images for the given rows in a single query and attach
 * `images` and `thumbnail_basename` to each row.
 *
 * @param {Array<Object>} rows - product rows with an `id` (or custom `idKey`)
 * @param {'art'|'other'|'other_var'} productType
 * @param {{ idKey?: string }} [opts]
 * @returns {Promise<Array<Object>>} the same `rows` array, mutated in place
 */
async function attachProductImages(rows, productType, opts = {}) {
  const idKey = opts.idKey || 'id';

  if (!rows || rows.length === 0) return rows || [];

  const ids = rows.map((r) => r[idKey]).filter((id) => id != null);
  if (ids.length === 0) {
    for (const row of rows) {
      row.images = [];
      row.thumbnail_basename = null;
    }
    return rows;
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute({
    sql: `
      SELECT id, product_id, basename, position
      FROM product_images
      WHERE product_type = ? AND product_id IN (${placeholders})
      ORDER BY product_id ASC, position ASC, id ASC
    `,
    args: [productType, ...ids],
  });

  const byProductId = new Map();
  for (const row of result.rows) {
    const list = byProductId.get(row.product_id) || [];
    list.push({ id: row.id, basename: row.basename, position: row.position });
    byProductId.set(row.product_id, list);
  }

  for (const row of rows) {
    const list = byProductId.get(row[idKey]) || [];
    row.images = list;
    row.thumbnail_basename = list[0]?.basename || null;
  }

  return rows;
}

/**
 * Return the basename of the first image for a single (product_type, product_id)
 * pair, or null if none.
 *
 * @param {'art'|'other'|'other_var'} productType
 * @param {number} productId
 * @returns {Promise<string|null>}
 */
async function getPrimaryImageBasename(productType, productId) {
  if (productId == null) return null;
  const result = await db.execute({
    sql: `
      SELECT basename
      FROM product_images
      WHERE product_type = ? AND product_id = ?
      ORDER BY position ASC, id ASC
      LIMIT 1
    `,
    args: [productType, productId],
  });
  return result.rows[0]?.basename || null;
}

module.exports = {
  attachProductImages,
  getPrimaryImageBasename,
};
