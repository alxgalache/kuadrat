/**
 * The product catalogue behind every product feed: Google Merchant Center
 * (`googleMerchantFeed.js`) and the Meta catalogue that feeds the Instagram and
 * Facebook shop (`metaCatalogFeed.js`).
 *
 * This module decides what is for sale and how it is described. The feeds are
 * serializers on top of it, and none of them queries products on its own: two
 * answers to "what does 140d sell" would drift apart, which is exactly what
 * the hand-edited spreadsheet did before the Google feed existed (audit of
 * 06/10/2026, docs/google-presencia/05-auditoria-merchant-center.md).
 *
 * Three rules hold the catalogue to what the site actually sells:
 *
 *  - The product set is the catalogue's: `visibilityPredicate`, the same
 *    criterion the gallery and store listings apply. A store product also
 *    needs stock, and only its variants with stock are listed.
 *  - Shipping is quoted through `quoteSellerGroups`, the module that prices
 *    the checkout itself — legacy zones through `zoneResolver` for art,
 *    Sendcloud for store products, whichever the provider factory says. It is
 *    asked once per zone group, at the group's representative postal code.
 *    Never a parallel query: "which shipping zone applies" has one answer in
 *    this codebase, and a second one is what broke checkout on 16/08/2026.
 *  - A product the catalogue cannot describe truthfully is left out, never
 *    guessed: no image or no deliverable zone. Both feeds drop what a full
 *    feed omits, which is the right outcome for a product nobody could buy.
 *
 * A failed quote is the exception to the last rule. It says nothing about the
 * product, only that Sendcloud (or the database) failed this time. Dropping
 * the product would cost Google a day without the listing, and cost Meta much
 * more: its scheduled feed replaces the catalogue, deletes the missing item,
 * and every product tag of that item on Instagram is gone for good. So when a
 * product that was in the previous generation fails its quote, it keeps that
 * generation's shipping quote. Everything else comes from the current read.
 *
 * Generations are cached for an hour and shared: concurrent callers wait for
 * one generation, and both feeds render from it. The feed URLs are public and
 * each generation quotes the whole catalogue in four zone groups, Sendcloud
 * included, so the cache is also what bounds what a stranger can cost.
 */

const { db } = require('../config/database')
const logger = require('../config/logger')
const { visibilityPredicate } = require('./catalogOrdering')
// Called through the module object, not destructured, so tests can spy on it.
const cartQuoting = require('./shipping/cartQuoting')
const { attachProductImages } = require('../utils/productImages')
const { stripHtml } = require('../utils/htmlEscape')
const { ZONE_GROUP_POSTAL_CODES } = require('../utils/spainShippingZones')

const CACHE_TTL_MS = 60 * 60 * 1000

// Quotes run in parallel, bounded: ~20 database round trips per product, and
// a store product also calls Sendcloud.
const QUOTE_CONCURRENCY = 6

// Google product taxonomy: «Casa y jardín > Decoración > Obras de arte >
// Carteles, copias y arte visual». Meta reads the same taxonomy. Store
// products carry no category: the store sells books as well as prints.
const ARTWORK_CATEGORY = '500044'

// ── Text ────────────────────────────────────────────────────────────────────

