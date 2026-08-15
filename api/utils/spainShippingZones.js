const { db } = require('../config/database')

/**
 * The four shipping territories of Spain, as the art shipping calculator quotes
 * them.
 *
 * Four and not three: live quotes show that the peninsula and the Balearics do
 * NOT share a rate (correos:standard is 6,38 € to Madrid and 8,48 € to Palma on
 * the same parcel) and each has options the other does not
 * (correos_express:baleares_express only towards Palma, paq24/epaq24 only
 * towards the peninsula). Merging them would force one `cost` onto two real
 * rates, which either loses money on every island sale or overcharges the
 * mainland buyer.
 *
 * Ceuta and Melilla price identically in every test, so one representative
 * postal code covers the pair. If they ever diverge, splitting that group is
 * the same operation performed here for the Balearics.
 */

const ZONE_GROUPS = ['peninsula', 'baleares', 'canarias', 'ceuta_melilla']

// One destination per group is enough: within a group the rate is the same, and
// asking the admin for a postal code would mean four repetitions per artwork
// plus a whole class of typo that silently writes the wrong provinces.
const ZONE_GROUP_POSTAL_CODES = {
  peninsula: '28001',
  baleares: '07001',
  canarias: '35001',
  ceuta_melilla: '51001',
}

// Provinces of the three non-peninsular groups, spelled exactly as
// api/migrations/ES.csv spells them (the source of the postal_codes table).
// `peninsula` is deliberately absent: it is resolved by EXCLUSION against the
// postal_codes table, never as a literal list of 47 accented strings — such a
// list drifts out of sync silently, and the symptom (an artwork that stops
// offering shipping to one province) looks nothing like its cause.
const EXPLICIT_GROUP_PROVINCES = {
  baleares: ['Baleares'],
  canarias: ['Las Palmas', 'Santa Cruz de Tenerife'],
  ceuta_melilla: ['Ceuta', 'Melilla'],
}

// Every province that belongs to one of the explicit groups — i.e. everything
// `peninsula` is defined as NOT being.
const NON_PENINSULAR_PROVINCES = Object.values(EXPLICIT_GROUP_PROVINCES).flat()

function isZoneGroup(group) {
  return ZONE_GROUPS.includes(group)
}

function getPostalCodeForGroup(group) {
  return ZONE_GROUP_POSTAL_CODES[group]
}

/**
 * The provinces that make up a zone group, resolved against `postal_codes`.
 *
 * @param {string} group - One of ZONE_GROUPS.
 * @returns {Promise<string[]>} Province names, sorted.
 */
async function getProvincesForGroup(group) {
  if (!isZoneGroup(group)) {
    throw new Error(`Unknown shipping zone group: ${group}`)
  }

  if (group === 'peninsula') {
    const placeholders = NON_PENINSULAR_PROVINCES.map(() => '?').join(', ')
    const result = await db.execute({
      sql: `SELECT DISTINCT province FROM postal_codes
             WHERE country = 'ES'
               AND province IS NOT NULL
               AND province != ''
               AND province NOT IN (${placeholders})
             ORDER BY province`,
      args: NON_PENINSULAR_PROVINCES,
    })
    return result.rows.map(row => row.province)
  }

  const wanted = EXPLICIT_GROUP_PROVINCES[group]
  const placeholders = wanted.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `SELECT DISTINCT province FROM postal_codes
           WHERE country = 'ES' AND province IN (${placeholders})
           ORDER BY province`,
    args: wanted,
  })
  return result.rows.map(row => row.province)
}

module.exports = {
  ZONE_GROUPS,
  ZONE_GROUP_POSTAL_CODES,
  EXPLICIT_GROUP_PROVINCES,
  NON_PENINSULAR_PROVINCES,
  isZoneGroup,
  getPostalCodeForGroup,
  getProvincesForGroup,
}
