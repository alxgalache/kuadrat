/**
 * Google Merchant Center product feed, generated from the database.
 *
 * Until October 2026 the feed was a Google spreadsheet edited by hand. Every
 * sale, every new artwork and every re-quoted shipping rate needed an edit, and
 * the first audit (06/10/2026, docs/google-presencia/05-auditoria-merchant-center.md)
 * found exactly the errors hand editing produces: ids and titles swapped, the
 * weight typed into the unit-pricing column, shipping costs unrelated to what
 * checkout charges. Merchant Center now fetches this feed from
 * `GET /api/feeds/google-merchant.xml`, so a sold artwork leaves the feed and a
 * new one enters it without anyone touching anything.
 *
 * What is for sale, how it is described and how its shipping is quoted is
 * decided once, in `productFeedCatalogue.js`, for this feed and the Meta one.
 * This module only writes that catalogue in Google's terms. The ids are the
 * slugs, which Merchant Center and its supplemental source (the ISBN of
 * `el-limite`) depend on: they do not change.
 *
 * Spain admits one shipping price per product for the whole country (Merchant
 * Center offers postal-code pricing only in nine other countries). Google asks
 * for a figure "equal to or higher than" what the buyer pays when the exact one
 * cannot be given, so the feed declares the most expensive zone group the
 * product ships to. For most artworks every group they ship to costs the same.
 */

const config = require('../config/env')
const {
  getProductFeedCatalogue,
  generateCatalogue,
  formatDimensions,
  formatEur,
  ARTWORK_CATEGORY,
  __resetCatalogueCache,
} = require('./productFeedCatalogue')
const { productImageUrl } = require('../utils/productImageUrl')
const { xmlText, tag } = require('../utils/feedXml')

// Business days from order to dispatch. The operator's figure is "about four
// days" per artist (06/10/2026); the range says "about".
const HANDLING_DAYS = { min: 3, max: 5 }

const TITLE_MAX = 150
const DESCRIPTION_MAX = 5000
const MAX_ADDITIONAL_IMAGES = 2

function buildTitle(entry) {
  const parts = [entry.name]
  if (entry.sellerName) parts.push(`– ${entry.sellerName}`)
  let title = parts.join(' ')
  if (entry.productType === 'art') {
    const details = [entry.technique, formatDimensions(entry.dimensions)].filter(Boolean)
    if (details.length > 0) title += ` · ${details.join(' · ')}`
  }
  return title.slice(0, TITLE_MAX)
}

function toItem(entry) {
  const isArt = entry.productType === 'art'
  const images = entry.images.map((basename) => productImageUrl(basename, entry.productType))
  const path = isArt ? 'galeria' : 'tienda'
  const title = buildTitle(entry)

  return {
    id: entry.slug,
    title,
    description: (entry.description || title).slice(0, DESCRIPTION_MAX),
    link: `${config.clientUrl}/${path}/p/${entry.slug}`,
    imageLink: images[0],
    additionalImageLinks: images.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
    priceCents: entry.priceCents,
    brand: entry.sellerName,
    category: isArt ? ARTWORK_CATEGORY : null,
    identifierExists: isArt ? 'no' : null,
    material: entry.technique,
    shippingCents: entry.shipping.cents,
    transit: entry.shipping.transit,
  }
}

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
    // An original artwork has no GTIN, and says so. A store product says
    // nothing: one that has a GTIN (a book's ISBN) gets it, with
    // `identifier_exists = yes`, from the Merchant Center supplemental source.
    // Sending `no` here would collide with that, and whether the primary or the
    // supplemental value wins is a Merchant Center setting, not something this
    // feed can count on. So the feed leaves the attribute to the supplemental source.
    tag('identifier_exists', item.identifierExists),
    tag('google_product_category', item.category),
    tag('material', item.material),
    `<g:shipping>${shipping}</g:shipping>`,
    '</item>',
  ].join('')
}

function renderFeed(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '<title>140d</title>',
    `<link>${xmlText(config.clientUrl)}</link>`,
    '<description>Obra original y productos de 140d, galería de arte online</description>',
    ...entries.map(toItem).map(renderItem),
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}

/** The feed XML from a fresh, uncached catalogue. */
async function generateFeed() {
  return renderFeed((await generateCatalogue()).entries)
}

/** The feed XML from the shared, cached catalogue. */
async function getGoogleMerchantFeed() {
  return renderFeed((await getProductFeedCatalogue()).entries)
}

// Test seam, same convention as emailService.__clearOutbox(). The cache is the
// shared catalogue's, so this resets the Meta feed too.
function __resetFeedCache() {
  __resetCatalogueCache()
}

module.exports = {
  getGoogleMerchantFeed,
  generateFeed,
  formatDimensions,
  HANDLING_DAYS,
  __resetFeedCache,
}
