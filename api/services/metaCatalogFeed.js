/**
 * Meta catalogue feed, the product source of the Instagram and Facebook shop.
 *
 * Commerce Manager fetches `GET /api/feeds/meta-catalog.xml` every hour with a
 * replace schedule: an item missing from the feed is deleted from the
 * catalogue. What is for sale and how it is described comes from the shared
 * catalogue (`productFeedCatalogue.js`), the same one the Google Merchant
 * Center feed renders, so the two channels cannot disagree about it. This
 * module only writes it in Meta's terms, which differ from Google's in four
 * ways that make the Google feed unusable as is:
 *
 *  - Ids are the Meta Pixel's (`utils/metaContentId.js`), not slugs, or no
 *    pixel event would match an item.
 *  - A store product is listed per variant with stock, grouped by
 *    `item_group_id`: the checkout URL brings back the variant the buyer chose.
 *  - Availability is `in stock`, the value Meta documents.
 *  - Images are square JPEG copies: Meta rejects WebP, and every product image
 *    of the site is WebP.
 *
 * No `shipping`: checkout happens on the site, which quotes and charges the
 * real shipping. The most expensive zone group, which Google needs, would show
 * a peninsular buyer the Canary Islands price for no reason.
 *
 * Nothing is ever declared `out of stock`: what cannot be bought is not in the
 * feed. Meta removes the product tags of an out-of-stock item anyway, so
 * keeping sold artworks would save no tag and only show them as sold out.
 */

const config = require('../config/env')
const {
  getProductFeedCatalogue,
  formatDimensions,
  formatEur,
  ARTWORK_CATEGORY,
} = require('./productFeedCatalogue')
const { catalogJpegUrl } = require('../utils/productImageUrl')
const { contentId } = require('../utils/metaContentId')
const { xmlText, tag } = require('../utils/feedXml')

// Meta's limits. It recommends titles of at most 65 characters, which is why
// the title is only name and artist: technique and size go in the description.
const TITLE_MAX = 200
const DESCRIPTION_MAX = 9999
const MAX_IMAGES = 3

// `brand` is required by Meta; an item without it is rejected.
const FALLBACK_BRAND = '140d'

// The label the store page shows for a variant without a name.
const DEFAULT_VARIANT_LABEL = 'Opción estándar'

function baseTitle(entry) {
  return entry.sellerName ? `${entry.name} – ${entry.sellerName}` : entry.name
}

function productLink(entry) {
  const path = entry.productType === 'art' ? 'galeria' : 'tienda'
  return `${config.clientUrl}/${path}/p/${entry.slug}`
}

function artItem(entry) {
  const title = baseTitle(entry).slice(0, TITLE_MAX)
  const details = [entry.technique, formatDimensions(entry.dimensions)].filter(Boolean).join(' · ')
  const description = [details && `${details}.`, entry.description].filter(Boolean).join(' ') || title

  return {
    id: contentId('art', entry.id),
    groupId: null,
    title,
    description: description.slice(0, DESCRIPTION_MAX),
    entry,
    images: entry.images.slice(0, MAX_IMAGES).map((basename) => catalogJpegUrl(basename, 'art')),
    category: ARTWORK_CATEGORY,
    productType: entry.technique ? `Obra original > ${entry.technique}` : 'Obra original',
  }
}

function variantItems(entry) {
  const labelled = entry.variants.length > 1
  return entry.variants.map((variant) => {
    const label = labelled ? ` · ${variant.key || DEFAULT_VARIANT_LABEL}` : ''
    const title = `${baseTitle(entry)}${label}`.slice(0, TITLE_MAX)
    // The variant's own images first, then the product's.
    const images = [
      ...variant.images.map((basename) => catalogJpegUrl(basename, 'other_var')),
      ...entry.images.map((basename) => catalogJpegUrl(basename, 'other')),
    ].slice(0, MAX_IMAGES)

    return {
      id: contentId('other', entry.id, variant.id),
      groupId: contentId('other', entry.id),
      title,
      description: (entry.description || title).slice(0, DESCRIPTION_MAX),
      entry,
      images,
      category: null,
      productType: 'Tienda',
    }
  })
}

function renderItem(item) {
  const [imageLink, ...additional] = item.images
  return [
    '<item>',
    tag('id', item.id),
    tag('item_group_id', item.groupId),
    tag('title', item.title),
    tag('description', item.description),
    tag('availability', 'in stock'),
    tag('condition', 'new'),
    tag('price', formatEur(item.entry.priceCents)),
    tag('link', productLink(item.entry)),
    tag('image_link', imageLink),
    ...additional.map((url) => tag('additional_image_link', url)),
    tag('brand', item.entry.sellerName || FALLBACK_BRAND),
    tag('google_product_category', item.category),
    tag('product_type', item.productType),
    '</item>',
  ].join('')
}

function renderFeed(entries) {
  const items = entries.flatMap((entry) => (entry.productType === 'art' ? [artItem(entry)] : variantItems(entry)))
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

/** The feed XML from the shared, cached catalogue. */
async function getMetaCatalogFeed() {
  return renderFeed((await getProductFeedCatalogue()).entries)
}

module.exports = { getMetaCatalogFeed }
