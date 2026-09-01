const sendcloud = require('./sendcloudApiClient')
const { insuredValueFor, quoteTotal, hasUsableRate } = require('./sendcloudPricing')
const { db } = require('../../config/database')
const logger = require('../../config/logger')
const { ApiError } = require('../../middleware/errorHandler')
const { createBatch } = require('../../utils/transaction')
const {
  ZONE_GROUPS,
  getPostalCodeForGroup,
  getProvincesForGroup,
  isZoneGroup,
} = require('../../utils/spainShippingZones')

/**
 * Art shipping calculator: turns a real Sendcloud quote into the
 * `shipping_methods` + `shipping_zones` rows the checkout already knows how to
 * read.
 *
 * It replaces the admin's keyboard, not the checkout's pricing engine: nothing
 * here runs at purchase time. `SENDCLOUD_ENABLED_ART=false` keeps art checkout
 * on the legacy zone lookup; this module only changes where the number in
 * `shipping_zones.cost` comes from.
 */

// VAT on the transport service, always the general rate.
//
// Deliberately a local constant and NOT `TAX_VAT_ES`, nor the seller's
// `tax_vat_art` / `tax_vat_other`: those describe the fiscal regime of the
// ARTICLE (REBU at 10 %, cooperative at 21 %), an axis independent of the VAT
// on shipping. Wiring them together would make an artist's fiscal regime
// silently change the price of a courier.
const SHIPPING_VAT_MULTIPLIER = 1.21

function round2(value) {
  return Math.round(value * 100) / 100
}

/**
 * The price the buyer pays for an option.
 *
 * VAT applies to the transport, packaging is added afterwards — hence the
 * rounding BEFORE the sum. With Sendcloud at 8,48 € and 5,00 € of packaging:
 * 8,48 × 1,21 = 10,26 → 15,26 €.
 *
 * @param {number} sendcloudTotal - Pre-VAT total quoted by Sendcloud.
 * @param {number} packagingCost - Packaging cost in euros.
 * @returns {number}
 */
function computeFinalPrice(sendcloudTotal, packagingCost) {
  const taxed = round2(Number(sendcloudTotal) * SHIPPING_VAT_MULTIPLIER)
  return round2(taxed + (Number(packagingCost) || 0))
}

/**
 * Load an artwork with everything the quote needs, or throw.
 */
async function loadArtwork(artId) {
  const result = await db.execute({
    sql: `SELECT a.id, a.name, a.price, a.seller_id,
                 a.outside_dimensions, a.outside_weight, a.packaging_cost,
                 u.full_name AS seller_name
            FROM art a
            JOIN users u ON u.id = a.seller_id
           WHERE a.id = ?`,
    args: [artId],
  })

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada')
  }

  return result.rows[0]
}

/**
 * Load the artist's Sendcloud configuration — used ONLY for the sender address.
 * Insurance, carrier preferences and functionalities are deliberately not read:
 * the calculator quotes the artwork insured for its own price, always.
 */
async function loadSenderAddress(sellerId) {
  const result = await db.execute({
    sql: `SELECT sender_country, sender_postal_code, sender_city, sender_address_1
            FROM user_sendcloud_configuration WHERE user_id = ?`,
    args: [sellerId],
  })

  if (result.rows.length === 0) {
    throw new ApiError(
      400,
      'El artista no tiene configuración de envío de Sendcloud. Complétala antes de calcular el envío.',
      'Configuración de envío faltante'
    )
  }

  const row = result.rows[0]
  if (!row.sender_postal_code) {
    throw new ApiError(
      400,
      'La configuración de envío del artista no tiene código postal de origen.',
      'Configuración de envío incompleta'
    )
  }

  const address = {
    country_code: row.sender_country || 'ES',
    postal_code: row.sender_postal_code,
  }
  if (row.sender_city) address.city = row.sender_city
  if (row.sender_address_1) address.address_line_1 = row.sender_address_1

  return address
}

/**
 * Build the parcel of a quote request from the artwork's PACKAGE columns.
 *
 * Throws when either is missing. There is no fallback to the artwork's own
 * `dimensions` / `weight`: the carrier bills the volumetric weight of the box,
 * so a plausible substitute produces a plausible but wrong price, and that
 * price is then frozen into `shipping_zones.cost` with nothing to show it was
 * guessed. An empty input is visible; a silent substitution is not.
 */
