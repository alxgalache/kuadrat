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
 * For a page of `others` products, fetch the first image basename of every
 * named variation in a single batched query, attach `variation_thumbnails`
 * to each product, and fall back `thumbnail_basename` to the first variation
 * image when the product has no global images.
 *
 * Variations with `key IS NULL` (anonymous, "no variations" mode) and
 * variations without any images are omitted from `variation_thumbnails`.
 *
 * @param {Array<Object>} products - rows that already went through `attachProductImages(rows, 'other')`
 * @returns {Promise<Array<Object>>} the same `products` array, mutated in place
 */
async function attachVariationThumbnails(products) {
  if (!products || products.length === 0) return products || [];

  const ids = products.map((p) => p.id).filter((id) => id != null);
  if (ids.length === 0) {
    for (const p of products) p.variation_thumbnails = [];
    return products;
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute({
    sql: `
      SELECT
        v.id AS variation_id,
        v.other_id AS product_id,
        v.key AS variation_key,
        (
          SELECT pi.basename
          FROM product_images pi
          WHERE pi.product_type = 'other_var' AND pi.product_id = v.id
          ORDER BY pi.position ASC, pi.id ASC
          LIMIT 1
        ) AS basename
      FROM other_vars v
      WHERE v.other_id IN (${placeholders}) AND v.key IS NOT NULL
      ORDER BY v.other_id ASC, v.id ASC
    `,
    args: ids,
  });

  const byProductId = new Map();
  for (const row of result.rows) {
    if (!row.basename) continue;
    const list = byProductId.get(row.product_id) || [];
    list.push({ id: row.variation_id, key: row.variation_key, basename: row.basename });
    byProductId.set(row.product_id, list);
  }

  for (const product of products) {
    const list = byProductId.get(product.id) || [];
    product.variation_thumbnails = list;
    if (!product.thumbnail_basename && list[0]?.basename) {
      product.thumbnail_basename = list[0].basename;
    }
  }

  return products;
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
  attachVariationThumbnails,
  getPrimaryImageBasename,
};
