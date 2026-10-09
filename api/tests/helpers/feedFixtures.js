/**
 * Fixtures for the product feed tests (Google Merchant Center and Meta).
 *
 * Same shapes as the helpers inside googleMerchantFeed.test.js, which keeps its
 * own copies on purpose: that file is the proof that the Google feed did not
 * change, and it stays untouched. Store products here take explicit variants,
 * because the Meta catalogue lists one item per variant.
 */

const { db } = require('../../config/database')

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function insertSeller(fullName) {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', ?, 1)`,
    args: [`feed-${uid()}@example.com`, fullName],
  })
  return Number(result.lastInsertRowid)
}

async function insertArt(sellerId, overrides = {}) {
  const v = {
    name: 'Obra',
    description: 'desc',
    price: 350,
    type: 'Óleo sobre lienzo',
    dimensions: null,
    isSold: 0,
    forAuction: 0,
    ...overrides,
  }
  const slug = `feed-art-${uid()}`
  const result = await db.execute({
    sql: `INSERT INTO art (seller_id, name, description, price, slug, status, visible,
                           type, dimensions, is_sold, for_auction)
          VALUES (?, ?, ?, ?, ?, 'approved', 1, ?, ?, ?, ?)`,
    args: [sellerId, v.name, v.description, v.price, slug, v.type, v.dimensions, v.isSold, v.forAuction],
  })
  return { id: Number(result.lastInsertRowid), slug }
}

/**
 * @param {{ name?: string, price?: number, description?: string,
 *           variants?: Array<{ key: string|null, stock: number }> }} [opts]
 * @returns {Promise<{ id: number, slug: string, variantIds: number[] }>}
 */
async function insertOther(sellerId, { name = 'Libro', price = 20, description = 'desc', variants = [{ key: null, stock: 5 }] } = {}) {
  const slug = `feed-other-${uid()}`
  const result = await db.execute({
    sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible)
          VALUES (?, ?, ?, ?, ?, 'approved', 1)`,
    args: [sellerId, name, description, price, slug],
  })
  const id = Number(result.lastInsertRowid)
  const variantIds = []
  for (const variant of variants) {
    const inserted = await db.execute({
      sql: 'INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, ?, NULL, ?)',
      args: [id, variant.key, variant.stock],
    })
    variantIds.push(Number(inserted.lastInsertRowid))
  }
  return { id, slug, variantIds }
}

async function insertImages(productType, productId, count) {
  const basenames = []
  for (let position = 0; position < count; position++) {
    const basename = `${uid()}.webp`
    await db.execute({
      sql: 'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
      args: [productType, productId, basename, position],
    })
    basenames.push(basename)
  }
  return basenames
}

async function insertMethod(articleType, estimatedDays) {
  const result = await db.execute({
    sql: `INSERT INTO shipping_methods (name, description, type, article_type, max_articles,
                                        is_active, estimated_delivery_days)
          VALUES (?, 'desc', 'delivery', ?, 1, 1, ?)`,
    args: [`Envío ${uid()}`, articleType, estimatedDays],
  })
  return Number(result.lastInsertRowid)
}

async function insertZone({ methodId, sellerId, productId, productType, cost, provinces }) {
  const zone = await db.execute({
    sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost, product_id, product_type)
          VALUES (?, ?, 'ES', ?, ?, ?)`,
    args: [methodId, sellerId, cost, productId, productType],
  })
  const zoneId = Number(zone.lastInsertRowid)
  for (const province of provinces) {
    await db.execute({
      sql: `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
            VALUES (?, 'province', NULL, ?)`,
      args: [zoneId, province],
    })
  }
}

// Every <item> of a feed, keyed by its <g:id>.
function parseItems(xml) {
  const items = new Map()
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const id = block.match(/<g:id>([^<]*)<\/g:id>/)[1]
    items.set(id, block)
  }
  return items
}

// The text of the first <g:name> in a block, or null.
const field = (block, name) => {
  const m = block.match(new RegExp(`<g:${name}>([^<]*)</g:${name}>`))
  return m ? m[1] : null
}

// Every <g:name> in a block, in order.
const fields = (block, name) =>
  [...block.matchAll(new RegExp(`<g:${name}>([^<]*)</g:${name}>`, 'g'))].map((m) => m[1])

module.exports = {
  uid,
  insertSeller,
  insertArt,
  insertOther,
  insertImages,
  insertMethod,
  insertZone,
  parseItems,
  field,
  fields,
}
