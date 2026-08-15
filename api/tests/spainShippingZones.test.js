/**
 * The four zone groups must partition the Spanish provinces exactly
 * (openspec change: sendcloud-art-shipping-calculator).
 *
 * `peninsula` is resolved by exclusion against `postal_codes` rather than from
 * a literal list of 47 accented strings, precisely so it cannot drift out of
 * sync with ES.csv. This test is what makes that claim checkable: it loads the
 * real province list from the CSV and asserts the partition — 47 + 1 + 2 + 2 =
 * 52, no province missing from all groups, none in two.
 *
 * The test database is seeded with a handful of postal codes, not the full CSV,
 * so it swaps the table for the CSV provinces and puts the seed rows back
 * afterwards. Jest runs with `maxWorkers: 1` against a single SQLite file, so
 * nothing else is reading the table meanwhile.
 */

const fs = require('fs')
const path = require('path')

const { db } = require('../config/database')
const {
  ZONE_GROUPS,
  ZONE_GROUP_POSTAL_CODES,
  getProvincesForGroup,
} = require('../utils/spainShippingZones')

// One representative row per province of api/migrations/ES.csv.
function provincesFromCsv() {
  const csv = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'ES.csv'), 'utf-8')
  const rows = new Map()

  for (const line of csv.split('\n').slice(1)) {
    if (!line.trim()) continue
    const [, postalCode, city, province, country] = line.split('\t')
    if (!province || rows.has(province)) continue
    rows.set(province, { postalCode, city, province, country: (country || 'ES').trim() })
  }

  return [...rows.values()]
}

let savedRows = []

// Both hooks live INSIDE the describe on purpose: `tests/setup/afterEnv.js`
// registers a root-level `afterAll` that closes the libsql client, and a
// root-level cleanup here would run after it and find the client already gone.
describe('Spanish shipping zone groups', () => {
  beforeAll(async () => {
    const existing = await db.execute('SELECT postal_code, city, province, country FROM postal_codes')
    savedRows = existing.rows.map(r => ({ ...r }))

    await db.execute('DELETE FROM postal_codes')
    await db.batch(
      provincesFromCsv().map(row => ({
        sql: 'INSERT INTO postal_codes (postal_code, city, province, country) VALUES (?, ?, ?, ?)',
        args: [row.postalCode, row.city, row.province, row.country],
      })),
      'write'
    )
  })

  afterAll(async () => {
    await db.execute('DELETE FROM postal_codes')
    if (savedRows.length > 0) {
      await db.batch(
        savedRows.map(row => ({
          sql: 'INSERT INTO postal_codes (postal_code, city, province, country) VALUES (?, ?, ?, ?)',
          args: [row.postal_code, row.city, row.province, row.country],
        })),
        'write'
      )
    }
  })

  it('has one representative postal code per group', () => {
    expect(Object.keys(ZONE_GROUP_POSTAL_CODES).sort()).toEqual([...ZONE_GROUPS].sort())
    expect(ZONE_GROUP_POSTAL_CODES).toEqual({
      peninsula: '28001',
      baleares: '07001',
      canarias: '35001',
      ceuta_melilla: '51001',
    })
  })

  it('assigns the island and North African provinces to their own groups', async () => {
    expect(await getProvincesForGroup('baleares')).toEqual(['Baleares'])
    expect(await getProvincesForGroup('canarias')).toEqual(['Las Palmas', 'Santa Cruz de Tenerife'])
    expect(await getProvincesForGroup('ceuta_melilla')).toEqual(['Ceuta', 'Melilla'])
  })

  it('resolves the peninsula by exclusion, as the remaining 47 provinces', async () => {
    const peninsula = await getProvincesForGroup('peninsula')

    expect(peninsula).toHaveLength(47)
    for (const island of ['Baleares', 'Las Palmas', 'Santa Cruz de Tenerife', 'Ceuta', 'Melilla']) {
      expect(peninsula).not.toContain(island)
    }
    // Not a literal list in code: a province the CSV happens to spell its own
    // way still lands in the peninsula.
    expect(peninsula).toContain('Vizcaya')
    expect(peninsula).toContain('A Coruña')
  })

  it('partitions every province of ES.csv exactly once', async () => {
    const all = provincesFromCsv().map(r => r.province)
    expect(all).toHaveLength(52)

    const assigned = []
    for (const group of ZONE_GROUPS) {
      assigned.push(...(await getProvincesForGroup(group)))
    }

    // No gaps.
    expect([...assigned].sort()).toEqual([...all].sort())
    // No overlaps.
    expect(new Set(assigned).size).toBe(assigned.length)
    expect(assigned).toHaveLength(52)
  })

  it('rejects an unknown group rather than returning an empty list', async () => {
    await expect(getProvincesForGroup('galicia')).rejects.toThrow(/Unknown shipping zone group/)
  })
})
