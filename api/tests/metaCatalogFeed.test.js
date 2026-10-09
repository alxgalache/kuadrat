/**
 * Meta catalogue feed (services/metaCatalogFeed.js), the product source of the
 * Instagram and Facebook shop.
 *
 * What matters: the ids are the Meta Pixel's, so events match items; a store
 * product is listed per variant with stock; images are square JPEG copies,
 * since Meta rejects WebP; and the feed renders the same shared catalogue as
 * the Google one, without a second generation. Nothing reaches the network:
 * `.env.test` disables Sendcloud, so store products are quoted by the legacy
 * provider from the local database.
 */

const request = require('supertest')
const { app } = require('./helpers/app')
const cartQuoting = require('../services/shipping/cartQuoting')
const { __resetCatalogueCache } = require('../services/productFeedCatalogue')
const { contentId } = require('../utils/metaContentId')
const { catalogJpegUrl } = require('../utils/productImageUrl')
const {
  insertSeller, insertArt, insertOther, insertImages, insertMethod, insertZone, parseItems, field, fields,
} = require('./helpers/feedFixtures')

const FEED = '/api/feeds/meta-catalog.xml'

describe('contentId', () => {
  test('is the Meta Pixel format: art_<id> and other_<id>_v<variantId>', () => {
    expect(contentId('art', 57)).toBe('art_57')
    expect(contentId('other', 4, 12)).toBe('other_4_v12')
    expect(contentId('other', 4)).toBe('other_4')
  })
})

