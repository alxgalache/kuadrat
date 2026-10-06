/**
 * Google Merchant Center product feed, generated from the database.
 *
 * Until October 2026 the feed was a Google spreadsheet edited by hand. Every
 * sale, every new artwork and every re-quoted shipping rate needed an edit, and
 * the first audit (06/10/2026, docs/google-presencia/05-auditoria-merchant-center.md)
 * found exactly the errors hand editing produces: ids and titles swapped, the
 * weight typed into the unit-pricing column, shipping costs unrelated to what
 * checkout charges. Merchant Center now fetches this feed once a day from
 * `GET /api/feeds/google-merchant.xml`, so a sold artwork leaves the feed and a
 * new one enters it without anyone touching anything.
 *
 * Three rules hold the feed to what the site actually sells:
 *
 *  - The product set is the catalogue's: `visibilityPredicate`, the same
 *    criterion the gallery and store listings apply. A store product also
 *    needs stock.
 *  - Shipping is quoted through `quoteSellerGroups`, the module that prices
 *    the checkout itself — legacy zones through `zoneResolver` for art,
 *    Sendcloud for store products, whichever the provider factory says. It is
 *    asked once per zone group, at the group's representative postal code.
 *    Never a parallel query: "which shipping zone applies" has one answer in
 *    this codebase, and a second one is what broke checkout on 16/08/2026.
 *  - A product the feed cannot describe truthfully is left out, never
 *    guessed: no image, no deliverable zone or a failed quote. Merchant Center
 *    drops what a full feed omits, which is the right outcome for a product
 *    nobody could buy from the listing.
 *
 * Spain admits one shipping price per product for the whole country (Merchant
 * Center offers postal-code pricing only in nine other countries). Google asks
 * for a figure "equal to or higher than" what the buyer pays when the exact one
 * cannot be given, so the feed declares the most expensive zone group the
 * product ships to. For most artworks every group they ship to costs the same.
 */

const { db } = require('../config/database')
const config = require('../config/env')
const logger = require('../config/logger')
const { visibilityPredicate } = require('./catalogOrdering')
const { quoteSellerGroups } = require('./shipping/cartQuoting')
const { attachProductImages } = require('../utils/productImages')
const { productImageUrl } = require('../utils/productImageUrl')
const { stripHtml } = require('../utils/htmlEscape')
const { ZONE_GROUP_POSTAL_CODES } = require('../utils/spainShippingZones')

// One generation per hour at most. Merchant Center fetches once a day, so this
// only bounds what a stranger hitting the public URL can cost: each generation
// quotes every product in four zone groups, Sendcloud included.
const CACHE_TTL_MS = 60 * 60 * 1000

// Quotes run in parallel, bounded: ~20 database round trips per product, and
// a store product also calls Sendcloud.
const QUOTE_CONCURRENCY = 6

// Business days from order to dispatch. The operator's figure is "about four
// days" per artist (06/10/2026); the range says "about".
const HANDLING_DAYS = { min: 3, max: 5 }

// Google product taxonomy: «Casa y jardín > Decoración > Obras de arte >
// Carteles, copias y arte visual». Store products carry no category here: the
// store sells books as well as prints, and the category of a specific product
// (e.g. 784, «Multimedia > Libros») goes in the Merchant Center supplemental
// source together with its GTIN.
const ARTWORK_CATEGORY = '500044'

const TITLE_MAX = 150
const DESCRIPTION_MAX = 5000
const MAX_ADDITIONAL_IMAGES = 2

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
// measurement in the title rather than a guessed one.
const DIMENSION_RE =
  /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?\s*(?:cm|cms|centímetros)?\s*$/i

function formatDimensions(raw) {
  const m = typeof raw === 'string' ? raw.match(DIMENSION_RE) : null
  if (!m) return null
  const es = (s) => String(Number.parseFloat(s.replace(',', '.'))).replace('.', ',')
  return `${es(m[1])} × ${es(m[2])} cm`
}

