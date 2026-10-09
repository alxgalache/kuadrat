/**
 * The shared product feed catalogue (services/productFeedCatalogue.js): what a
 * failed shipping quote does to a product. Dropping it would make Meta delete
 * the item and its Instagram tags for good, so a product that was in the
 * previous generation keeps that generation's quote. Nothing reaches the
 * network: the failure is simulated on `quoteSellerGroups`.
 */

const { db } = require('../config/database')
const logger = require('../config/logger')
const cartQuoting = require('../services/shipping/cartQuoting')
const {
  getProductFeedCatalogue,
  __resetCatalogueCache,
  __expireCatalogueCache,
} = require('../services/productFeedCatalogue')
const {
  insertSeller, insertArt, insertOther, insertImages, insertMethod, insertZone,
} = require('./helpers/feedFixtures')

const realQuote = cartQuoting.quoteSellerGroups

// Makes every quote of one product fail the way Sendcloud failures surface.
function failQuotesOf(productType, productId) {
  return jest.spyOn(cartQuoting, 'quoteSellerGroups').mockImplementation(async (args) => {
    const [item] = args.items
    if (item.productType === productType && item.productId === productId) {
      return [{ sellerId: item.sellerId, deliveryOptions: [], deliveryError: 'Sendcloud no responde' }]
    }
    return realQuote(args)
  })
}

const findEntry = (catalogue, productType, id) =>
  catalogue.entries.find((entry) => entry.productType === productType && entry.id === id)

describe('Product feed catalogue: a failed shipping quote', () => {
  let sellerId, artMethod, otherMethod

  beforeAll(async () => {
    sellerId = await insertSeller('Artista Catálogo')
    artMethod = await insertMethod('art', 2)
    otherMethod = await insertMethod('others', 3)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    __resetCatalogueCache()
  })

  async function insertShippableBook(price = 20) {
    const book = await insertOther(sellerId, { name: 'Libro catálogo', price })
    await insertImages('other', book.id, 1)
    await insertZone({ methodId: otherMethod, sellerId, productId: book.id, productType: 'other', cost: 4.08, provinces: ['Madrid'] })
    return book
  }

  test('keeps a product of the previous generation, with its previous quote and its current data', async () => {
    const book = await insertShippableBook(20)

    __resetCatalogueCache()
    const first = findEntry(await getProductFeedCatalogue(), 'other', book.id)
    expect(first.shipping.cents).toBe(408)

    await db.execute({ sql: 'UPDATE others SET price = 25 WHERE id = ?', args: [book.id] })
    failQuotesOf('other', book.id)
    const errorLog = jest.spyOn(logger, 'error')
    __expireCatalogueCache()

    const second = findEntry(await getProductFeedCatalogue(), 'other', book.id)
    expect(second).toBeDefined()
    expect(second.shipping).toEqual(first.shipping)
    expect(second.priceCents).toBe(2500)
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ productId: book.id, productType: 'other', detail: expect.stringContaining('Sendcloud no responde') }),
      expect.any(String)
    )
  })

  test('leaves the product out when there is no previous generation', async () => {
    const book = await insertShippableBook()
    failQuotesOf('other', book.id)
    const errorLog = jest.spyOn(logger, 'error')

    __resetCatalogueCache()
    const catalogue = await getProductFeedCatalogue()

    expect(findEntry(catalogue, 'other', book.id)).toBeUndefined()
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ productId: book.id, reason: 'shipping quote failed' }),
      expect.any(String)
    )
  })

  test('still drops a product that lost its images or its zones, previous generation or not', async () => {
    const lostImages = await insertArt(sellerId, { name: 'Pierde las fotos' })
    await insertImages('art', lostImages.id, 1)
    await insertZone({ methodId: artMethod, sellerId, productId: lostImages.id, productType: 'art', cost: 10, provinces: ['Madrid'] })

    const lostZones = await insertArt(sellerId, { name: 'Pierde el envío' })
    await insertImages('art', lostZones.id, 1)
    await insertZone({ methodId: artMethod, sellerId, productId: lostZones.id, productType: 'art', cost: 10, provinces: ['Madrid'] })

    __resetCatalogueCache()
    const first = await getProductFeedCatalogue()
    expect(findEntry(first, 'art', lostImages.id)).toBeDefined()
    expect(findEntry(first, 'art', lostZones.id)).toBeDefined()

    await db.execute({ sql: "DELETE FROM product_images WHERE product_type = 'art' AND product_id = ?", args: [lostImages.id] })
    await db.execute({ sql: "DELETE FROM shipping_zones WHERE product_type = 'art' AND product_id = ?", args: [lostZones.id] })
    __expireCatalogueCache()

    const second = await getProductFeedCatalogue()
    expect(findEntry(second, 'art', lostImages.id)).toBeUndefined()
    expect(findEntry(second, 'art', lostZones.id)).toBeUndefined()
  })
})
