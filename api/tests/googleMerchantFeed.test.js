/**
 * Google Merchant Center feed generated from the database
 * (docs/google-presencia/04-mejoras-codigo.md, cambio 5).
 *
 * What matters is that the feed tells Google exactly what the site sells and
 * charges: the catalogue's product set, the checkout's shipping price, the
 * CDN image. Nothing here reaches the network — `.env.test` disables Sendcloud
 * for both product types, so store products are quoted by the legacy provider
 * from the local database, through the same `quoteSellerGroups` call.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const { db } = require('../config/database')
const { productImageUrl } = require('../utils/productImageUrl')
const { __resetFeedCache, formatDimensions, HANDLING_DAYS } = require('../services/googleMerchantFeed')

const FEED = '/api/feeds/google-merchant.xml'
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// --- fixtures -------------------------------------------------------------

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

async function insertOther(sellerId, { name = 'Libro', price = 20, stock = 5 } = {}) {
  const slug = `feed-other-${uid()}`
  const result = await db.execute({
    sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible)
          VALUES (?, ?, 'desc', ?, ?, 'approved', 1)`,
    args: [sellerId, name, price, slug],
  })
  const id = Number(result.lastInsertRowid)
  await db.execute({
    sql: 'INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, NULL, NULL, ?)',
    args: [id, stock],
  })
  return { id, slug }
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

// Every <item> of the feed, keyed by <g:id>.
function parseItems(xml) {
  const items = new Map()
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const id = block.match(/<g:id>([^<]*)<\/g:id>/)[1]
    items.set(id, block)
  }
  return items
}

const field = (block, name) => {
  const m = block.match(new RegExp(`<g:${name}>([^<]*)</g:${name}>`))
  return m ? m[1] : null
}

// --- suite ----------------------------------------------------------------

describe('Google Merchant feed', () => {
  let artA, artAImages, soldArt, auctionArt, noImageArt, noZoneArt, book, bookImages, noStockOther
  let xml
  let items

  beforeAll(async () => {
    const sellerId = await insertSeller('Artista & Prueba')
    const artMethod = await insertMethod('art', 2)
    const otherMethod = await insertMethod('others', 3)

    artA = await insertArt(sellerId, {
      name: 'Obra A',
      description: '<p>uno</p><p>dos &amp; tres</p>',
      dimensions: '30x42',
    })
    artAImages = await insertImages('art', artA.id, 2)
    // Ships to the peninsula and to the Canaries, at different prices; not to
    // the Balearics nor to Ceuta and Melilla.
    await insertZone({ methodId: artMethod, sellerId, productId: artA.id, productType: 'art', cost: 15.29, provinces: ['Madrid'] })
    await insertZone({ methodId: artMethod, sellerId, productId: artA.id, productType: 'art', cost: 27.91, provinces: ['Las Palmas'] })

    // Each of these breaks exactly one condition for being in the feed.
    soldArt = await insertArt(sellerId, { name: 'Vendida', isSold: 1 })
    auctionArt = await insertArt(sellerId, { name: 'En subasta', forAuction: 1 })
    noImageArt = await insertArt(sellerId, { name: 'Sin imagen' })
    noZoneArt = await insertArt(sellerId, { name: 'Sin envío' })
    for (const art of [soldArt, auctionArt, noZoneArt]) {
      await insertImages('art', art.id, 1)
      if (art !== noZoneArt) {
        await insertZone({ methodId: artMethod, sellerId, productId: art.id, productType: 'art', cost: 10, provinces: ['Madrid'] })
      }
    }
    await insertZone({ methodId: artMethod, sellerId, productId: noImageArt.id, productType: 'art', cost: 10, provinces: ['Madrid'] })

    book = await insertOther(sellerId, { name: 'El Libro', price: 20, stock: 5 })
    bookImages = await insertImages('other', book.id, 1)
    await insertZone({ methodId: otherMethod, sellerId, productId: book.id, productType: 'other', cost: 4.08, provinces: ['Madrid'] })

    noStockOther = await insertOther(sellerId, { name: 'Agotado', stock: 0 })
    await insertImages('other', noStockOther.id, 1)
    await insertZone({ methodId: otherMethod, sellerId, productId: noStockOther.id, productType: 'other', cost: 4.08, provinces: ['Madrid'] })

    __resetFeedCache()
    const res = await request(app).get(FEED)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/xml/)
    xml = res.text
    items = parseItems(xml)
  })

  test('is a well-formed RSS 2.0 feed in the Google namespace', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
    expect(xml.trim().endsWith('</rss>')).toBe(true)
  })

  test('describes an artwork with the data its page shows', () => {
    const item = items.get(artA.slug)
    expect(item).toBeDefined()

    expect(field(item, 'title')).toBe('Obra A – Artista &amp; Prueba · Óleo sobre lienzo · 30 × 42 cm')
    expect(field(item, 'description')).toBe('uno dos &amp; tres')
    expect(field(item, 'link')).toMatch(new RegExp(`/galeria/p/${artA.slug}$`))
    expect(field(item, 'price')).toBe('350.00 EUR')
    expect(field(item, 'availability')).toBe('in_stock')
    expect(field(item, 'brand')).toBe('Artista &amp; Prueba')
    expect(field(item, 'identifier_exists')).toBe('no')
    expect(field(item, 'google_product_category')).toBe('500044')
    expect(field(item, 'material')).toBe('Óleo sobre lienzo')
  })

  test('uses the CDN image as main image and the rest as additional images', () => {
    const item = items.get(artA.slug)
    expect(field(item, 'image_link')).toBe(productImageUrl(artAImages[0], 'art'))
    expect(item).toContain(`<g:additional_image_link>${productImageUrl(artAImages[1], 'art')}</g:additional_image_link>`)
  })

  test('declares the most expensive zone group the artwork ships to, with handling and transit times', () => {
    const shipping = items.get(artA.slug).match(/<g:shipping>([\s\S]*?)<\/g:shipping>/)[1]
    expect(field(shipping, 'country')).toBe('ES')
    expect(field(shipping, 'price')).toBe('27.91 EUR')
    expect(field(shipping, 'min_handling_time')).toBe(String(HANDLING_DAYS.min))
    expect(field(shipping, 'max_handling_time')).toBe(String(HANDLING_DAYS.max))
    expect(field(shipping, 'min_transit_time')).toBe('2')
    expect(field(shipping, 'max_transit_time')).toBe('2')
  })

  test('includes a store product with stock, under /tienda, leaving category and identifiers to the supplemental source', () => {
    const item = items.get(book.slug)
    expect(item).toBeDefined()
    expect(field(item, 'link')).toMatch(new RegExp(`/tienda/p/${book.slug}$`))
    expect(field(item, 'image_link')).toBe(productImageUrl(bookImages[0], 'other'))
    expect(field(item, 'google_product_category')).toBeNull()
    // `identifier_exists = no` here would contradict the GTIN that the
    // supplemental source adds for a book.
    expect(field(item, 'identifier_exists')).toBeNull()
    expect(field(item.match(/<g:shipping>([\s\S]*?)<\/g:shipping>/)[1], 'price')).toBe('4.08 EUR')
  })

  test('leaves out what cannot be bought or described truthfully', () => {
    expect(items.has(soldArt.slug)).toBe(false)
    expect(items.has(auctionArt.slug)).toBe(false)
    expect(items.has(noImageArt.slug)).toBe(false)
    expect(items.has(noZoneArt.slug)).toBe(false)
    expect(items.has(noStockOther.slug)).toBe(false)
  })

  test('is served from cache until it expires', async () => {
    await db.execute({ sql: 'UPDATE art SET price = 999 WHERE id = ?', args: [artA.id] })
    const cached = await request(app).get(FEED)
    expect(field(parseItems(cached.text).get(artA.slug), 'price')).toBe('350.00 EUR')

    __resetFeedCache()
    const fresh = await request(app).get(FEED)
    expect(field(parseItems(fresh.text).get(artA.slug), 'price')).toBe('999.00 EUR')
  })
})

describe('formatDimensions', () => {
  test('reads alto x ancho with comma decimals and units, and refuses anything else', () => {
    expect(formatDimensions('30x42')).toBe('30 × 42 cm')
    expect(formatDimensions('30,5 × 40 cm')).toBe('30,5 × 40 cm')
    expect(formatDimensions('120 x 36 x 3')).toBe('120 × 36 cm')
    expect(formatDimensions('aprox. 30 por 40')).toBeNull()
    expect(formatDimensions(null)).toBeNull()
  })
})