// Block-level tags become spaces before `stripHtml` removes the rest; without
// this, "<p>uno</p><p>dos</p>" reads "unodos".
function plainText(html) {
  return stripHtml(String(html || '').replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

// Same pattern as `parseDimensions` in client/lib/schema.js — the two apps share
// no code. `alto x ancho`, optional depth and unit; anything else yields no
// measurement rather than a guessed one.
const DIMENSION_RE =
  /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?\s*(?:cm|cms|centímetros)?\s*$/i

function formatDimensions(raw) {
  const m = typeof raw === 'string' ? raw.match(DIMENSION_RE) : null
  if (!m) return null
  const es = (s) => String(Number.parseFloat(s.replace(',', '.'))).replace('.', ',')
  return `${es(m[1])} × ${es(m[2])} cm`
}

// ── Money and days ──────────────────────────────────────────────────────────

const toCents = (amount) => Math.round(Number(amount) * 100)
const formatEur = (cents) => `${(cents / 100).toFixed(2)} EUR`

// The legacy provider reports `{ min, max }`, Sendcloud a single number.
function deliveryDays(estimatedDays) {
  if (estimatedDays && typeof estimatedDays === 'object') {
    return [estimatedDays.min, estimatedDays.max].filter(Number.isFinite)
  }
  return Number.isFinite(estimatedDays) ? [estimatedDays] : []
}

// ── Shipping ────────────────────────────────────────────────────────────────

/**
 * Spain admits one shipping price per product for the whole country in
 * Merchant Center, so the catalogue keeps the most expensive zone group the
 * product ships to (see googleMerchantFeed.js).
 *
 * @returns {Promise<{ cents: number|null, transit: {min:number,max:number}|null }
 *   | { error: string }>} `cents` null when no zone group can be delivered to
 */
async function quoteShipping(product, productType) {
  const zoneCents = []
  const days = []

  for (const [group, postalCode] of Object.entries(ZONE_GROUP_POSTAL_CODES)) {
    const [quote] = await cartQuoting.quoteSellerGroups({
      items: [{ productId: product.id, productType, quantity: 1, sellerId: product.seller_id }],
      deliveryAddress: { country: 'ES', postalCode },
    })

    if (quote?.deliveryError) return { error: `${group}: ${quote.deliveryError}` }

    const options = (quote?.deliveryOptions || []).filter((o) => Number.isFinite(Number(o.price)))
    if (options.length === 0) continue // the product does not ship to this group

    // The buyer can pick the cheapest option of the group.
    zoneCents.push(Math.min(...options.map((o) => toCents(o.price))))
    for (const o of options) days.push(...deliveryDays(o.estimatedDays))
  }

  return {
    cents: zoneCents.length > 0 ? Math.max(...zoneCents) : null,
    transit: days.length > 0 ? { min: Math.min(...days), max: Math.max(...days) } : null,
  }
}

// ── Catalogue ───────────────────────────────────────────────────────────────

async function loadProducts() {
  const art = await db.execute(`
    SELECT a.id, a.seller_id, a.name, a.description, a.price, a.slug, a.type, a.dimensions,
           u.full_name AS seller_full_name
    FROM art a
    LEFT JOIN users u ON a.seller_id = u.id
    WHERE ${visibilityPredicate('a')}
    ORDER BY a.id ASC
  `)

  const others = await db.execute(`
    SELECT o.id, o.seller_id, o.name, o.description, o.price, o.slug,
           u.full_name AS seller_full_name,
           (SELECT COALESCE(SUM(stock), 0) FROM other_vars WHERE other_id = o.id) AS total_stock
    FROM others o
    LEFT JOIN users u ON o.seller_id = u.id
    WHERE ${visibilityPredicate('o')}
    ORDER BY o.id ASC
  `)

  const artRows = [...art.rows]
  const otherRows = others.rows.filter((row) => Number(row.total_stock) > 0)
  await attachProductImages(artRows, 'art')
  await attachProductImages(otherRows, 'other')
  await attachVariants(otherRows)

  return [
    ...artRows.map((product) => ({ product, productType: 'art' })),
    ...otherRows.map((product) => ({ product, productType: 'other' })),
  ]
}

// The variants with stock of each store product, with their own images.
async function attachVariants(otherRows) {
  for (const row of otherRows) row.variants = []
  if (otherRows.length === 0) return

  const ids = otherRows.map((row) => row.id)
  const result = await db.execute({
    sql: `SELECT id, other_id, key, stock FROM other_vars
          WHERE stock > 0 AND other_id IN (${ids.map(() => '?').join(',')})
          ORDER BY other_id ASC, id ASC`,
    args: ids,
  })
  const variants = [...result.rows]
  await attachProductImages(variants, 'other_var')

  const byProduct = new Map(otherRows.map((row) => [row.id, row]))
  for (const variant of variants) byProduct.get(variant.other_id)?.variants.push(variant)
}

const entryKey = (productType, id) => `${productType}:${id}`

/**
 * A channel-neutral description of one product. Images are basenames, in
 * order; each feed turns them into the URL its channel accepts.
 */
function toEntry(product, productType, shipping) {
  return {
    productType,
    id: product.id,
    slug: product.slug,
    sellerId: product.seller_id,
    name: product.name,
    sellerName: product.seller_full_name || null,
    description: plainText(product.description),
    technique: productType === 'art' ? product.type || null : null,
    dimensions: productType === 'art' ? product.dimensions || null : null,
    priceCents: toCents(product.price),
    images: (product.images || []).map((img) => img.basename),
    shipping,
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      key: variant.key || null,
      stock: Number(variant.stock),
      images: (variant.images || []).map((img) => img.basename),
    })),
  }
}