function buildParcel(art) {
  const missing = []
  if (!art.outside_dimensions) missing.push('las dimensiones externas')
  if (!art.outside_weight) missing.push('el peso externo')

  if (missing.length > 0) {
    throw new ApiError(
      400,
      `Faltan ${missing.join(' y ')} del embalaje. Son obligatorios para calcular el envío.`,
      'Datos de embalaje incompletos'
    )
  }

  const dims = String(art.outside_dimensions).split('x').map(Number)
  if (dims.length !== 3 || !dims.every(d => Number.isFinite(d) && d > 0)) {
    throw new ApiError(
      400,
      'Las dimensiones externas deben tener el formato LxAxH en centímetros, por ejemplo 70x70x8.',
      'Dimensiones inválidas'
    )
  }

  return {
    weight: {
      value: String(Number(art.outside_weight) / 1000), // grams to kg
      unit: 'kg',
    },
    dimensions: {
      length: String(dims[0]),
      width: String(dims[1]),
      height: String(dims[2]),
      unit: 'cm',
    },
    // The artwork always travels insured for its own price. The artist's
    // `insurance_type` is NOT consulted: no form writes it, so every row keeps
    // the 'none' default and branching on it would be branching on a constant.
    // A plain integer — this endpoint rejects an object or a decimal with 400.
    additional_insured_price: insuredValueFor(art.price),
  }
}

/**
 * Normalize one Sendcloud breakdown item into `{ type, label, amount }`.
 */
function normalizeBreakdownItem(item) {
  const rawAmount = item?.price?.value ?? item?.value
  const amount = parseFloat(rawAmount)

  return {
    type: item?.type || item?.label || 'other',
    label: item?.label || item?.type || '',
    amount: Number.isFinite(amount) ? amount : 0,
  }
}

/**
 * Split the raw options of one group into what the admin may select and what is
 * only shown for information.
 *
 * Three outcomes, not two:
 *   - eligible: a numeric total > 0.
 *   - no_rate:  `quotes: []`. A real, announceable option that Sendcloud does
 *               not price because it runs on the seller's own carrier contract
 *               (`quote_error` comes back null, so there is no message to show).
 *               Displayed greyed out rather than hidden — its silent absence is
 *               exactly what was expensive to diagnose.
 *   - dropped:  a total that parses to zero or less. This is how
 *               `sendcloud:letter` disappears; offering "free shipping" in a
 *               mailbox letter for a framed piece is not an option at all.
 */
function classifyOptions(rawOptions, packagingCost) {
  const eligible = []
  const noRate = []

  for (const opt of rawOptions || []) {
    const code = opt?.code || opt?.id
    if (!code) continue

    const base = {
      optionCode: code,
      name: opt.name || opt.carrier?.name || code,
      carrierCode: opt.carrier?.code || '',
      carrierName: opt.carrier?.name || '',
      requiresServicePoint: opt.requirements?.is_service_point_required || false,
    }

    const quotes = opt.quotes
    if (!Array.isArray(quotes) || quotes.length === 0) {
      noRate.push({ ...base, status: 'no_rate' })
      continue
    }

    if (!hasUsableRate(opt)) continue

    // `quoteTotal` sums one quote per parcel, and this module always sends
    // exactly one (`parcels: [parcel]` below), so the sum is that parcel's
    // total and the neighbouring `quotes[0]` reads — lead time, currency,
    // breakdown — describe the same single parcel. Sending more than one parcel
    // from here would silently make the breakdown describe only the first.
    const total = quoteTotal(opt)
    const leadTimeHours = quotes[0]?.lead_time

    eligible.push({
      ...base,
      status: 'eligible',
      currency: quotes[0]?.price?.total?.currency || 'EUR',
      baseCost: total,
      breakdown: (quotes[0]?.price?.breakdown || []).map(normalizeBreakdownItem),
      vatAmount: round2(round2(total * SHIPPING_VAT_MULTIPLIER) - total),
      packagingCost: Number(packagingCost) || 0,
      finalPrice: computeFinalPrice(total, packagingCost),
      estimatedDays: leadTimeHours ? Math.ceil(leadTimeHours / 24) : null,
    })
  }

  eligible.sort((a, b) => a.finalPrice - b.finalPrice)

  return { eligible, noRate }
}

