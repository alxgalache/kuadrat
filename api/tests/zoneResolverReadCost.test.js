/**
 * What one shipping quote costs the database (openspec change:
 * fix-zone-resolver-row-reads).
 *
 * Between 6 and 10 October 2026 production read ~2.9 billion rows, more than
 * the plan's whole month, and Turso attributed all of it to one statement: the
 * resolver's delivery-zone query, at ~654,000 rows per call. Two shapes made it
 * that expensive, and they multiply:
 *
 *   - it read every zone of the seller, every artwork's, and threw away all but
 *     the quoted product's in JavaScript;
 *   - for each zone it asked "is this postal code in one of your provinces?"
 *     through a subquery that SQLite planned on the province index, walking
 *     every postal code of each province instead of looking up one.
 *
 * Neither changed a single price, so nothing failed. The product feeds then
 * quoted the whole catalogue in four zone groups every hour, and the cost grew
 * with the square of the catalogue.
 *
 * The local test database exposes no rows-read counter, so the guards at the
 * end pin the two shapes instead: no statement may search postal codes by
 * province, and a quote may only read its own product's zones. Everything
 * before them pins what must NOT change: which destinations each kind of postal
 * ref serves, for the quote and for a draw's deliverability check.
 */

const crypto = require('crypto')
const { db } = require('../config/database')
const { resolveShippingOptions } = require('../services/shipping/zoneResolver')
const { validatePostalCodeForDraw } = require('../services/drawService')

// --- fixtures -------------------------------------------------------------

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`zonereads-${Date.now()}-${Math.random()}@example.com`],
  })
  return Number(result.lastInsertRowid)
}

async function insertArt(sellerId, name = 'Obra de prueba') {
  const result = await db.execute({
    sql: `INSERT INTO art (seller_id, name, description, price, slug, status, visible)
          VALUES (?, ?, 'desc', 300, ?, 'approved', 1)`,
    args: [sellerId, name, `slug-${Date.now()}-${Math.random()}`],
  })
  return Number(result.lastInsertRowid)
}

async function insertMethod(name, type = 'delivery') {
  const result = await db.execute({
    sql: `INSERT INTO shipping_methods (name, description, type, article_type, max_articles, is_active, estimated_delivery_days)
          VALUES (?, 'desc', ?, 'art', 1, 1, 2)`,
    args: [name, type],
  })
  return Number(result.lastInsertRowid)
}

// Every zone this file creates, so its refs can be removed when it ends.
const createdZoneIds = []

/**
 * A `postal_code` ref is a foreign key into `postal_codes`, and
 * spainShippingZones.test.js empties and refills that table in the same
 * database: a ref left behind makes its DELETE fail, depending on file order.
 *
 * Each describe calls this from its own `afterAll`. A root-level hook would run
 * after the one in `tests/setup/afterEnv.js` that closes the libsql client.
 */
async function removeCreatedRefs() {
  const ids = createdZoneIds.splice(0)
  if (ids.length === 0) return
  await db.execute({
    sql: `DELETE FROM shipping_zones_postal_codes
          WHERE shipping_zone_id IN (${ids.map(() => '?').join(', ')})`,
    args: ids,
  })
}

/**
 * A zone with the given postal refs, written the way the admin screens and the
 * calculator write them: `postal_code` refs point at a `postal_codes` row,
 * `province` and `country` refs carry their value. No refs = country-wide.
 */
async function insertZone({ methodId, sellerId, artId = null, cost, refs = [] }) {
  const zone = await db.execute({
    sql: `INSERT INTO shipping_zones (shipping_method_id, seller_id, country, cost, product_id, product_type)
          VALUES (?, ?, 'ES', ?, ?, ?)`,
    args: [methodId, sellerId, cost, artId, artId === null ? null : 'art'],
  })
  const zoneId = Number(zone.lastInsertRowid)
  createdZoneIds.push(zoneId)

  for (const ref of refs) {
    let postalCodeId = null
    if (ref.type === 'postal_code') {
      const row = await db.execute({
        sql: `SELECT id FROM postal_codes WHERE postal_code = ? AND country = 'ES'`,
        args: [ref.value],
      })
      postalCodeId = Number(row.rows[0].id)
    }
    await db.execute({
      sql: `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
            VALUES (?, ?, ?, ?)`,
      args: [zoneId, ref.type, postalCodeId, ref.type === 'postal_code' ? null : ref.value],
    })
  }

  return zoneId
}

