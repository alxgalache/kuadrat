/**
 * Square JPEG copies of product images, for the channels that reject WebP.
 *
 * Every product image of the site is WebP, and the Meta catalogue accepts only
 * JPEG or PNG (500 × 500 px at least, 8 MB at most, 1:1 recommended). Its feed
 * links here (`/api/{art,others}/images/jpeg/v1/<basename>`) instead. The
 * artwork is fitted whole into a white square, so no square crop of Instagram
 * ever cuts its edges.
 *
 * The copy is made on request and never stored: the routes live under
 * `/api/(art|others)/images/`, which nginx already caches for 30 days with
 * `proxy_cache_lock`, so each image is converted about once a month and a burst
 * of Meta fetches costs one conversion per image. Storing copies in S3 instead
 * would need a step in every upload, a backfill and its own deletions.
 *
 * The output of `v1` never changes (a published immutable resource is never
 * overwritten). A new size, background or format is a new version: bump
 * `CATALOG_JPEG_VERSION` in utils/productImageUrl.js, which moves the routes
 * and the feed links together.
 *
 * This runs on the same t4g.medium as the rest of the API, so it is bounded:
 * libvips on one thread without its operation cache, one conversion at a time
 * in the process, and the download of the original capped in time and size.
 */

const sharp = require('sharp')
const { productImageUrl } = require('../utils/productImageUrl')

sharp.concurrency(1)
sharp.cache(false)

const CANVAS_PX = 1600
const JPEG_QUALITY = 85
const BACKGROUND = '#ffffff'

const FETCH_TIMEOUT_MS = 15_000
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

/**
 * Reads the original through the same public URL the site and the Google feed
 * use: the CDN in production, the API's own image route elsewhere.
 * `productImageUrl()` is the one place that decides which.
 */
async function fetchOriginal(basename, productType) {
  const url = productImageUrl(basename, productType)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Original image answered ${res.status}: ${url}`)
    if (Number(res.headers.get('content-length')) > MAX_SOURCE_BYTES) {
      throw new Error(`Original image larger than ${MAX_SOURCE_BYTES} bytes: ${url}`)
    }

    const chunks = []
    let total = 0
    for await (const chunk of res.body) {
      total += chunk.length
      if (total > MAX_SOURCE_BYTES) {
        controller.abort()
        throw new Error(`Original image larger than ${MAX_SOURCE_BYTES} bytes: ${url}`)
      }
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
  }
}

let readOriginal = fetchOriginal

// One conversion at a time; downloads may overlap, the CPU-bound part does not.
let conversionQueue = Promise.resolve()
function oneAtATime(task) {
  const run = conversionQueue.then(task, task)
  conversionQueue = run.catch(() => {})
  return run
}

/** The artwork, whole, centred on a white square, as a progressive JPEG without metadata. */
function toSquareJpeg(input) {
  return sharp(input)
    .autoOrient()
    .flatten({ background: BACKGROUND })
    .resize(CANVAS_PX, CANVAS_PX, { fit: 'contain', background: BACKGROUND })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toBuffer()
}

/**
 * @param {string} basename an existing product image (the caller validates it)
 * @param {'art'|'other'|'other_var'} productType
 * @returns {Promise<Buffer>} the JPEG
 */
async function getCatalogJpeg(basename, productType) {
  const original = await readOriginal(basename, productType)
  return oneAtATime(() => toSquareJpeg(original))
}

// Test seam: replaces the download, so tests never reach the network.
function __setOriginalReader(reader) {
  readOriginal = reader || fetchOriginal
}

module.exports = { getCatalogJpeg, CANVAS_PX, __setOriginalReader }
