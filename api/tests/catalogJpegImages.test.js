/**
 * Square JPEG copies of product images (services/catalogImageService.js,
 * GET /api/{art,others}/images/jpeg/v1/:basename), which the Meta catalogue
 * links because it rejects WebP.
 *
 * What matters: the artwork comes out whole on a white 1600 px square; only an
 * existing image of the route's prefix is converted; a successful copy is
 * immutable and an error is not; conversions run one at a time. Nothing reaches
 * the network: the download of the original is replaced by an in-memory reader,
 * and the originals are generated with sharp itself.
 */

const request = require('supertest')
const sharp = require('sharp')
const { app } = require('./helpers/app')
const { db } = require('../config/database')
const logger = require('../config/logger')
const { __setOriginalReader, CANVAS_PX } = require('../services/catalogImageService')
const { uid } = require('./helpers/feedFixtures')

const RED = { r: 200, g: 20, b: 20 }

async function insertImage(productType, ext = 'webp') {
  const basename = `${uid()}.${ext}`
  await db.execute({
    sql: 'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, 0)',
    args: [productType, 900000 + Math.floor(Math.random() * 1000), basename],
  })
  return basename
}

const solid = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: RED } }).webp().toBuffer()

// RGB of one pixel of an encoded image.
async function pixel(buffer, left, top) {
  const raw = await sharp(buffer).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
  return { r: raw[0], g: raw[1], b: raw[2] }
}

const isWhite = ({ r, g, b }) => r > 240 && g > 240 && b > 240
const isRed = ({ r, g, b }) => r > 170 && g < 60 && b < 60

describe('Catalog JPEG copies', () => {
  const originals = new Map()
  const reads = []
  let img

  beforeAll(async () => {
    img = {
      landscape: await insertImage('art'),
      small: await insertImage('art'),
      transparent: await insertImage('other_var', 'png'),
      product: await insertImage('other'),
      broken: await insertImage('art'),
      burst: await Promise.all([1, 2, 3, 4, 5].map(() => insertImage('art'))),
    }
    originals.set(img.landscape, await solid(2400, 1600))
    originals.set(img.small, await solid(400, 300))
    originals.set(img.product, await solid(800, 800))
    originals.set(
      img.transparent,
      await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png()
        .toBuffer()
    )
    for (const basename of img.burst) originals.set(basename, await solid(1200, 900))

    __setOriginalReader(async (basename, productType) => {
      reads.push({ basename, productType })
      if (!originals.has(basename)) throw new Error('CDN timeout')
      return originals.get(basename)
    })
  })

  afterAll(() => __setOriginalReader(null))
  beforeEach(() => {
    reads.length = 0
  })
  afterEach(() => jest.restoreAllMocks())

  const get = (prefix, basename) => request(app).get(`/api/${prefix}/images/jpeg/v1/${basename}.jpg`).buffer(true)

  test('fits a landscape artwork whole into a white 1600 px square, as an immutable progressive JPEG', async () => {
    const res = await get('art', img.landscape)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')

    const meta = await sharp(res.body).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(CANVAS_PX)
    expect(meta.height).toBe(CANVAS_PX)
    expect(meta.isProgressive).toBe(true)
    expect(meta.exif).toBeUndefined()

    // 2400 × 1600 becomes 1600 × 1067, centred: white bands above and below.
    expect(isWhite(await pixel(res.body, 800, 100))).toBe(true)
    expect(isRed(await pixel(res.body, 800, 800))).toBe(true)
    expect(isRed(await pixel(res.body, 5, 800))).toBe(true)
    expect(isWhite(await pixel(res.body, 800, 1500))).toBe(true)
  })

  test('enlarges a small original above the 500 × 500 minimum Meta requires', async () => {
    const res = await get('art', img.small)
    expect(res.status).toBe(200)
    const meta = await sharp(res.body).metadata()
    expect([meta.width, meta.height]).toEqual([CANVAS_PX, CANVAS_PX])
    expect(isRed(await pixel(res.body, 800, 800))).toBe(true)
  })

  test('turns transparency white, and serves variant images under /others', async () => {
    const res = await get('others', img.transparent)
    expect(res.status).toBe(200)
    expect(reads).toEqual([{ basename: img.transparent, productType: 'other_var' }])
    expect(isWhite(await pixel(res.body, 300, 300))).toBe(true)
  })

  test('serves a store product image under /others', async () => {
    const res = await get('others', img.product)
    expect(res.status).toBe(200)
    expect(reads).toEqual([{ basename: img.product, productType: 'other' }])
  })

  test('rejects a basename outside the image pattern without downloading anything', async () => {
    for (const basename of ['..%2Fsecret.webp', 'imagen%20con%20espacios.webp', 'script.js']) {
      const res = await get('art', basename)
      expect(res.status).toBe(400)
      expect(res.body.title).toBe('INVALID_IMAGE_NAME')
    }
    // The copy is always asked for by its .jpg name.
    const withoutJpg = await request(app).get(`/api/art/images/jpeg/v1/${img.landscape}`)
    expect(withoutJpg.status).toBe(400)
    expect(reads).toHaveLength(0)
  })

  test('answers 404 for an unknown image, or one of the other prefix, without downloading anything', async () => {
    const unknown = await get('art', `${uid()}.webp`)
    const wrongPrefix = await get('art', img.product)
    const wrongPrefixBack = await get('others', img.landscape)

    for (const res of [unknown, wrongPrefix, wrongPrefixBack]) {
      expect(res.status).toBe(404)
      expect(res.headers['cache-control'] || '').not.toMatch(/immutable/)
    }
    expect(reads).toHaveLength(0)
  })

  test('answers 502, logs the error and marks nothing immutable when the original cannot be read', async () => {
    const errorLog = jest.spyOn(logger, 'error')
    const res = await get('art', img.broken)

    expect(res.status).toBe(502)
    expect(res.body.title).toBe('IMAGE_CONVERSION_FAILED')
    expect(res.headers['cache-control'] || '').not.toMatch(/immutable/)
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ basename: img.broken, productType: 'art' }),
      'Catalog JPEG copy failed'
    )
  })

  test('converts simultaneous requests one at a time, and serves them all', async () => {
    const realToBuffer = sharp.prototype.toBuffer
    let running = 0
    let maxRunning = 0
    jest.spyOn(sharp.prototype, 'toBuffer').mockImplementation(async function (...args) {
      running++
      maxRunning = Math.max(maxRunning, running)
      try {
        return await realToBuffer.apply(this, args)
      } finally {
        running--
      }
    })

    const responses = await Promise.all(img.burst.map((basename) => get('art', basename)))

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200])
    expect(maxRunning).toBe(1)
  })
})