async function buildEntry({ product, productType }, previousEntries) {
  if (!product.images || product.images.length === 0) return { skipped: 'no image' }

  const shipping = await quoteShipping(product, productType)
  if (shipping.error) {
    const previous = previousEntries.get(entryKey(productType, product.id))
    if (!previous) return { skipped: 'shipping quote failed', detail: shipping.error }
    return { entry: toEntry(product, productType, previous.shipping), reusedQuote: shipping.error }
  }
  if (shipping.cents === null) return { skipped: 'no deliverable zone' }

  return { entry: toEntry(product, productType, shipping) }
}

// Runs `fn` over `list` with at most `limit` calls in flight, preserving order.
async function mapLimit(list, limit, fn) {
  const results = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      results[i] = await fn(list[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}

/**
 * Builds the catalogue from the database, uncached.
 *
 * @param {{ previous?: { entries: object[] } }} [opts] the previous generation,
 *   whose shipping quotes stand in for the ones that fail now
 * @returns {Promise<{ entries: object[], generatedAt: number }>}
 */
async function generateCatalogue({ previous } = {}) {
  const started = Date.now()
  const previousEntries = new Map(
    (previous?.entries || []).map((entry) => [entryKey(entry.productType, entry.id), entry])
  )

  const products = await loadProducts()
  const built = await mapLimit(products, QUOTE_CONCURRENCY, (item) => buildEntry(item, previousEntries))

  const entries = []
  let reused = 0
  built.forEach((result, i) => {
    const { product, productType } = products[i]
    const context = { productId: product.id, productType, slug: product.slug }

    if (result.entry) {
      entries.push(result.entry)
      if (result.reusedQuote) {
        reused++
        logger.error(
          { ...context, detail: result.reusedQuote },
          'Shipping quote failed; the product feeds keep its previous quote'
        )
      }
      return
    }

    const log = result.skipped === 'shipping quote failed' ? logger.error : logger.warn
    log.call(logger, { ...context, reason: result.skipped, detail: result.detail }, 'Product left out of the product feeds')
  })

  logger.info(
    { entries: entries.length, skipped: products.length - entries.length, reused, ms: Date.now() - started },
    'Product feed catalogue generated'
  )
  return { entries, generatedAt: Date.now() }
}

// ── Cache ───────────────────────────────────────────────────────────────────

let cache = null // { catalogue, expiresAt }
let inflight = null

/**
 * The catalogue, from cache when fresh. Concurrent callers share one
 * generation. If a generation fails and an older catalogue exists, the older
 * one is served: both channels keep their previous data on a failed fetch
 * anyway, and a stale catalogue is better than an empty one — for Meta, an
 * empty feed would delete every item.
 */
async function getProductFeedCatalogue() {
  if (cache && Date.now() < cache.expiresAt) return cache.catalogue

  if (!inflight) {
    inflight = generateCatalogue({ previous: cache?.catalogue })
      .then((catalogue) => {
        cache = { catalogue, expiresAt: Date.now() + CACHE_TTL_MS }
        return catalogue
      })
      .finally(() => {
        inflight = null
      })
  }

  try {
    return await inflight
  } catch (err) {
    if (!cache) throw err
    logger.error({ err }, 'Product feed catalogue generation failed; serving the previous one')
    return cache.catalogue
  }
}

// Test seams, same convention as emailService.__clearOutbox(). Reset forgets
// everything; expire keeps the catalogue as "previous" for the next generation.
function __resetCatalogueCache() {
  cache = null
  inflight = null
}

function __expireCatalogueCache() {
  if (cache) cache.expiresAt = 0
}

module.exports = {
  getProductFeedCatalogue,
  generateCatalogue,
  formatDimensions,
  formatEur,
  ARTWORK_CATEGORY,
  __resetCatalogueCache,
  __expireCatalogueCache,
}
