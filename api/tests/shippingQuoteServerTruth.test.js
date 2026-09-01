/**
 * The quoting endpoint derives every price-determining attribute from the
 * product row, never from the request
 * (openspec change: sendcloud-store-shipping-accuracy, bloque 1).
 *
 * `POST /api/shipping/options` is public and unauthenticated. Two of the
 * attributes it used to take from the caller set a price:
 *
 *   - `canCopack` decides how many parcels the shipment has. It was never
 *     stored on the cart item, so the client always sent `true`; a product
 *     marked `can_copack = 0` was quoted as ONE parcel and later announced as
 *     N by `paymentsController`, which does read the column.
 *   - `price` was never sent at all, so the insured value summed zeros and
 *     `insuredValueFor(0)` fell to the 2 € floor of its clamp, while the
 *     announcement insured the real value. The buyer was quoted a premium the
 *     parcel did not carry, and the difference was paid by the gallery.
 *
 * Both are invisible when broken: the endpoint answers 200, the parcel count
 * and the price both look plausible, and the discrepancy only shows up on the
 * carrier's invoice.
 *
 * Nothing here reaches the network: `.env.test` disables Sendcloud for both
 * product types, so `getProvider()` returns the legacy provider.
 */

const { db } = require('../config/database')
const { getShippingOptions } = require('../controllers/shippingOptionsController')
const { enrichItemsFromDB } = require('../services/shipping/cartQuoting')
const { groupIntoParcels } = require('../services/shipping/parcelGrouper')
const { insuredValueFor } = require('../services/shipping/sendcloudPricing')

// --- fixtures -------------------------------------------------------------

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`servertruth-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

async function insertOther(sellerId, { price = 20, weight = 600, dimensions = '30x30x4', canCopack = 1 } = {}) {
  const result = await db.execute({
    sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible, weight, dimensions, can_copack)
          VALUES (?, 'Libro de prueba', 'desc', ?, ?, 'approved', 1, ?, ?, ?)`,
    args: [sellerId, price, `other-${Date.now()}-${Math.random()}`, weight, dimensions, canCopack],
  })
  return Number(result.lastInsertRowid)
}

/**
 * Drive the controller directly: it only ever reads `req.body`, so a plain
 * object is a faithful stand-in for the Express request.
 */
async function callGetShippingOptions(items) {
  const req = {
    body: {
      items,
      deliveryAddress: { country: 'ES', postalCode: '28001', city: 'Madrid', address: 'Gran Vía 1' },
    },
  }

  let payload = null
  const res = {
    status() { return this },
    json(body) { payload = body; return this },
  }

  await getShippingOptions(req, res, (err) => { throw err })

  const body = payload?.data ?? payload
  return body.sellers
}

// --- tests ----------------------------------------------------------------

describe('co-packability comes from the database, not from the request', () => {
  test('a request claiming canCopack:true cannot co-pack a can_copack = 0 product', async () => {
    const sellerId = await insertSeller()
    const productId = await insertOther(sellerId, { canCopack: 0 })

    const [seller] = await callGetShippingOptions([
      // Exactly what the old client sent, and what an attacker would send:
      // the field is stripped by the schema and overwritten by the DB read.
      { productId, productType: 'other', quantity: 2, sellerId, canCopack: true },
    ])

    // One parcel per unit, which is what `createShipments` will announce.
    // Before this change the request's `true` won and the answer was 1.
    expect(seller.parcelCount).toBe(2)
  })

  test('a can_copack = 1 product is still aggregated into a single parcel', async () => {
    const sellerId = await insertSeller()
    const productId = await insertOther(sellerId, { canCopack: 1 })

    const [seller] = await callGetShippingOptions([
      { productId, productType: 'other', quantity: 3, sellerId },
    ])

    expect(seller.parcelCount).toBe(1)
    expect(seller.productCount).toBe(3)
  })

  test('several co-packable products of one seller share a parcel; a non-co-packable one does not', async () => {
    const sellerId = await insertSeller()
    const copackA = await insertOther(sellerId, { canCopack: 1 })
    const copackB = await insertOther(sellerId, { canCopack: 1 })
    const alone = await insertOther(sellerId, { canCopack: 0 })

    const [seller] = await callGetShippingOptions([
      { productId: copackA, productType: 'other', quantity: 1, sellerId },
      { productId: copackB, productType: 'other', quantity: 1, sellerId },
      { productId: alone, productType: 'other', quantity: 1, sellerId },
    ])

    // One aggregated parcel for the two co-packable items, one for the other.
    expect(seller.parcelCount).toBe(2)
  })
})

describe('the insured value is the real goods value, not the clamp floor', () => {
  test('two units of a 20 € product are insured for 40, not for 2', async () => {
    const sellerId = await insertSeller()
    const productId = await insertOther(sellerId, { price: 20 })

    // The request mentions no price at all — the current client sends none.
    const enriched = await enrichItemsFromDB([
      { productId, productType: 'other', quantity: 2, sellerId },
    ])
    const [parcel] = groupIntoParcels(enriched)

    expect(parcel.totalValue).toBe(40)
    // Before this change `totalValue` summed zeros and this was 2.
    expect(insuredValueFor(parcel.totalValue)).toBe(40)
  })

  test('a price supplied by the request cannot lower the insured value', async () => {
    const sellerId = await insertSeller()
    const productId = await insertOther(sellerId, { price: 20 })

    const enriched = await enrichItemsFromDB([
      { productId, productType: 'other', quantity: 1, sellerId, price: 1 },
    ])

    expect(enriched[0].price).toBe(20)
    expect(insuredValueFor(groupIntoParcels(enriched)[0].totalValue)).toBe(20)
  })

  test('weight and dimensions are read from the product row', async () => {
    const sellerId = await insertSeller()
    const productId = await insertOther(sellerId, { weight: 600, dimensions: '30x30x4' })

    const enriched = await enrichItemsFromDB([
      { productId, productType: 'other', quantity: 1, sellerId, weight: 1, dimensions: '1x1x1' },
    ])

    expect(enriched[0].weight).toBe(600)
    expect(enriched[0].dimensions).toBe('30x30x4')
  })
})