describe('Meta catalogue feed', () => {
  let fx
  let xml
  let items

  beforeAll(async () => {
    const sellerId = await insertSeller('Pilar & Prueba')
    const anonymousId = await insertSeller(null)
    const artMethod = await insertMethod('art', 2)
    const otherMethod = await insertMethod('others', 3)
    const ship = (sid, productId, productType) =>
      insertZone({
        methodId: productType === 'art' ? artMethod : otherMethod,
        sellerId: sid,
        productId,
        productType,
        cost: 9.5,
        provinces: ['Madrid'],
      })

    const fragil = await insertArt(sellerId, {
      name: 'Frágil 1',
      type: 'Técnica mixta sobre papel',
      dimensions: '30x40',
      description: '<p>Serie Frágil</p>',
      price: 350,
    })
    const fragilImages = await insertImages('art', fragil.id, 3)
    await ship(sellerId, fragil.id, 'art')

    const bare = await insertArt(anonymousId, { name: 'Sin datos', type: '', description: '' })
    await insertImages('art', bare.id, 1)
    await ship(anonymousId, bare.id, 'art')

    const sold = await insertArt(sellerId, { name: 'Vendida', isSold: 1 })
    await insertImages('art', sold.id, 1)
    await ship(sellerId, sold.id, 'art')

    const noImage = await insertArt(sellerId, { name: 'Sin imagen' })
    await ship(sellerId, noImage.id, 'art')

    const book = await insertOther(sellerId, { name: 'El Libro', price: 19.9, description: 'Un libro' })
    const bookImages = await insertImages('other', book.id, 1)
    await ship(sellerId, book.id, 'other')

    const prints = await insertOther(sellerId, {
      name: 'Láminas',
      price: 35,
      variants: [{ key: 'A4', stock: 3 }, { key: null, stock: 1 }, { key: 'A3', stock: 0 }],
    })
    const printImages = await insertImages('other', prints.id, 2)
    const a4Images = await insertImages('other_var', prints.variantIds[0], 2)
    await ship(sellerId, prints.id, 'other')

    fx = { fragil, fragilImages, bare, sold, noImage, book, bookImages, prints, printImages, a4Images }

    __resetCatalogueCache()
    const res = await request(app).get(FEED)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    xml = res.text
    items = parseItems(xml)
  })

  test('is a well-formed RSS 2.0 feed in the Google namespace, which Meta reads', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
    expect(xml.trim().endsWith('</rss>')).toBe(true)
  })

  test('describes an artwork with the pixel id, name and artist as title, technique and size first', () => {
    const item = items.get(`art_${fx.fragil.id}`)
    expect(item).toBeDefined()
    expect(field(item, 'item_group_id')).toBeNull()
    expect(field(item, 'title')).toBe('Frágil 1 – Pilar &amp; Prueba')
    expect(field(item, 'description')).toBe('Técnica mixta sobre papel · 30 × 40 cm. Serie Frágil')
    expect(field(item, 'availability')).toBe('in stock')
    expect(field(item, 'condition')).toBe('new')
    expect(field(item, 'price')).toBe('350.00 EUR')
    expect(field(item, 'link')).toMatch(new RegExp(`/galeria/p/${fx.fragil.slug}$`))
    expect(field(item, 'brand')).toBe('Pilar &amp; Prueba')
    expect(field(item, 'google_product_category')).toBe('500044')
    expect(field(item, 'product_type')).toBe('Obra original &gt; Técnica mixta sobre papel')
  })

  test('declares neither shipping nor Google-only attributes', () => {
    const item = items.get(`art_${fx.fragil.id}`)
    expect(item).not.toContain('<g:shipping>')
    expect(field(item, 'identifier_exists')).toBeNull()
    expect(field(item, 'gtin')).toBeNull()
  })

  test('declares a quantity on every item, or Meta shows it as sold out', () => {
    // Without `quantity_to_sell_on_facebook` Meta counts 0 and the shop says
    // «Agotado» even though availability is `in stock` (09/10/2026).
    for (const block of items.values()) {
      expect(Number(field(block, 'quantity_to_sell_on_facebook'))).toBeGreaterThanOrEqual(1)
    }
    // An artwork is sold one at a time.
    expect(field(items.get(`art_${fx.fragil.id}`), 'quantity_to_sell_on_facebook')).toBe('1')
    // A store variant declares its real stock.
    const [a4, unnamed] = fx.prints.variantIds
    expect(field(items.get(`other_${fx.prints.id}_v${a4}`), 'quantity_to_sell_on_facebook')).toBe('3')
    expect(field(items.get(`other_${fx.prints.id}_v${unnamed}`), 'quantity_to_sell_on_facebook')).toBe('1')
    expect(field(items.get(`other_${fx.book.id}_v${fx.book.variantIds[0]}`), 'quantity_to_sell_on_facebook')).toBe('5')
  })

  test('links the square JPEG copies of the images, in order', () => {
    const item = items.get(`art_${fx.fragil.id}`)
    const [first, ...rest] = fx.fragilImages.map((basename) => catalogJpegUrl(basename, 'art'))
    expect(first).toMatch(/\/api\/art\/images\/jpeg\/v1\/[^/]+\.webp\.jpg$/)
    expect(field(item, 'image_link')).toBe(first)
    expect(fields(item, 'additional_image_link')).toEqual(rest)
  })

  test('falls back to 140d as brand and to the title as description', () => {
    const item = items.get(`art_${fx.bare.id}`)
    expect(field(item, 'brand')).toBe('140d')
    expect(field(item, 'title')).toBe('Sin datos')
    expect(field(item, 'description')).toBe('Sin datos')
    expect(field(item, 'product_type')).toBe('Obra original')
  })

  test('lists a single-variant store product once, with its group and without a variant label', () => {
    const item = items.get(`other_${fx.book.id}_v${fx.book.variantIds[0]}`)
    expect(item).toBeDefined()
    expect(field(item, 'item_group_id')).toBe(`other_${fx.book.id}`)
    expect(field(item, 'title')).toBe('El Libro – Pilar &amp; Prueba')
    expect(field(item, 'description')).toBe('Un libro')
    expect(field(item, 'price')).toBe('19.90 EUR')
    expect(field(item, 'link')).toMatch(new RegExp(`/tienda/p/${fx.book.slug}$`))
    expect(field(item, 'image_link')).toBe(catalogJpegUrl(fx.bookImages[0], 'other'))
    expect(field(item, 'google_product_category')).toBeNull()
    expect(field(item, 'product_type')).toBe('Tienda')
  })

  test('lists each variant with stock of a multi-variant product, labelled, its own images first', () => {
    const [a4, unnamed, a3] = fx.prints.variantIds
    const a4Item = items.get(`other_${fx.prints.id}_v${a4}`)
    const unnamedItem = items.get(`other_${fx.prints.id}_v${unnamed}`)

    expect(items.has(`other_${fx.prints.id}_v${a3}`)).toBe(false)
    expect(field(a4Item, 'title')).toBe('Láminas – Pilar &amp; Prueba · A4')
    expect(field(unnamedItem, 'title')).toBe('Láminas – Pilar &amp; Prueba · Opción estándar')
    expect(field(a4Item, 'item_group_id')).toBe(`other_${fx.prints.id}`)
    expect(field(unnamedItem, 'item_group_id')).toBe(`other_${fx.prints.id}`)

    // Two variant images, then the first product image: three at most.
    expect(field(a4Item, 'image_link')).toBe(catalogJpegUrl(fx.a4Images[0], 'other_var'))
    expect(fields(a4Item, 'additional_image_link')).toEqual([
      catalogJpegUrl(fx.a4Images[1], 'other_var'),
      catalogJpegUrl(fx.printImages[0], 'other'),
    ])
    expect(field(unnamedItem, 'image_link')).toBe(catalogJpegUrl(fx.printImages[0], 'other'))
  })

  test('leaves out what cannot be bought or described truthfully', () => {
    expect(items.has(`art_${fx.sold.id}`)).toBe(false)
    expect(items.has(`art_${fx.noImage.id}`)).toBe(false)
  })

  test('renders the same generation as the Google feed, without quoting again', async () => {
    __resetCatalogueCache()
    const quotes = jest.spyOn(cartQuoting, 'quoteSellerGroups')

    expect((await request(app).get('/api/feeds/google-merchant.xml')).status).toBe(200)
    const afterGoogle = quotes.mock.calls.length
    expect(afterGoogle).toBeGreaterThan(0)

    expect((await request(app).get(FEED)).status).toBe(200)
    expect(quotes.mock.calls.length).toBe(afterGoogle)

    quotes.mockRestore()
  })
})
