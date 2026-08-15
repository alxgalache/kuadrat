/**
 * Tests for the art shipping calculator
 * (openspec change: sendcloud-art-shipping-calculator, blocks 2 and 3).
 *
 * These run against the real test database — the interesting behaviour is the
 * SQL, not the arithmetic: what a regeneration deletes, what it leaves alone,
 * and whether the rows it writes are the ones `getAvailableShipping()` finds.
 * Only the Sendcloud HTTP client is mocked, so no test reaches the network.
 */

jest.mock('../services/shipping/sendcloudApiClient', () => ({
  post: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  getBinary: jest.fn(),
}))

const sendcloud = require('../services/shipping/sendcloudApiClient')
const { db } = require('../config/database')
const calculator = require('../services/shipping/artShippingCalculator')
const shippingController = require('../controllers/shippingController')

// --- fixtures -------------------------------------------------------------

let sellerId
let artId

async function insertSeller({ insuranceType = 'none' } = {}) {
  const user = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`artist-${Date.now()}-${Math.random()}@example.com`],
  })
  const id = Number(user.lastInsertRowid)

  await db.execute({
    sql: `INSERT INTO user_sendcloud_configuration (
            user_id, sender_name, sender_address_1, sender_city,
            sender_postal_code, sender_country, insurance_type, insurance_fixed_amount
          ) VALUES (?, 'Galería', 'Calle Feria 1', 'Sevilla', '41005', 'ES', ?, 99)`,
    args: [id, insuranceType],
  })

  return id
}

async function insertArt(seller, overrides = {}) {
  const values = {
    name: 'Retrato nº3',
    price: 350.5,
    outside_dimensions: '70x70x8',
    outside_weight: 5500,
    packaging_cost: 5,
    ...overrides,
  }

  const result = await db.execute({
    sql: `INSERT INTO art (
            seller_id, name, description, price, slug, status,
            outside_dimensions, outside_weight, packaging_cost
          ) VALUES (?, ?, 'desc', ?, ?, 'approved', ?, ?, ?)`,
    args: [
      seller,
      values.name,
      values.price,
      `slug-${Date.now()}-${Math.random()}`,
      values.outside_dimensions,
      values.outside_weight,
      values.packaging_cost,
    ],
  })

  return Number(result.lastInsertRowid)
}

function selection(optionCode, baseCost, carrierCode = 'correos') {
  return { optionCode, name: optionCode, carrierCode, baseCost, estimatedDays: 2 }
}

async function methodRows(optionCode) {
  const result = await db.execute({
    sql: 'SELECT id, name FROM shipping_methods WHERE sendcloud_option_code = ?',
    args: [optionCode],
  })
  return result.rows
}

async function generatedZones(art, group) {
  const result = await db.execute({
    sql: `SELECT sendcloud_option_code, cost, base_cost, packaging_cost_snapshot,
                 zone_group, source
            FROM shipping_zones
           WHERE product_id = ? AND product_type = 'art' AND zone_group = ?
             AND source = 'sendcloud_calculator'
           ORDER BY sendcloud_option_code`,
    args: [art, group],
  })
  return result.rows
}

// --- suite ----------------------------------------------------------------