function buildTitle(product, productType) {
  const parts = [product.name]
  if (product.seller_full_name) parts.push(`– ${product.seller_full_name}`)
  let title = parts.join(' ')
  if (productType === 'art') {
    const details = [product.type, formatDimensions(product.dimensions)].filter(Boolean)
    if (details.length > 0) title += ` · ${details.join(' · ')}`
  }
  return title.slice(0, TITLE_MAX)
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
 * @returns {Promise<{ cents: number, transit: {min:number,max:number}|null }
 *   | { error: string }>} `cents` null when no zone group can be delivered to
 */
async function quoteShipping(product, productType) {
  const zoneCents = []
  const days = []

  for (const [group, postalCode] of Object.entries(ZONE_GROUP_POSTAL_CODES)) {
    const [quote] = await quoteSellerGroups({
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

async function loadCatalogue() {
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

  return [
    ...artRows.map((product) => ({ product, productType: 'art' })),
    ...otherRows.map((product) => ({ product, productType: 'other' })),
  ]
}

async function buildItem({ product, productType }) {
  const images = (product.images || []).map((img) => productImageUrl(img.basename, productType))
  if (images.length === 0) return { skipped: 'no image' }

  const shipping = await quoteShipping(product, productType)
  if (shipping.error) return { skipped: 'shipping quote failed', detail: shipping.error }
  if (shipping.cents === null) return { skipped: 'no deliverable zone' }

  const path = productType === 'art' ? 'galeria' : 'tienda'
  const title = buildTitle(product, productType)

  return {
    item: {
      id: product.slug,
      title,
      description: (plainText(product.description) || title).slice(0, DESCRIPTION_MAX),
      link: `${config.clientUrl}/${path}/p/${product.slug}`,
      imageLink: images[0],
      additionalImageLinks: images.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
      priceCents: toCents(product.price),
      brand: product.seller_full_name || null,
      category: productType === 'art' ? ARTWORK_CATEGORY : null,
      material: productType === 'art' ? product.type || null : null,
      shippingCents: shipping.cents,
      transit: shipping.transit,
    },
  }
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

// ── XML ─────────────────────────────────────────────────────────────────────

// Escapes the five XML specials and drops the control characters XML 1.0
// forbids, which a description pasted from a word processor can carry.
function xmlText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const tag = (name, value) =>
  value === null || value === undefined || value === '' ? '' : `<g:${name}>${xmlText(value)}</g:${name}>`

function renderItem(item) {
  const shipping = [
    tag('country', 'ES'),
    tag('price', formatEur(item.shippingCents)),
    tag('min_handling_time', HANDLING_DAYS.min),
    tag('max_handling_time', HANDLING_DAYS.max),
    item.transit ? tag('min_transit_time', item.transit.min) : '',
    item.transit ? tag('max_transit_time', item.transit.max) : '',
  ].join('')

  return [
    '<item>',
    tag('id', item.id),
    tag('title', item.title),
    tag('description', item.description),
    tag('link', item.link),
    tag('image_link', item.imageLink),
    ...item.additionalImageLinks.map((url) => tag('additional_image_link', url)),
    tag('availability', 'in_stock'),
    tag('price', formatEur(item.priceCents)),
    tag('condition', 'new'),
    tag('brand', item.brand),
    // No artwork has a GTIN. A store product that does (a book's ISBN) gets
    // it from the Merchant Center supplemental source, which overrides this.
    tag('identifier_exists', 'no'),
    tag('google_product_category', item.category),
    tag('material', item.material),
    `<g:shipping>${shipping}</g:shipping>`,
    '</item>',
  ].join('')
}

function renderFeed(items) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '<title>140d</title>',
    `<link>${xmlText(config.clientUrl)}</link>`,
    '<description>Obra original y productos de 140d, galería de arte online</description>',
    ...items.map(renderItem),
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}

// ── Generation and cache ────────────────────────────────────────────────────

async function generateFeed() {
  const started = Date.now()
  const catalogue = await loadCatalogue()
  const built = await mapLimit(catalogue, QUOTE_CONCURRENCY, buildItem)

  const items = []
  built.forEach((result, i) => {
    if (result.item) {
      items.push(result.item)
      return
    }
    const { product, productType } = catalogue[i]
    const log = result.skipped === 'shipping quote failed' ? logger.error : logger.warn
    log.call(
      logger,
      { productId: product.id, productType, slug: product.slug, reason: result.skipped, detail: result.detail },
      'Product left out of the Google Merchant feed'
    )
  })

  logger.info(
    { items: items.length, skipped: catalogue.length - items.length, ms: Date.now() - started },
    'Google Merchant feed generated'
  )
  return renderFeed(items)
}

let cache = null // { xml, expiresAt }
let inflight = null

/**
 * The feed XML, from cache when fresh. Concurrent callers share one
 * generation. If a generation fails and an older feed exists, the older one is
 * served: Merchant Center keeps the previous data on a failed fetch anyway, and
 * a stale feed is better than an empty one.
 */
async function getGoogleMerchantFeed() {
  if (cache && Date.now() < cache.expiresAt) return cache.xml

  if (!inflight) {
    inflight = generateFeed()
      .then((xml) => {
        cache = { xml, expiresAt: Date.now() + CACHE_TTL_MS }
        return xml
      })
      .finally(() => {
        inflight = null
      })
  }

  try {
    return await inflight
  } catch (err) {
    if (!cache) throw err
    logger.error({ err }, 'Google Merchant feed generation failed; serving the previous feed')
    return cache.xml
  }
}

// Test seam, same convention as emailService.__clearOutbox().
function __resetFeedCache() {
  cache = null
  inflight = null
}

module.exports = {
  getGoogleMerchantFeed,
  generateFeed,
  formatDimensions,
  HANDLING_DAYS,
  __resetFeedCache,
}