async function insertDraw(artId) {
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO draws (id, name, product_id, product_type, price, max_participations, start_datetime, end_datetime)
          VALUES (?, 'Sorteo de prueba', ?, 'art', 10, 100, '2026-10-01 10:00:00', '2026-12-01 10:00:00')`,
    args: [id, artId],
  })
  return id
}

async function deliveryMethodIds(artId, postalCode) {
  const { delivery } = await resolveShippingOptions({
    productId: artId, productType: 'art', country: 'ES', postalCode,
  })
  return delivery.map((option) => option.methodId).sort((a, b) => a - b)
}

// '99999' is a well-formed postal code absent from `postal_codes`.
const UNKNOWN = '99999'

// --- which destinations a zone serves ---------------------------------------

describe('which destinations each kind of postal ref serves', () => {
  afterAll(removeCreatedRefs)

  let art
  const method = {}

  beforeAll(async () => {
    const sellerId = await insertSeller()
    art = await insertArt(sellerId)

    method.province = await insertMethod('Por provincia')
    method.postalCode = await insertMethod('Por código postal')
    method.country = await insertMethod('Por país')
    method.countryWide = await insertMethod('Sin referencias')

    await insertZone({ methodId: method.province, sellerId, artId: art, cost: 10, refs: [{ type: 'province', value: 'Madrid' }] })
    await insertZone({ methodId: method.postalCode, sellerId, artId: art, cost: 11, refs: [{ type: 'postal_code', value: '28001' }] })
    await insertZone({ methodId: method.country, sellerId, artId: art, cost: 12, refs: [{ type: 'country', value: 'ES' }] })
    await insertZone({ methodId: method.countryWide, sellerId, artId: art, cost: 13 })
  })

  it.each([
    ['28001', ['province', 'postalCode', 'country', 'countryWide']],
    ['08001', ['country', 'countryWide']],
    ['35001', ['country', 'countryWide']],
    [UNKNOWN, ['countryWide']],
  ])('a quote to %s gets %j', async (postalCode, expected) => {
    const ids = expected.map((key) => method[key]).sort((a, b) => a - b)
    await expect(deliveryMethodIds(art, postalCode)).resolves.toEqual(ids)
  })
})

describe("another artwork's zones never price this one", () => {
  afterAll(removeCreatedRefs)

  it('keeps specific over generic, and ignores the other artwork', async () => {
    const sellerId = await insertSeller()
    const artA = await insertArt(sellerId, 'Obra A')
    const artB = await insertArt(sellerId, 'Obra B')
    const artC = await insertArt(sellerId, 'Obra C')
    const shared = await insertMethod('Compartido')
    const pickup = await insertMethod('Recogida de B', 'pickup')
    const madrid = [{ type: 'province', value: 'Madrid' }]

    await insertZone({ methodId: shared, sellerId, cost: 9, refs: madrid })
    await insertZone({ methodId: shared, sellerId, artId: artA, cost: 12, refs: madrid })
    await insertZone({ methodId: shared, sellerId, artId: artB, cost: 5, refs: madrid })
    await insertZone({ methodId: pickup, sellerId, artId: artB, cost: 0 })

    const quote = (productId) =>
      resolveShippingOptions({ productId, productType: 'art', country: 'ES', postalCode: '28001' })

    const a = await quote(artA)
    expect(a.delivery).toEqual([expect.objectContaining({ methodId: shared, cost: 12 })])
    expect(a.pickup).toEqual([])

    const b = await quote(artB)
    expect(b.delivery).toEqual([expect.objectContaining({ methodId: shared, cost: 5 })])
    expect(b.pickup).toEqual([expect.objectContaining({ methodId: pickup })])

    const c = await quote(artC)
    expect(c.delivery).toEqual([expect.objectContaining({ methodId: shared, cost: 9 })])
  })
})

describe("a draw's deliverability check", () => {
  afterAll(removeCreatedRefs)

  async function drawFor(refs) {
    const sellerId = await insertSeller()
    const art = await insertArt(sellerId)
    if (refs) await insertZone({ methodId: await insertMethod('Envío'), sellerId, artId: art, cost: 10, refs })
    return insertDraw(art)
  }

  const valid = async (drawId, postalCode) =>
    (await validatePostalCodeForDraw(drawId, postalCode, 'ES')).valid

  it('serves the province of a province ref and nothing else', async () => {
    const draw = await drawFor([{ type: 'province', value: 'Madrid' }])
    await expect(valid(draw, '28001')).resolves.toBe(true)
    await expect(valid(draw, '35001')).resolves.toBe(false)
    await expect(valid(draw, UNKNOWN)).resolves.toBe(false)
  })

  it('serves exactly the postal code of a postal code ref', async () => {
    const draw = await drawFor([{ type: 'postal_code', value: '28001' }])
    await expect(valid(draw, '28001')).resolves.toBe(true)
    await expect(valid(draw, '08001')).resolves.toBe(false)
  })

  it('serves any known postal code of a country ref', async () => {
    const draw = await drawFor([{ type: 'country', value: 'ES' }])
    await expect(valid(draw, '08001')).resolves.toBe(true)
    await expect(valid(draw, UNKNOWN)).resolves.toBe(false)
  })

  it('serves every postal code of a country-wide zone', async () => {
    const draw = await drawFor([])
    await expect(valid(draw, UNKNOWN)).resolves.toBe(true)
  })

  it('puts no restriction on a seller without delivery zones', async () => {
    const draw = await drawFor(null)
    await expect(valid(draw, UNKNOWN)).resolves.toBe(true)
  })
})

// --- what a quote reads -------------------------------------------------------

/**
 * Runs `fn` and returns every statement it sent to the database, with the rows
 * each one returned.
 */
async function captureStatements(fn) {
  const original = db.execute.bind(db)
  const statements = []
  const spy = jest.spyOn(db, 'execute').mockImplementation(async (stmt) => {
    const result = await original(stmt)
    statements.push({
      sql: typeof stmt === 'string' ? stmt : stmt.sql,
      args: typeof stmt === 'string' ? [] : stmt.args || [],
      rows: result.rows,
    })
    return result
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return statements
}

async function queryPlan({ sql, args }) {
  const result = await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args })
  return result.rows.map((row) => row.detail)
}

// The statements, among those given, whose plan walks postal codes by province:
// the plan that cost ~654,000 rows per quote. A failure prints them.
async function provinceIndexSearches(statements) {
  const offending = []
  for (const statement of statements) {
    const plan = await queryPlan(statement)
    if (plan.some((step) => step.includes('idx_postal_codes_province_country'))) {
      offending.push({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan })
    }
  }
  return offending
}

const isZoneQuery = ({ sql }) => /\bshipping_zones\s+sz\b/.test(sql)

// The provinces of the four zone groups that the test seed carries.
const GROUPS = {
  peninsula: ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Vizcaya', 'A Coruña'],
  baleares: ['Baleares'],
  canarias: ['Las Palmas', 'Santa Cruz de Tenerife'],
  ceuta_melilla: ['Ceuta', 'Melilla'],
}

describe('what a quote reads', () => {
  afterAll(removeCreatedRefs)

  let sellerId
  const arts = []

  // The production shape: several artworks of one seller, each with a
  // calculator zone per group and option, plus a generic zone and another
  // artwork's pickup.
  beforeAll(async () => {
    sellerId = await insertSeller()
    const options = [await insertMethod('Opción 1'), await insertMethod('Opción 2')]
    for (let i = 0; i < 3; i++) {
      const art = await insertArt(sellerId, `Obra ${i}`)
      arts.push(art)
      for (const provinces of Object.values(GROUPS)) {
        for (const methodId of options) {
          await insertZone({
            methodId, sellerId, artId: art, cost: 10 + i,
            refs: provinces.map((value) => ({ type: 'province', value })),
          })
        }
      }
    }
    await insertZone({ methodId: options[0], sellerId, cost: 99 })
    await insertZone({ methodId: await insertMethod('Recogida', 'pickup'), sellerId, artId: arts[2], cost: 0 })
  })

  const quote = (postalCode) => () =>
    resolveShippingOptions({ productId: arts[0], productType: 'art', country: 'ES', postalCode })

  it.each(['28001', '35001', UNKNOWN])(
    'never searches postal codes by province (quote to %s)',
    async (postalCode) => {
      const statements = await captureStatements(quote(postalCode))
      expect(statements.some(isZoneQuery)).toBe(true)
      await expect(provinceIndexSearches(statements)).resolves.toEqual([])
    }
  )

  it('matches zones against values, never against the postal_codes table', async () => {
    const statements = await captureStatements(quote('28001'))
    const zoneQueries = statements.filter(isZoneQuery)

    expect(zoneQueries.length).toBeGreaterThan(0)
    for (const { sql } of zoneQueries) {
      expect(sql).not.toMatch(/\b(FROM|JOIN)\s+postal_codes\b/i)
    }
  })

  it("reads only the quoted artwork's zones and the generic ones", async () => {
    const statements = await captureStatements(quote('28001'))
    const zoneRows = statements.filter(isZoneQuery).flatMap((statement) => statement.rows)

    expect(zoneRows.length).toBeGreaterThan(0)
    for (const row of zoneRows) {
      expect([null, arts[0]]).toContain(row.zone_product_id === null ? null : Number(row.zone_product_id))
    }
  })

  it("keeps a draw's deliverability check off the province index too", async () => {
    const draw = await insertDraw(arts[1])
    const statements = await captureStatements(() => validatePostalCodeForDraw(draw, '35001', 'ES'))
    expect(statements.some(isZoneQuery)).toBe(true)
    await expect(provinceIndexSearches(statements)).resolves.toEqual([])
  })
})
