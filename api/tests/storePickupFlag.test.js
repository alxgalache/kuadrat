/**
 * "Recogida en persona" availability for STORE ('other') products
 * (openspec change: store-pickup-flag).
 *
 * One flag decides, and nothing else: `user_sendcloud_configuration.
 * allow_store_pickup`. Before this change the option appeared whenever the
 * seller happened to have `users.pickup_address` and `users.pickup_city`
 * filled in — an address captured for other reasons was silently doubling as
 * consent to receive buyers at the door.
 *
 * Two properties are worth a regression test because both are invisible when
 * broken (the endpoint answers 200 either way, and `pickupOption: null` reads
 * as a legitimate "not offered"):
 *
 *   1. The address does not grant, and its absence does not deny.
 *   2. Art never gets the option here. Art shipments are arranged by hand from
 *      the Sendcloud web interface, so an art-only group must not be offered
 *      pickup even for a seller who allows it for their store.
 *
 * Nothing here reaches the network: `.env.test` disables Sendcloud for both
 * product types, so `getProvider()` returns the legacy provider and the whole
 * run stays on the local test database.
 */

const { db } = require('../config/database')
const { getShippingOptions } = require('../controllers/shippingOptionsController')

// --- fixtures -------------------------------------------------------------

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible,
                             pickup_address, pickup_city, pickup_postal_code, pickup_country)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1,
                  'Calle Séneca 24', 'Campillos', '29320', 'ES')`,
    args: [`storepickup-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

async function clearPickupAddress(sellerId) {
  await db.execute({
    sql: `UPDATE users SET pickup_address = '', pickup_city = '' WHERE id = ?`,
    args: [sellerId],
  })
}

async function insertOther(sellerId) {
  const result = await db.execute({
    sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible, weight, dimensions, can_copack)
          VALUES (?, 'Libro de prueba', 'desc', 20, ?, 'approved', 1, 600, '30x30x4', 1)`,
    args: [sellerId, `other-${Date.now()}-${Math.random()}`],
  })
  return Number(result.lastInsertRowid)
}

async function insertArt(sellerId) {
  const result = await db.execute({
    sql: `INSERT INTO art (seller_id, name, description, price, slug, status, visible, weight, dimensions)
          VALUES (?, 'Obra de prueba', 'desc', 350, ?, 'approved', 1, 2000, '40x40x5')`,
    args: [sellerId, `art-${Date.now()}-${Math.random()}`],
  })
  return Number(result.lastInsertRowid)
}

async function insertSendcloudConfig(sellerId, allowStorePickup) {
  await db.execute({
    sql: `INSERT INTO user_sendcloud_configuration (user_id, sender_postal_code, sender_country, allow_store_pickup)
          VALUES (?, '29320', 'ES', ?)`,
    args: [sellerId, allowStorePickup],
  })
}

/**
 * Drive the controller directly. It only ever touches `req.body`, so a plain
 * object is a faithful stand-in for the Express request, and going through
 * supertest would add the router and its validation without exercising
 * anything this test is about.
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

  const next = (err) => { throw err }

  await getShippingOptions(req, res, next)

  const body = payload?.data ?? payload
  return body.sellers
}

function storeItem(sellerId, productId) {
  return { productId, productType: 'other', quantity: 1, sellerId, canCopack: true }
}

function artItem(sellerId, productId) {
  return { productId, productType: 'art', quantity: 1, sellerId }
}

// --- tests ----------------------------------------------------------------

describe('store pickup availability (allow_store_pickup)', () => {
  test('a filled-in pickup address does NOT offer pickup when the flag is off', async () => {
    const sellerId = await insertSeller()
    const otherId = await insertOther(sellerId)
    await insertSendcloudConfig(sellerId, 0)

    const [seller] = await callGetShippingOptions([storeItem(sellerId, otherId)])

    // The seller row carries a complete pickup address — under the previous
    // rule this alone was enough to offer the option.
    expect(seller.pickupOption).toBeNull()
  })

  test('the flag alone offers pickup, and the address is carried for display', async () => {
    const sellerId = await insertSeller()
    const otherId = await insertOther(sellerId)
    await insertSendcloudConfig(sellerId, 1)

    const [seller] = await callGetShippingOptions([storeItem(sellerId, otherId)])

    expect(seller.pickupOption).toMatchObject({
      address: 'Calle Séneca 24',
      city: 'Campillos',
      postalCode: '29320',
      country: 'ES',
    })
  })

  test('an empty pickup address does not deny the option', async () => {
    const sellerId = await insertSeller()
    const otherId = await insertOther(sellerId)
    await insertSendcloudConfig(sellerId, 1)
    await clearPickupAddress(sellerId)

    const [seller] = await callGetShippingOptions([storeItem(sellerId, otherId)])

    // Offered, with nothing to show for it. The cart renders only the parts
    // that exist rather than a bare ", ".
    expect(seller.pickupOption).not.toBeNull()
    expect(seller.pickupOption.address).toBe('')
    expect(seller.pickupOption.city).toBe('')
  })

  test('a seller with no Sendcloud configuration row is not offered pickup', async () => {
    const sellerId = await insertSeller()
    const otherId = await insertOther(sellerId)
    // No insertSendcloudConfig: the LEFT JOIN yields null, which must read the
    // same as an explicit 0 rather than as "unknown".

    const [seller] = await callGetShippingOptions([storeItem(sellerId, otherId)])

    expect(seller.pickupOption).toBeNull()
  })

  test('an art-only group is never offered pickup, flag or no flag', async () => {
    const sellerId = await insertSeller()
    const artId = await insertArt(sellerId)
    await insertSendcloudConfig(sellerId, 1)

    const [seller] = await callGetShippingOptions([artItem(sellerId, artId)])

    expect(seller.pickupOption).toBeNull()
  })

  test('a mixed group is offered pickup on account of its store items', async () => {
    const sellerId = await insertSeller()
    const otherId = await insertOther(sellerId)
    const artId = await insertArt(sellerId)
    await insertSendcloudConfig(sellerId, 1)

    const [seller] = await callGetShippingOptions([
      artItem(sellerId, artId),
      storeItem(sellerId, otherId),
    ])

    expect(seller.pickupOption).not.toBeNull()
  })
})