/**
 * Quote one zone group against its representative postal code.
 */
async function quoteGroup({ group, fromAddress, parcel, packagingCost }) {
  const response = await sendcloud.post('shipping-options', {
    body: {
      from_address: fromAddress,
      to_address: {
        country_code: 'ES',
        postal_code: getPostalCodeForGroup(group),
      },
      parcels: [parcel],
      calculate_quotes: true,
    },
  })

  const data = response?.data || response || []
  return classifyOptions(Array.isArray(data) ? data : [], packagingCost)
}

/**
 * The zones already generated for an artwork, so the screen can pre-check what
 * is currently saved instead of presenting an empty selection over live data.
 */
async function getGeneratedZones(artId) {
  const result = await db.execute({
    sql: `SELECT zone_group, sendcloud_option_code, cost, base_cost,
                 packaging_cost_snapshot, calculated_at
            FROM shipping_zones
           WHERE product_id = ? AND product_type = 'art'
             AND source = 'sendcloud_calculator'
           ORDER BY zone_group, cost`,
    args: [artId],
  })

  const byGroup = {}
  for (const group of ZONE_GROUPS) byGroup[group] = []

  for (const row of result.rows) {
    if (!byGroup[row.zone_group]) byGroup[row.zone_group] = []
    byGroup[row.zone_group].push({
      optionCode: row.sendcloud_option_code,
      cost: row.cost,
      baseCost: row.base_cost,
      packagingCost: row.packaging_cost_snapshot,
      calculatedAt: row.calculated_at,
    })
  }

  return byGroup
}

/**
 * Quote an artwork against the four Spanish zone groups.
 *
 * The four calls go out together: one failing group must not cost the other
 * three their results, so each group carries either its options or its own
 * error message.
 *
 * @param {object} params
 * @param {number} params.artId
 * @returns {Promise<object>} `{ artwork, groups: { <group>: { options, noRateOptions, error } } }`
 */
async function quoteArtwork({ artId }) {
  const art = await loadArtwork(artId)
  const fromAddress = await loadSenderAddress(art.seller_id)
  const parcel = buildParcel(art)
  const packagingCost = Number(art.packaging_cost) || 0

  const settled = await Promise.allSettled(
    ZONE_GROUPS.map(group => quoteGroup({ group, fromAddress, parcel, packagingCost }))
  )

  const groups = {}
  ZONE_GROUPS.forEach((group, index) => {
    const outcome = settled[index]

    if (outcome.status === 'fulfilled') {
      groups[group] = {
        postalCode: getPostalCodeForGroup(group),
        options: outcome.value.eligible,
        noRateOptions: outcome.value.noRate,
        error: null,
      }
      return
    }

    logger.error(
      { artId, group, err: outcome.reason },
      'Sendcloud quote failed for one art shipping zone group'
    )

    groups[group] = {
      postalCode: getPostalCodeForGroup(group),
      options: [],
      noRateOptions: [],
      error: outcome.reason?.message || 'No se pudo obtener la tarifa para esta zona',
    }
  })

  return {
    artwork: {
      id: art.id,
      name: art.name,
      price: art.price,
      sellerId: art.seller_id,
      sellerName: art.seller_name,
      outsideDimensions: art.outside_dimensions,
      outsideWeight: art.outside_weight,
      packagingCost,
      insuredValue: insuredValueFor(art.price),
    },
    groups,
    saved: await getGeneratedZones(artId),
  }
}

/**
 * Find, or create, the catalog `shipping_methods` row for a Sendcloud option
 * code. One row per code, shared by every artwork — the table describes
 * shipping MODALITIES, not products.
 */