describe('art shipping calculator', () => {
  beforeAll(async () => {
    sellerId = await insertSeller()
    artId = await insertArt(sellerId)
  })

  // No teardown: every test creates its own artwork and asserts only on rows
  // scoped to it, and globalTeardown deletes the database file at the end of
  // the run.

  beforeEach(() => {
    sendcloud.post.mockReset()
  })

  describe('computeFinalPrice', () => {
    it('taxes the transport and adds packaging afterwards', () => {
      // 8,48 x 1,21 = 10,26 -> + 5,00 = 15,26
      expect(calculator.computeFinalPrice(8.48, 5)).toBe(15.26)
    })

    it('treats a missing packaging cost as zero', () => {
      expect(calculator.computeFinalPrice(6.38, 0)).toBe(7.72)
      expect(calculator.computeFinalPrice(6.38, null)).toBe(7.72)
    })
  })

  describe('classifyOptions', () => {
    const raw = (code, total, extra = {}) => ({
      code,
      name: code,
      carrier: { code: 'correos', name: 'Correos' },
      quotes: total === null
        ? []
        : [{ price: { total: { value: total, currency: 'EUR' }, breakdown: extra.breakdown || [] } }],
    })

    it('separates eligible options from those with no rate', () => {
      const { eligible, noRate } = calculator.classifyOptions(
        [raw('correos:standard', '8.48'), raw('ups:standard', null)],
        5
      )

      expect(eligible.map(o => o.optionCode)).toEqual(['correos:standard'])
      expect(noRate.map(o => o.optionCode)).toEqual(['ups:standard'])
      expect(noRate[0].status).toBe('no_rate')
    })

    it('discards a zero-priced option entirely, in neither list', () => {
      const { eligible, noRate } = calculator.classifyOptions(
        [raw('sendcloud:letter', '0'), raw('correos:standard', '8.48')],
        0
      )

      expect(eligible.map(o => o.optionCode)).toEqual(['correos:standard'])
      expect(noRate).toEqual([])
    })

    it('carries the breakdown, the VAT amount and the final price', () => {
      const { eligible } = calculator.classifyOptions(
        [raw('correos:standard', '8.48', {
          breakdown: [
            { type: 'shipping', label: 'Envío', price: { value: '6.38', currency: 'EUR' } },
            { type: 'insurance_price', label: 'Seguro', price: { value: '2.10', currency: 'EUR' } },
          ],
        })],
        5
      )

      expect(eligible[0].baseCost).toBe(8.48)
      expect(eligible[0].vatAmount).toBe(1.78)
      expect(eligible[0].packagingCost).toBe(5)
      expect(eligible[0].finalPrice).toBe(15.26)
      expect(eligible[0].breakdown).toEqual([
        { type: 'shipping', label: 'Envío', amount: 6.38 },
        { type: 'insurance_price', label: 'Seguro', amount: 2.1 },
      ])
    })
  })

  describe('buildParcel', () => {
    it('refuses to quote without external dimensions or weight', () => {
      expect(() => calculator.buildParcel({ price: 100, outside_weight: 5000 }))
        .toThrow(/dimensiones externas/)
      expect(() => calculator.buildParcel({ price: 100, outside_dimensions: '70x70x8' }))
        .toThrow(/peso externo/)
    })

    it('never substitutes the artwork measurements for the package ones', () => {
      // The artwork has its own dimensions and weight; they must not rescue the
      // call, because the carrier bills the volumetric weight of the box.
      expect(() =>
        calculator.buildParcel({ price: 100, dimensions: '60x60x2', weight: 3000 })
      ).toThrow(/embalaje/)
    })

    it('sends the package measurements and the insured value', () => {
      const parcel = calculator.buildParcel({
        price: 350.5,
        outside_dimensions: '70x70x8',
        outside_weight: 5500,
      })

      expect(parcel.weight).toEqual({ value: '5.5', unit: 'kg' })
      expect(parcel.dimensions).toEqual({ length: '70', width: '70', height: '8', unit: 'cm' })
      expect(parcel.additional_insured_price).toBe(351)
    })
  })

  describe('quoteArtwork', () => {
    const okResponse = {
      data: [{
        code: 'correos:standard',
        name: 'Correos Estandar',
        carrier: { code: 'correos', name: 'Correos' },
        quotes: [{ price: { total: { value: '8.48', currency: 'EUR' }, breakdown: [] } }],
      }],
    }

    it.each([['none'], ['full_value'], ['fixed']])(
      'insures the artwork for its own price whatever insurance_type is (%s)',
      async (insuranceType) => {
        const seller = await insertSeller({ insuranceType })
        const art = await insertArt(seller, { price: 1200 })
        sendcloud.post.mockResolvedValue(okResponse)

        await calculator.quoteArtwork({ artId: art })

        for (const call of sendcloud.post.mock.calls) {
          expect(call[1].body.parcels[0].additional_insured_price).toBe(1200)
        }
      }
    )

    it('issues one request per zone group, each with its own postal code', async () => {
      sendcloud.post.mockResolvedValue(okResponse)

      const result = await calculator.quoteArtwork({ artId })

      expect(sendcloud.post).toHaveBeenCalledTimes(4)
      const destinations = sendcloud.post.mock.calls.map(c => c[1].body.to_address.postal_code)
      expect(destinations.sort()).toEqual(['07001', '28001', '35001', '51001'])
      expect(Object.keys(result.groups).sort()).toEqual(
        ['baleares', 'canarias', 'ceuta_melilla', 'peninsula']
      )
    })

    it('keeps the other three groups when one call fails', async () => {
      sendcloud.post
        .mockResolvedValueOnce(okResponse)
        .mockRejectedValueOnce(new Error('Sendcloud caído'))
        .mockResolvedValueOnce(okResponse)
        .mockResolvedValueOnce(okResponse)

      const result = await calculator.quoteArtwork({ artId })

      const failed = Object.values(result.groups).filter(g => g.error)
      const succeeded = Object.values(result.groups).filter(g => !g.error)

      expect(failed).toHaveLength(1)
      expect(failed[0].error).toBe('Sendcloud caído')
      expect(succeeded).toHaveLength(3)
      expect(succeeded.every(g => g.options.length === 1)).toBe(true)
    })

    it('refuses without calling Sendcloud when the package data is missing', async () => {
      const art = await insertArt(sellerId, { outside_dimensions: null, outside_weight: null })

      await expect(calculator.quoteArtwork({ artId: art })).rejects.toMatchObject({ statusCode: 400 })
      expect(sendcloud.post).not.toHaveBeenCalled()
    })

    it('refuses when the artist has no Sendcloud configuration', async () => {
      const orphan = await db.execute({
        sql: `INSERT INTO users (email, password_hash, role, full_name)
              VALUES (?, 'x', 'seller', 'Sin config')`,
        args: [`orphan-${Date.now()}@example.com`],
      })
      const art = await insertArt(Number(orphan.lastInsertRowid))

      await expect(calculator.quoteArtwork({ artId: art })).rejects.toMatchObject({ statusCode: 400 })
      expect(sendcloud.post).not.toHaveBeenCalled()
    })
  })

  describe('applyZoneSelection', () => {
    it('writes one zone per selected option, with its own price', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [
          selection('correos:standard', 6.38),
          selection('correos_express:paq24', 9.1, 'correos_express'),
          selection('ups:standard', 10.4, 'ups'),
        ],
      })

      const zones = await generatedZones(art, 'peninsula')
      expect(zones).toHaveLength(3)
      expect(zones.map(z => z.sendcloud_option_code).sort()).toEqual([
        'correos:standard',
        'correos_express:paq24',
        'ups:standard',
      ])

      const correos = zones.find(z => z.sendcloud_option_code === 'correos:standard')
      expect(correos.base_cost).toBe(6.38)
      expect(correos.packaging_cost_snapshot).toBe(5)
      expect(correos.cost).toBe(12.72) // round(6.38 x 1.21, 2) = 7.72 + 5.00
    })

    it('replaces the previous set rather than adding to it', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [
          selection('correos:standard', 6.38),
          selection('correos_express:paq24', 9.1, 'correos_express'),
          selection('ups:standard', 10.4, 'ups'),
        ],
      })
      expect(await generatedZones(art, 'peninsula')).toHaveLength(3)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [selection('correos:standard', 6.38), selection('ups:standard', 10.4, 'ups')],
      })

      const zones = await generatedZones(art, 'peninsula')
      expect(zones.map(z => z.sendcloud_option_code)).toEqual(['correos:standard', 'ups:standard'])
    })

    it('clears the territory when everything is deselected', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'baleares',
        selections: [selection('correos:standard', 8.48)],
      })
      expect(await generatedZones(art, 'baleares')).toHaveLength(1)

      await calculator.applyZoneSelection({ artId: art, zoneGroup: 'baleares', selections: [] })

      expect(await generatedZones(art, 'baleares')).toHaveLength(0)
      const orphanRefs = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM shipping_zones_postal_codes szpc
               WHERE NOT EXISTS (SELECT 1 FROM shipping_zones z WHERE z.id = szpc.shipping_zone_id)`,
        args: [],
      })
      expect(Number(orphanRefs.rows[0].n)).toBe(0)
    })

    it('regenerating one group leaves the other three untouched', async () => {
      const art = await insertArt(sellerId)

      for (const group of ['peninsula', 'baleares', 'canarias', 'ceuta_melilla']) {
        await calculator.applyZoneSelection({
          artId: art,
          zoneGroup: group,
          selections: [selection('correos:standard', 8.48)],
        })
      }

      const before = {}
      for (const group of ['peninsula', 'canarias', 'ceuta_melilla']) {
        before[group] = await generatedZones(art, group)
      }

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'baleares',
        selections: [selection('correos_express:baleares_express', 11.2, 'correos_express')],
      })

      for (const group of ['peninsula', 'canarias', 'ceuta_melilla']) {
        expect(await generatedZones(art, group)).toEqual(before[group])
      }
      expect((await generatedZones(art, 'baleares'))[0].sendcloud_option_code)
        .toBe('correos_express:baleares_express')
    })

    it('never touches a manually created zone of the same artwork', async () => {
      const art = await insertArt(sellerId)

      const method = await db.execute({
        sql: `INSERT INTO shipping_methods (name, type, article_type, is_active)
              VALUES ('Entrega a mano', 'delivery', 'art', 1)`,
      })
      const manual = await db.execute({
        sql: `INSERT INTO shipping_zones (
                shipping_method_id, seller_id, country, cost, product_id, product_type, zone_group
              ) VALUES (?, ?, 'ES', 42, ?, 'art', 'peninsula')`,
        args: [Number(method.lastInsertRowid), sellerId, art],
      })
      const manualId = Number(manual.lastInsertRowid)

      for (let i = 0; i < 3; i++) {
        await calculator.applyZoneSelection({
          artId: art,
          zoneGroup: 'peninsula',
          selections: [selection('correos:standard', 6.38)],
        })
      }

      const survivor = await db.execute({
        sql: 'SELECT id, cost, source FROM shipping_zones WHERE id = ?',
        args: [manualId],
      })
      expect(survivor.rows).toHaveLength(1)
      expect(survivor.rows[0].cost).toBe(42)
      expect(survivor.rows[0].source).toBe('manual')
    })

    it('reuses the catalog method across artworks instead of duplicating it', async () => {
      const artA = await insertArt(sellerId)
      const artB = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: artA,
        zoneGroup: 'canarias',
        selections: [selection('correos:canarias', 14.2)],
      })
      await calculator.applyZoneSelection({
        artId: artB,
        zoneGroup: 'canarias',
        selections: [selection('correos:canarias', 14.2)],
      })

      const methods = await db.execute({
        sql: 'SELECT id, article_type, type FROM shipping_methods WHERE sendcloud_option_code = ?',
        args: ['correos:canarias'],
      })
      expect(methods.rows).toHaveLength(1)
      expect(methods.rows[0].article_type).toBe('art')
      expect(methods.rows[0].type).toBe('delivery')
    })

    it('writes a province reference per province of the group', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'canarias',
        selections: [selection('correos:canarias', 14.2)],
      })

      const refs = await db.execute({
        sql: `SELECT szpc.ref_type, szpc.ref_value
                FROM shipping_zones_postal_codes szpc
                JOIN shipping_zones z ON z.id = szpc.shipping_zone_id
               WHERE z.product_id = ? AND z.zone_group = 'canarias'
               ORDER BY szpc.ref_value`,
        args: [art],
      })

      expect(refs.rows.map(r => r.ref_value)).toEqual(['Las Palmas', 'Santa Cruz de Tenerife'])
      expect(refs.rows.every(r => r.ref_type === 'province')).toBe(true)
    })

    it('deletes the catalog method left without a single zone', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'ceuta_melilla',
        selections: [selection('correos_express:paq24_orphan', 9.1, 'correos_express')],
      })
      expect(await methodRows('correos_express:paq24_orphan')).toHaveLength(1)

      const result = await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'ceuta_melilla',
        selections: [],
      })

      expect(await methodRows('correos_express:paq24_orphan')).toHaveLength(0)
      expect(result.removedMethods).toEqual(['correos_express:paq24_orphan'])
    })

    it('keeps the method while another artwork still uses it', async () => {
      const artA = await insertArt(sellerId)
      const artB = await insertArt(sellerId)
      const code = 'correos:shared_' + Date.now()

      for (const art of [artA, artB]) {
        await calculator.applyZoneSelection({
          artId: art,
          zoneGroup: 'peninsula',
          selections: [selection(code, 6.38)],
        })
      }

      const result = await calculator.applyZoneSelection({
        artId: artA,
        zoneGroup: 'peninsula',
        selections: [],
      })

      // artB still offers it, so the catalog row stays.
      expect(await methodRows(code)).toHaveLength(1)
      expect(result.removedMethods).toEqual([])
    })

    it('keeps the method while the same artwork uses it in another zone', async () => {
      const art = await insertArt(sellerId)
      const code = 'correos:multizone_' + Date.now()

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [selection(code, 6.38)],
      })
      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'baleares',
        selections: [selection(code, 8.48)],
      })

      await calculator.applyZoneSelection({ artId: art, zoneGroup: 'baleares', selections: [] })

      expect(await methodRows(code)).toHaveLength(1)
    })

    it('recreates the method when the option is selected again', async () => {
      const art = await insertArt(sellerId)
      const code = 'correos:recreated_' + Date.now()

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'canarias',
        selections: [selection(code, 14.2)],
      })
      const firstId = Number((await methodRows(code))[0].id)

      await calculator.applyZoneSelection({ artId: art, zoneGroup: 'canarias', selections: [] })
      expect(await methodRows(code)).toHaveLength(0)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'canarias',
        selections: [selection(code, 14.2)],
      })

      const recreated = await methodRows(code)
      expect(recreated).toHaveLength(1)
      expect(Number(recreated[0].id)).not.toBe(firstId)

      // And the zone points at the new row, not at the deleted one.
      const zones = await generatedZones(art, 'canarias')
      expect(zones).toHaveLength(1)
      const zoneMethod = await db.execute({
        sql: `SELECT shipping_method_id FROM shipping_zones
               WHERE product_id = ? AND zone_group = 'canarias' AND source = 'sendcloud_calculator'`,
        args: [art],
      })
      expect(Number(zoneMethod.rows[0].shipping_method_id)).toBe(Number(recreated[0].id))
    })

    it('never deletes a hand-made method that has no zones', async () => {
      const art = await insertArt(sellerId)
      const code = 'correos:coexist_' + Date.now()

      // A method being configured by hand: no Sendcloud code, no zones yet.
      const manualMethod = await db.execute({
        sql: `INSERT INTO shipping_methods (name, type, article_type, is_active)
              VALUES ('Recogida en taller', 'pickup', 'art', 1)`,
      })
      const manualId = Number(manualMethod.lastInsertRowid)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [selection(code, 6.38)],
      })
      await calculator.applyZoneSelection({ artId: art, zoneGroup: 'peninsula', selections: [] })

      const survivor = await db.execute({
        sql: 'SELECT id FROM shipping_methods WHERE id = ?',
        args: [manualId],
      })
      expect(survivor.rows).toHaveLength(1)
    })

    it('rejects an unknown zone group', async () => {
      await expect(
        calculator.applyZoneSelection({ artId, zoneGroup: 'galicia', selections: [] })
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('the generated zones drive the checkout unchanged', () => {
    const runAvailableShipping = async (query) => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }
      const next = jest.fn((err) => { if (err) throw err })
      await shippingController.getAvailableShipping({ query }, res, next)
      return res.json.mock.calls[0][0]
    }

    it('offers each selected option as its own delivery choice', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [
          selection('correos:standard', 6.38),
          selection('ups:standard', 10.4, 'ups'),
        ],
      })

      const body = await runAvailableShipping({
        productId: String(art),
        productType: 'art',
        country: 'ES',
        postalCode: '28001',
      })

      const costs = body.delivery.map(d => d.cost).sort((a, b) => a - b)
      expect(costs).toEqual([12.72, 17.58]) // 6,38 and 10,40 taxed, plus 5 € packaging
    })

    it('prefers the artwork zone over a generic one for the same method', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [selection('correos:standard', 6.38)],
      })

      // A catalog-wide zone for the very same method, deliberately cheaper: if
      // priority did not apply, the generic price would win on cost.
      const methodRow = await db.execute({
        sql: 'SELECT id FROM shipping_methods WHERE sendcloud_option_code = ?',
        args: ['correos:standard'],
      })
      await db.execute({
        sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost)
              VALUES (?, ?, 'ES', 1)`,
        args: [Number(methodRow.rows[0].id), sellerId],
      })

      const body = await runAvailableShipping({
        productId: String(art),
        productType: 'art',
        country: 'ES',
        postalCode: '28001',
      })

      expect(body.delivery.map(d => d.cost)).toEqual([12.72])
    })

    it('does not offer a peninsula zone to a Balearic address', async () => {
      const art = await insertArt(sellerId)

      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'peninsula',
        selections: [selection('correos:standard', 6.38)],
      })
      await calculator.applyZoneSelection({
        artId: art,
        zoneGroup: 'baleares',
        selections: [selection('correos:standard', 8.48)],
      })

      const balearic = await runAvailableShipping({
        productId: String(art),
        productType: 'art',
        country: 'ES',
        postalCode: '07001',
      })

      // Same option code, so a single method: the Balearic zone is the one that
      // matches the address, and it carries its own higher rate.
      expect(balearic.delivery.map(d => d.cost)).toEqual([15.26])
    })
  })
})
