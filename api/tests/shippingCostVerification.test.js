/**
 * Shipping zone resolution and server-side cost verification
 * (openspec change: shipping-cost-verification).
 *
 * The interesting behaviour is SQL, not arithmetic: which zone row applies to
 * which (product, method, destination), and whether the number the buyer was
 * quoted is the number the payment endpoint validates. Nothing here reaches the
 * network — the resolver only touches the local test database.
 *
 * The fixture mirrors the production shape that broke checkout on 16/08/2026:
 * one `shipping_methods` row shared by several artworks and several zone
 * groups, each pairing with its own `shipping_zones.cost`.
 */

const { db } = require('../config/database')
const { verifyShippingCosts, loadProductsDetails } = require('../utils/paymentHelpers')
const { resolveShippingOptions } = require('../services/shipping/zoneResolver')
const shippingController = require('../controllers/shippingController')

// --- fixtures -------------------------------------------------------------

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`shipverify-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

async function insertArt(sellerId, overrides = {}) {
  const values = { name: 'Obra de prueba', price: 350, visible: 1, ...overrides }
  const result = await db.execute({
    sql: `INSERT INTO art (seller_id, name, description, price, slug, status, visible)
          VALUES (?, ?, 'desc', ?, ?, 'approved', ?)`,
    args: [
      sellerId,
      values.name,
      values.price,
      `slug-${Date.now()}-${Math.random()}`,
      values.visible,
    ],
  })
  return Number(result.lastInsertRowid)
}

async function insertMethod({
  name,
  type = 'delivery',
  articleType = 'art',
  optionCode = null,
  maxWeight = null,
  maxDimensions = null,
  maxArticles = 1,
} = {}) {
  const result = await db.execute({
    sql: `INSERT INTO shipping_methods (
            name, description, type, article_type, max_articles, is_active,
            estimated_delivery_days, max_weight, max_dimensions, sendcloud_option_code
          ) VALUES (?, 'desc', ?, ?, ?, 1, 2, ?, ?, ?)`,
    args: [name, type, articleType, maxArticles, maxWeight, maxDimensions, optionCode],
  })
  return Number(result.lastInsertRowid)
}

/**
 * A zone as the calculator writes them: scoped to one artwork and one zone
 * group, with the group's provinces attached as `province` refs.
 */
async function insertGeneratedZone({ methodId, sellerId, artId, group, cost, provinces }) {
  const zone = await db.execute({
    sql: `INSERT INTO shipping_zones (
            shipping_method_id, seller_id, country, cost, product_id, product_type,
            source, zone_group
          ) VALUES (?, ?, 'ES', ?, ?, 'art', 'sendcloud_calculator', ?)`,
    args: [methodId, sellerId, cost, artId, group],
  })
  const zoneId = Number(zone.lastInsertRowid)

  for (const province of provinces) {
    await db.execute({
      sql: `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
            VALUES (?, 'province', NULL, ?)`,
      args: [zoneId, province],
    })
  }

  return zoneId
}

function cartItem({ artId, methodId, cost, methodType = 'delivery' }) {
  return {
    type: 'art',
    id: artId,
    quantity: 1,
    shipping: { methodId, cost, methodType },
  }
}

// The four groups, reduced to the provinces the test seed actually carries.
const PENINSULA = ['Madrid', 'Barcelona', 'Sevilla']
const CANARIAS = ['Las Palmas', 'Santa Cruz de Tenerife']

// --- suite ----------------------------------------------------------------

describe('shipping cost verification', () => {
  let sellerId
  let sharedMethodId
  let artA
  let artB

  beforeAll(async () => {
    sellerId = await insertSeller()

    // One catalog method, as `ensureShippingMethod` creates it: keyed by option
    // code, shared by every artwork and every zone group.
    sharedMethodId = await insertMethod({
      name: 'Correos Premium',
      optionCode: 'correos:premium',
    })

    // Artwork A is created FIRST, so its zones own the lowest ids — which is
    // exactly the row the broken `LIMIT 1` lookup used to return for everyone.
    artA = await insertArt(sellerId, { name: 'Obra A', price: 300 })
    await insertGeneratedZone({
      methodId: sharedMethodId, sellerId, artId: artA,
      group: 'peninsula', cost: 11.22, provinces: PENINSULA,
    })

    artB = await insertArt(sellerId, { name: 'Obra B', price: 350 })
    await insertGeneratedZone({
      methodId: sharedMethodId, sellerId, artId: artB,
      group: 'peninsula', cost: 15.29, provinces: PENINSULA,
    })
    await insertGeneratedZone({
      methodId: sharedMethodId, sellerId, artId: artB,
      group: 'canarias', cost: 27.91, provinces: CANARIAS,
    })
  })

  async function verify(items, deliveryAddress) {
    const { artMap, otherMap } = await loadProductsDetails(items)
    return verifyShippingCosts(items, artMap, otherMap, { deliveryAddress })
  }

  describe('one method shared by several zone groups of one artwork', () => {
    it('accepts the peninsular cost for a peninsular address', async () => {
      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.29 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).resolves.toBeUndefined()
    })

    it('accepts the Canary cost for a Canary address', async () => {
      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 27.91 })],
          { country: 'ES', postalCode: '35001' }
        )
      ).resolves.toBeUndefined()
    })

    it('rejects the peninsular cost when shipping to the Canaries', async () => {
      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.29 })],
          { country: 'ES', postalCode: '35001' }
        )
      ).rejects.toMatchObject({ statusCode: 400, title: 'SHIPPING_COST_OUTDATED' })
    })
  })

  describe('one method shared by several artworks', () => {
    it("does not validate artwork B against artwork A's cost", async () => {
      // The regression: A's zone has the lowest id, so `LIMIT 1` returned 11,22
      // for every checkout of every artwork on this method.
      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 11.22 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).rejects.toMatchObject({ statusCode: 400, title: 'SHIPPING_COST_OUTDATED' })
    })

    it('validates each artwork against its own cost', async () => {
      await expect(
        verify(
          [cartItem({ artId: artA, methodId: sharedMethodId, cost: 11.22 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).resolves.toBeUndefined()
    })
  })

  describe('the destination that prices the order', () => {
    it('rejects a delivery item that arrives with no address', async () => {
      await expect(
        verify([cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.29 })], null)
      ).rejects.toMatchObject({ statusCode: 400, title: 'SHIPPING_ADDRESS_REQUIRED' })
    })

    it('does not fall back to the postal code stored in the cart item', async () => {
      // The cart carries the postal code that was used to quote. Accepting it as
      // the destination would make omitting `deliveryAddress` a way to choose
      // the cheaper zone.
      const item = cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.29 })
      item.shipping.deliveryCountry = 'ES'
      item.shipping.deliveryPostalCode = '28001'

      await expect(verify([item], null)).rejects.toMatchObject({
        title: 'SHIPPING_ADDRESS_REQUIRED',
      })
    })

    it('ignores the cart postal code when an address is given', async () => {
      // Quoted as peninsular, shipping to the Canaries: the Canary price is the
      // one that applies, and the peninsular cost must not be accepted.
      const item = cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.29 })
      item.shipping.deliveryPostalCode = '28001'

      await expect(
        verify([item], { country: 'ES', postalCode: '35001' })
      ).rejects.toMatchObject({ title: 'SHIPPING_COST_OUTDATED' })
    })

    it('rejects a method that does not serve the destination', async () => {
      // Artwork A only has a peninsular zone on this method.
      await expect(
        verify(
          [cartItem({ artId: artA, methodId: sharedMethodId, cost: 11.22 })],
          { country: 'ES', postalCode: '35001' }
        )
      ).rejects.toMatchObject({ statusCode: 400, title: 'SHIPPING_METHOD_UNAVAILABLE' })
    })
  })

  describe('pickup', () => {
    let pickupMethodId
    let pickupArt

    beforeAll(async () => {
      pickupMethodId = await insertMethod({ name: 'Recogida en galería', type: 'pickup' })
      pickupArt = await insertArt(sellerId, { name: 'Obra recogida' })
      await db.execute({
        sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost, product_id, product_type)
              VALUES (?, ?, 'ES', 0, ?, 'art')`,
        args: [pickupMethodId, sellerId, pickupArt],
      })
    })

    it('accepts a pickup-only cart with no delivery address', async () => {
      await expect(
        verify(
          [cartItem({ artId: pickupArt, methodId: pickupMethodId, cost: 0, methodType: 'pickup' })],
          null
        )
      ).resolves.toBeUndefined()
    })
  })

  describe('product-specific zones beat generic ones', () => {
    let methodId
    let specificArt

    beforeAll(async () => {
      methodId = await insertMethod({ name: 'Tarifa general' })
      specificArt = await insertArt(sellerId, { name: 'Obra con tarifa propia' })

      // Generic zone for the whole seller, then a cheaper-to-find specific one.
      // The generic is inserted FIRST so it owns the lower id: if priority were
      // dropped, the generic would win and this test would catch it.
      const generic = await db.execute({
        sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost)
              VALUES (?, ?, 'ES', 9.99)`,
        args: [methodId, sellerId],
      })
      await db.execute({
        sql: `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
              VALUES (?, 'province', NULL, 'Madrid')`,
        args: [Number(generic.lastInsertRowid)],
      })

      await insertGeneratedZone({
        methodId, sellerId, artId: specificArt,
        group: 'peninsula', cost: 21.5, provinces: PENINSULA,
      })
    })

    it('verifies against the product-specific zone, not the generic one', async () => {
      await expect(
        verify(
          [cartItem({ artId: specificArt, methodId, cost: 21.5 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).resolves.toBeUndefined()

      await expect(
        verify(
          [cartItem({ artId: specificArt, methodId, cost: 9.99 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).rejects.toMatchObject({ title: 'SHIPPING_COST_OUTDATED' })
    })
  })

  describe('floating point tolerance', () => {
    it('accepts a difference of one cent and rejects two', async () => {
      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.3 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).resolves.toBeUndefined()

      await expect(
        verify(
          [cartItem({ artId: artB, methodId: sharedMethodId, cost: 15.31 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).rejects.toMatchObject({ title: 'SHIPPING_COST_OUTDATED' })
    })
  })

  describe('a hidden product has no shipping', () => {
    it('rejects payment for an artwork that is no longer visible', async () => {
      const hidden = await insertArt(sellerId, { name: 'Obra oculta', visible: 0 })
      await insertGeneratedZone({
        methodId: sharedMethodId, sellerId, artId: hidden,
        group: 'peninsula', cost: 12, provinces: PENINSULA,
      })

      await expect(
        verify(
          [cartItem({ artId: hidden, methodId: sharedMethodId, cost: 12 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('Sendcloud-quoted items are left alone', () => {
    it('skips an item that carries no shipping method', async () => {
      const sendcloudItem = { type: 'art', id: artB, quantity: 1, shipping: null }

      // No address, and the item would otherwise fail every check: the guard on
      // `shipping.methodId` is what keeps the Sendcloud flow out of this path.
      await expect(verify([sendcloudItem], null)).resolves.toBeUndefined()
    })
  })

  describe("the store's own vocabulary", () => {
    // `shipping_methods.article_type` says 'others'; `shipping_zones.product_type`
    // and the cart say 'other'. Comparing the cart's word against article_type
    // silently drops every method that is not 'all'.
    let otherId
    let othersMethodId

    beforeAll(async () => {
      const product = await db.execute({
        sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible)
              VALUES (?, 'Producto tienda', 'desc', ?, ?, 'approved', 1)`,
        args: [sellerId, 40, `other-${Date.now()}-${Math.random()}`],
      })
      otherId = Number(product.lastInsertRowid)

      othersMethodId = await insertMethod({
        name: 'Envío tienda',
        articleType: 'others',
      })
      const zone = await db.execute({
        sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost)
              VALUES (?, ?, 'ES', 4.75)`,
        args: [othersMethodId, sellerId],
      })
      await db.execute({
        sql: `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
              VALUES (?, 'province', NULL, 'Madrid')`,
        args: [Number(zone.lastInsertRowid)],
      })
    })

    it("resolves an 'others' method for a cart item typed 'other'", async () => {
      const { delivery } = await resolveShippingOptions({
        productId: otherId,
        productType: 'other',
        country: 'ES',
        postalCode: '28001',
      })

      expect(delivery.map((o) => o.methodId)).toContain(othersMethodId)
    })

    it('verifies a store item through the same path', async () => {
      const item = {
        type: 'other',
        id: otherId,
        quantity: 1,
        shipping: { methodId: othersMethodId, cost: 4.75, methodType: 'delivery' },
      }

      await expect(
        verify([item], { country: 'ES', postalCode: '28001' })
      ).resolves.toBeUndefined()
    })

    it("accepts the endpoint's 'others' spelling too", async () => {
      const { delivery } = await resolveShippingOptions({
        productId: otherId,
        productType: 'others',
        country: 'ES',
        postalCode: '28001',
      })

      expect(delivery.map((o) => o.methodId)).toContain(othersMethodId)
    })
  })

  describe('a method the product does not fit is not offered', () => {
    it('excludes it from the quote and refuses to verify against it', async () => {
      const tinyMethod = await insertMethod({
        name: 'Sobre acolchado',
        maxWeight: 500,
        maxDimensions: '30x20x2',
      })
      const bulky = await insertArt(sellerId, { name: 'Obra voluminosa' })
      await db.execute({
        sql: 'UPDATE art SET weight = 8000, dimensions = ? WHERE id = ?',
        args: ['90x70x6', bulky],
      })
      await insertGeneratedZone({
        methodId: tinyMethod, sellerId, artId: bulky,
        group: 'peninsula', cost: 3.5, provinces: PENINSULA,
      })

      const { delivery } = await resolveShippingOptions({
        productId: bulky, productType: 'art', country: 'ES', postalCode: '28001',
      })
      expect(delivery.map((o) => o.methodId)).not.toContain(tinyMethod)

      await expect(
        verify(
          [cartItem({ artId: bulky, methodId: tinyMethod, cost: 3.5 })],
          { country: 'ES', postalCode: '28001' }
        )
      ).rejects.toMatchObject({ title: 'SHIPPING_METHOD_UNAVAILABLE' })
    })
  })

  describe('country-wide zones without a postal code', () => {
    it('offers only zones that carry no postal refs', async () => {
      const countryMethod = await insertMethod({ name: 'Envío nacional' })
      const art = await insertArt(sellerId, { name: 'Obra nacional' })

      // Country-wide: no `shipping_zones_postal_codes` rows at all.
      await db.execute({
        sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost, product_id, product_type)
              VALUES (?, ?, 'ES', 7.25, ?, 'art')`,
        args: [countryMethod, sellerId, art],
      })

      const { delivery } = await resolveShippingOptions({
        productId: art, productType: 'art', country: 'ES',
      })

      expect(delivery).toHaveLength(1)
      expect(delivery[0]).toMatchObject({ methodId: countryMethod, cost: 7.25 })
      expect(delivery[0].zoneId).toEqual(expect.any(Number))
    })
  })

  describe('the HTTP contract of GET /api/shipping/available', () => {
    it('keeps the snake_case shape the client reads', async () => {
      const req = {
        query: { productId: String(artB), productType: 'art', country: 'ES', postalCode: '28001' },
      }
      let payload
      const res = { status: () => ({ json: (body) => { payload = body } }) }
      await shippingController.getAvailableShipping(req, res, (err) => { throw err })

      expect(Object.keys(payload).sort()).toEqual(['delivery', 'pickup', 'success'])
      expect(payload.success).toBe(true)
      expect(Object.keys(payload.delivery[0]).sort()).toEqual([
        'cost', 'description', 'estimated_delivery_days', 'id', 'max_articles', 'name', 'type',
      ])
      // The zone id is resolved internally and deliberately not exposed: a
      // client that could name the priced row could choose the price.
      expect(payload.delivery[0]).not.toHaveProperty('zone_id')
    })

    it('still rejects an unknown product type', async () => {
      const req = { query: { productId: String(artB), productType: 'invalid' } }
      const res = { status: () => ({ json: () => {} }) }
      await expect(
        new Promise((resolve, reject) => {
          shippingController.getAvailableShipping(req, res, reject).then(resolve, reject)
        })
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  // -------------------------------------------------------------------------
  // The structural guard.
  //
  // Every other test here proves the current defect is fixed. This one is what
  // stops it coming back: it asserts that the number the buyer is quoted and
  // the number the server validates are the same, so a future parallel query
  // fails the suite rather than silently disagreeing.
  // -------------------------------------------------------------------------
  describe('parity between the quote and the verification', () => {
    const destinations = [
      { country: 'ES', postalCode: '28001' },
      { country: 'ES', postalCode: '08001' },
      { country: 'ES', postalCode: '35001' },
      { country: 'ES', postalCode: '38001' },
    ]

    async function quotedOptions(productId, productType, destination) {
      const req = {
        query: {
          productId: String(productId),
          productType,
          country: destination.country,
          postalCode: destination.postalCode,
        },
      }
      let payload
      const res = { status: () => ({ json: (body) => { payload = body } }) }
      await shippingController.getAvailableShipping(req, res, (err) => { throw err })
      return payload
    }

    it('quotes and verifies the same cost for every artwork and destination', async () => {
      for (const artId of [artA, artB]) {
        for (const destination of destinations) {
          const quoted = await quotedOptions(artId, 'art', destination)
          const offered = [...quoted.pickup, ...quoted.delivery]

          for (const option of offered) {
            // What the buyer was shown must be accepted verbatim...
            await expect(
              verify(
                [cartItem({
                  artId,
                  methodId: option.id,
                  cost: option.cost,
                  methodType: option.type,
                })],
                destination
              )
            ).resolves.toBeUndefined()

            // ...and one cent more must not be.
            await expect(
              verify(
                [cartItem({
                  artId,
                  methodId: option.id,
                  cost: option.cost + 0.5,
                  methodType: option.type,
                })],
                destination
              )
            ).rejects.toMatchObject({ title: 'SHIPPING_COST_OUTDATED' })
          }
        }
      }
    })
  })
})
