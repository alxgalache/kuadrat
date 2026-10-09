/**
 * TEMPORARY. Proves that splitting googleMerchantFeed.js into the shared
 * product feed catalogue plus a Google serializer (meta-instagram-shop change)
 * left the Google XML byte for byte identical.
 *
 * `fixtures/googleMerchantFeed.before.js` is a frozen copy of the module as it
 * was before the change. Both generate the feed over the same database, at the
 * same moment, and must agree exactly. Delete this file and the frozen copy once
 * the result is verified in production (task 7.3 of the change).
 */

const legacy = require('./fixtures/googleMerchantFeed.before')
const current = require('../services/googleMerchantFeed')
const {
  insertSeller, insertArt, insertOther, insertImages, insertMethod, insertZone, parseItems,
} = require('./helpers/feedFixtures')

describe('Google Merchant feed after the shared catalogue refactor', () => {
  let fixtures

  beforeAll(async () => {
    const sellerId = await insertSeller('Artista "Comillas" & <Etiquetas>')
    const anonymousSellerId = await insertSeller(null)
    const artMethod = await insertMethod('art', 2)
    const otherMethod = await insertMethod('others', 3)

    const ship = (productId, productType, cost, provinces = ['Madrid']) =>
      insertZone({
        methodId: productType === 'art' ? artMethod : otherMethod,
        sellerId,
        productId,
        productType,
        cost,
        provinces,
      })

    const withMeasures = await insertArt(sellerId, {
      name: 'Con medidas',
      description: '<p>Primera</p><p>segunda &amp; tercera</p>\u0007',
      dimensions: '30,5 x 42 cm',
    })
    await insertImages('art', withMeasures.id, 3)
    await ship(withMeasures.id, 'art', 15.29)
    await ship(withMeasures.id, 'art', 27.91, ['Las Palmas'])

    const anonymous = await insertArt(anonymousSellerId, { name: 'Sin artista', description: '' })
    await insertImages('art', anonymous.id, 1)
    await insertZone({ methodId: artMethod, sellerId: anonymousSellerId, productId: anonymous.id, productType: 'art', cost: 10, provinces: ['Madrid'] })

    const sold = await insertArt(sellerId, { name: 'Vendida', isSold: 1 })
    await insertImages('art', sold.id, 1)
    await ship(sold.id, 'art', 10)

    const noImage = await insertArt(sellerId, { name: 'Sin imagen' })
    await ship(noImage.id, 'art', 10)

    const book = await insertOther(sellerId, { name: 'Libro', price: 19.9, variants: [{ key: null, stock: 4 }] })
    await insertImages('other', book.id, 2)
    await ship(book.id, 'other', 4.08)

    // Two variants, one sold out, one with its own image: the Google feed
    // still lists the product once, with the product's own images.
    const prints = await insertOther(sellerId, {
      name: 'Láminas',
      price: 35,
      variants: [{ key: 'A4', stock: 2 }, { key: 'A3', stock: 0 }],
    })
    await insertImages('other', prints.id, 1)
    await insertImages('other_var', prints.variantIds[0], 1)
    await ship(prints.id, 'other', 5)

    const soldOut = await insertOther(sellerId, { name: 'Agotado', variants: [{ key: null, stock: 0 }] })
    await insertImages('other', soldOut.id, 1)
    await ship(soldOut.id, 'other', 4.08)

    fixtures = { withMeasures, anonymous, sold, noImage, book, prints, soldOut }
  })

  test('produces exactly the XML the code before the change produced', async () => {
    const before = await legacy.generateFeed()
    const after = await current.generateFeed()

    // The fixtures are really in play, so equality is not vacuous.
    const items = parseItems(before)
    for (const key of ['withMeasures', 'anonymous', 'book', 'prints']) {
      expect(items.has(fixtures[key].slug)).toBe(true)
    }
    for (const key of ['sold', 'noImage', 'soldOut']) {
      expect(items.has(fixtures[key].slug)).toBe(false)
    }

    expect(after).toBe(before)
  })
})