async function ensureShippingMethod(selection) {
  const existing = await db.execute({
    sql: 'SELECT id FROM shipping_methods WHERE sendcloud_option_code = ?',
    args: [selection.optionCode],
  })

  if (existing.rows.length > 0) {
    return Number(existing.rows[0].id)
  }

  try {
    const inserted = await db.execute({
      sql: `INSERT INTO shipping_methods (
              name, description, type, article_type, max_articles, is_active,
              estimated_delivery_days, sendcloud_option_code, sendcloud_carrier_code,
              created_at, updated_at
            ) VALUES (?, ?, 'delivery', 'art', 1, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [
        selection.name || selection.optionCode,
        `Generado por la calculadora de envíos (${selection.optionCode})`,
        selection.estimatedDays ?? null,
        selection.optionCode,
        selection.carrierCode || null,
      ],
    })

    return Number(inserted.lastInsertRowid)
  } catch (error) {
    // The unique partial index on sendcloud_option_code turns a race between
    // two saves of the same option into a constraint violation. Losing that
    // race is not a failure: the row the other writer created is the row this
    // one wanted.
    const raced = await db.execute({
      sql: 'SELECT id FROM shipping_methods WHERE sendcloud_option_code = ?',
      args: [selection.optionCode],
    })
    if (raced.rows.length > 0) return Number(raced.rows[0].id)
    throw error
  }
}

/**
 * Delete the catalog methods that this save has just left without a single
 * zone, anywhere.
 *
 * A `shipping_methods` row with no `shipping_zones` pointing at it offers
 * nothing to anybody: it cannot be matched at checkout, and it only clutters
 * the admin shipping screens with modalities that do not apply to any artwork.
 * Deselecting the last option of the last artwork that used it should therefore
 * take the method with it; ticking it again recreates it (`ensureShippingMethod`
 * is find-or-create), so nothing is lost.
 *
 * Two deliberate bounds:
 *   - Only rows with a `sendcloud_option_code`, i.e. the ones the calculator
 *     created. A hand-made method with no zones yet is a method in the middle
 *     of being configured, not rubbish.
 *   - Only the codes THIS save could have orphaned, rather than every orphan in
 *     the table. A global sweep would race with a concurrent save that has just
 *     created its method and not yet inserted its zones.
 *
 * Order history is unaffected: `art_order_items` / `other_order_items` snapshot
 * `shipping_method_name` and `shipping_method_type` at sale time and their
 * `shipping_method_id` carries no foreign key, exactly as with the admin's
 * existing "delete shipping method" button.
 *
 * @param {string[]} candidateCodes - Option codes that lost a zone in this save.
 * @returns {Promise<string[]>} The option codes whose method was deleted.
 */
async function deleteOrphanedMethods(candidateCodes) {
  if (candidateCodes.length === 0) return []

  const placeholders = candidateCodes.map(() => '?').join(', ')
  const orphaned = await db.execute({
    sql: `SELECT id, sendcloud_option_code
            FROM shipping_methods m
           WHERE m.sendcloud_option_code IN (${placeholders})
             AND NOT EXISTS (
               SELECT 1 FROM shipping_zones z WHERE z.shipping_method_id = m.id
             )`,
    args: candidateCodes,
  })

  if (orphaned.rows.length === 0) return []

  const ids = orphaned.rows.map(row => Number(row.id))
  await db.execute({
    sql: `DELETE FROM shipping_methods WHERE id IN (${ids.map(() => '?').join(', ')})`,
    args: ids,
  })

  return orphaned.rows.map(row => row.sendcloud_option_code)
}

/**
 * Replace the generated zones of one artwork and zone group with the selection
 * the admin is looking at.
 *
 * The semantics are those of a SET, not of an increment: what is saved is
 * exactly what is selected right now, and any generated zone of that group that
 * is not in the selection disappears. Deselecting everything and saving is
 * therefore how a territory is cleared — no separate delete operation, and no
 * diary of additions and removals for the UI to keep.
 *
 * The delete is bounded by (artwork, zone_group, source): all three matter, and
 * `source` is the one that protects the admin's hand-made zones from being
 * destroyed by a recalculation.
 *
 * A method left without any zone at all by this save is deleted too — see
 * `deleteOrphanedMethods`.
 *
 * @param {object} params
 * @param {number} params.artId
 * @param {string} params.zoneGroup
 * @param {object[]} params.selections - `{ optionCode, name, carrierCode, baseCost, estimatedDays }`
 * @returns {Promise<object>} Summary of what was written.
 */
async function applyZoneSelection({ artId, zoneGroup, selections }) {
  if (!isZoneGroup(zoneGroup)) {
    throw new ApiError(400, 'Zona de envío desconocida', 'Zona inválida')
  }

  const art = await loadArtwork(artId)
  const packagingCost = Number(art.packaging_cost) || 0
  const provinces = await getProvincesForGroup(zoneGroup)

  if (selections.length > 0 && provinces.length === 0) {
    throw new ApiError(
      500,
      'No hay provincias registradas para esta zona. Revisa la tabla de códigos postales.',
      'Zona sin provincias'
    )
  }

  // The option codes this artwork and group currently offer. Read BEFORE the
  // delete, because afterwards there is nothing left to tell which methods the
  // save might have stripped of their last zone.
  const previous = await db.execute({
    sql: `SELECT DISTINCT sendcloud_option_code
            FROM shipping_zones
           WHERE product_id = ? AND product_type = 'art'
             AND zone_group = ? AND source = 'sendcloud_calculator'
             AND sendcloud_option_code IS NOT NULL`,
    args: [artId, zoneGroup],
  })
  const previousCodes = previous.rows.map(row => row.sendcloud_option_code)

  // Catalog rows first: they are idempotent and shared, and their ids are
  // needed by the inserts below. Only the delete + insert of the zones has to
  // be atomic, so that the artwork is never momentarily without shipping.
  const prepared = []
  for (const selection of selections) {
    prepared.push({
      ...selection,
      methodId: await ensureShippingMethod(selection),
      finalPrice: computeFinalPrice(selection.baseCost, packagingCost),
    })
  }

  const batch = createBatch()

  // Explicit child delete rather than relying on ON DELETE CASCADE, which needs
  // `PRAGMA foreign_keys` to be on for the connection.
  batch.add(
    `DELETE FROM shipping_zones_postal_codes
      WHERE shipping_zone_id IN (
        SELECT id FROM shipping_zones
         WHERE product_id = ? AND product_type = 'art'
           AND zone_group = ? AND source = 'sendcloud_calculator'
      )`,
    [artId, zoneGroup]
  )
  batch.add(
    `DELETE FROM shipping_zones
      WHERE product_id = ? AND product_type = 'art'
        AND zone_group = ? AND source = 'sendcloud_calculator'`,
    [artId, zoneGroup]
  )

  for (const selection of prepared) {
    batch.add(
      `INSERT INTO shipping_zones (
         shipping_method_id, seller_id, country, cost, product_id, product_type,
         source, zone_group, sendcloud_option_code, base_cost,
         packaging_cost_snapshot, calculated_at, created_at, updated_at
       ) VALUES (?, ?, 'ES', ?, ?, 'art', 'sendcloud_calculator', ?, ?, ?, ?,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        selection.methodId,
        art.seller_id,
        selection.finalPrice,
        artId,
        zoneGroup,
        selection.optionCode,
        selection.baseCost,
        packagingCost,
      ]
    )

    // The zone id is not known inside a batch, so the province rows correlate
    // themselves through the tuple that identifies the row just inserted —
    // unique, because the group's generated zones were deleted two statements
    // above and an option code appears at most once in a selection.
    const provinceValues = provinces.map(() => 'SELECT ? AS ref_value').join(' UNION ALL ')
    batch.add(
      `INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value)
       SELECT z.id, 'province', NULL, p.ref_value
         FROM shipping_zones z, (${provinceValues}) p
        WHERE z.product_id = ? AND z.product_type = 'art'
          AND z.zone_group = ? AND z.source = 'sendcloud_calculator'
          AND z.sendcloud_option_code = ?`,
      [...provinces, artId, zoneGroup, selection.optionCode]
    )
  }

  await batch.execute()

  // Whatever this save stopped offering is the only thing that can have been
  // left without zones. Runs after the batch: before it, the zones about to be
  // re-inserted still count as references.
  const selectedCodes = new Set(prepared.map(s => s.optionCode))
  const removedMethods = await deleteOrphanedMethods(
    previousCodes.filter(code => !selectedCodes.has(code))
  )

  logger.info(
    {
      artId,
      zoneGroup,
      zones: prepared.length,
      provinces: provinces.length,
      removedMethods,
    },
    'Art shipping calculator wrote generated zones'
  )

  return {
    artId,
    zoneGroup,
    provinces,
    removedMethods,
    zones: prepared.map(s => ({
      optionCode: s.optionCode,
      shippingMethodId: s.methodId,
      baseCost: s.baseCost,
      packagingCost,
      cost: s.finalPrice,
    })),
  }
}

module.exports = {
  quoteArtwork,
  applyZoneSelection,
  getGeneratedZones,
  computeFinalPrice,
  classifyOptions,
  buildParcel,
  SHIPPING_VAT_MULTIPLIER,
}
