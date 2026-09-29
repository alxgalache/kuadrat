/**
 * Delivery of pre-recorded event videos (openspec change:
 * event-video-cdn-delivery).
 *
 *   · The public payloads never carry a video URL: before this change
 *     `video_url` travelled in GET /api/events/:slug and in the calendar, so
 *     anyone could watch or download the video without registering.
 *   · POST /video-token hands out the sources only during the pass and only to
 *     whoever has access; a protected source comes back as a CloudFront signed
 *     URL verified here with the public half of a throwaway key.
 *   · `video_url_av1` and `is_test` travel the four-place write path (the two
 *     Zod schemas, the INSERT and `allowedFields`), which fails silently in
 *     both directions when one place is missed — same matrix as
 *     eventHostFlags.test.js.
 *
 * Nothing here reaches the network: signing is local crypto and the database
 * is the local test file.
 */

const request = require('supertest')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { app } = require('./helpers/app')
const { db } = require('../config/database')
const eventService = require('../services/eventService')
const eventAdminController = require('../controllers/eventAdminController')
const cloudfrontSigner = require('../utils/cloudfrontSigner')
const { createEventSchema, updateEventSchema } = require('../validators/eventSchemas')
const { createVerifiedAttendee } = require('./helpers/eventAttendees')

const ORIGIN = 'https://cdn.140d.art'
const MP4 = `${ORIGIN}/eventos-video/lynda_blair/lynda_blair_h264.mp4`
const AV1 = `${ORIGIN}/eventos-video/lynda_blair/lynda_blair_av1.mp4`
const KEY_PAIR_ID = 'KTESTKEYPAIR01'
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const signingOn = () => cloudfrontSigner.__configureForTests({ origin: ORIGIN, keyPairId: KEY_PAIR_ID, privateKey })

let hostId

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10)
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', 'Vera Vídeo')",
    args: [`video-host-${Date.now()}@test.com`, hash],
  })
  hostId = Number(host.lastInsertRowid)
})

beforeEach(signingOn)
afterAll(() => cloudfrontSigner.__configureForTests(null))

async function createVideoEvent({
  status = 'scheduled', accessType = 'free', videoUrl = MP4, videoUrlAv1 = AV1,
  eventDatetime = new Date().toISOString(), durationMinutes = 45,
} = {}) {
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, duration_minutes, host_user_id, access_type, price,
             category, status, format, content_type, video_url, video_url_av1)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'video', ?, 'video', 'video', ?, ?)`,
    args: [
      id, `Pase ${id.slice(0, 8)}`, `pase-${id.slice(0, 8)}`, eventDatetime, durationMinutes, hostId,
      accessType, accessType === 'paid' ? 10 : null, status, videoUrl, videoUrlAv1,
    ],
  })
  return id
}

async function startPass(eventId, startedAt = new Date()) {
  await db.execute({
    sql: "UPDATE events SET status = 'active', video_started_at = ? WHERE id = ?",
    args: [startedAt.toISOString(), eventId],
  })
}

const attendeeFor = (eventId) => createVerifiedAttendee(eventId, {
  first_name: 'Ana', last_name: 'Asistente', email: `video-${crypto.randomUUID().slice(0, 8)}@test.com`,
})

const videoToken = (eventId, body) => request(app).post(`/api/events/${eventId}/video-token`).send(body)

const fromCloudfrontBase64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64')
function expectSignedFor(signedUrl, objectUrl) {
  const url = new URL(signedUrl)
  expect(`${url.origin}${url.pathname}`).toBe(objectUrl)
  const policyJson = fromCloudfrontBase64(url.searchParams.get('Policy')).toString('utf8')
  const signature = fromCloudfrontBase64(url.searchParams.get('Signature'))
  expect(crypto.verify('sha256', Buffer.from(policyJson, 'utf8'), publicKey, signature)).toBe(true)
  expect(JSON.parse(policyJson).Statement[0].Resource).toBe(objectUrl)
  expect(url.searchParams.get('Key-Pair-Id')).toBe(KEY_PAIR_ID)
  return JSON.parse(policyJson)
}

describe('public payloads never reveal the video', () => {
  test('GET /api/events/:slug carries has_video and neither URL', async () => {
    const id = await createVideoEvent()
    const { slug } = await eventService.getEventById(id)

    const res = await request(app).get(`/api/events/${slug}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.event.has_video).toBe(true)
    expect(res.body.event).not.toHaveProperty('video_url')
    expect(res.body.event).not.toHaveProperty('video_url_av1')
  })

  test('the calendar carries no video URL either', async () => {
    const id = await createVideoEvent({ eventDatetime: '2031-05-10 18:00:00' })

    const res = await request(app).get('/api/events?from=2031-05-01&to=2031-05-31')

    expect(res.statusCode).toBe(200)
    const listed = res.body.events.find((e) => e.id === id)
    expect(listed).toBeDefined()
    expect(listed.has_video).toBe(true)
    for (const event of res.body.events) {
      expect(event).not.toHaveProperty('video_url')
      expect(event).not.toHaveProperty('video_url_av1')
    }
  })

  test('an event without a video says so', async () => {
    const id = await createVideoEvent({ videoUrl: null, videoUrlAv1: null })
    const { slug } = await eventService.getEventById(id)
    const res = await request(app).get(`/api/events/${slug}`)
    expect(res.body.event.has_video).toBe(false)
  })
})

describe('POST /api/events/:id/video-token', () => {
  test('a verified attendee during the pass gets both sources, signed, until the planned end + 30 min', async () => {
    const id = await createVideoEvent({ durationMinutes: 40 })
    const { attendee, accessToken } = await attendeeFor(id)
    const startedAt = new Date(Date.now() - 10 * 60 * 1000)
    await startPass(id, startedAt)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(200)
    expect(res.body.mode).toBe('url')
    const policy = expectSignedFor(res.body.sources.mp4, MP4)
    expectSignedFor(res.body.sources.av1, AV1)
    const expectedEpoch = Math.floor((startedAt.getTime() + 70 * 60 * 1000) / 1000)
    expect(policy.Statement[0].Condition.DateLessThan['AWS:EpochTime']).toBe(expectedEpoch)
    expect(res.body.expiresAt).toBe(new Date(startedAt.getTime() + 70 * 60 * 1000).toISOString())
  })

  test('no AV1 stored → av1 is null', async () => {
    const id = await createVideoEvent({ videoUrlAv1: null })
    const { attendee, accessToken } = await attendeeFor(id)
    await startPass(id)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(200)
    expectSignedFor(res.body.sources.mp4, MP4)
    expect(res.body.sources.av1).toBeNull()
  })

  test('a finished event hands out nothing', async () => {
    const id = await createVideoEvent()
    const { attendee, accessToken } = await attendeeFor(id)
    await db.execute({ sql: "UPDATE events SET status = 'finished' WHERE id = ?", args: [id] })

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(400)
    expect(res.body.sources).toBeUndefined()
  })

  test('a scheduled event (pass not started) hands out nothing', async () => {
    const id = await createVideoEvent()
    const { attendee, accessToken } = await attendeeFor(id)
    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })
    expect(res.statusCode).toBe(400)
  })

  test('a paid event and an attendee who has not paid → 403', async () => {
    const id = await createVideoEvent({ accessType: 'paid' })
    const { attendee, accessToken } = await attendeeFor(id)
    await startPass(id)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(403)
    expect(res.body.sources).toBeUndefined()
  })

  test('no credentials → 403', async () => {
    const id = await createVideoEvent()
    await startPass(id)
    const res = await videoToken(id, {})
    expect(res.statusCode).toBe(403)
  })

  test('an external source is handed out as is, unsigned', async () => {
    const external = 'https://otro-host.example/concierto.mp4'
    const id = await createVideoEvent({ videoUrl: external, videoUrlAv1: null })
    const { attendee, accessToken } = await attendeeFor(id)
    await startPass(id)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(200)
    expect(res.body.sources.mp4).toBe(external)
    expect(res.body.expiresAt).toBeNull()
  })

  test('a protected source on a server that cannot sign → 503, never an unsigned URL', async () => {
    const id = await createVideoEvent()
    const { attendee, accessToken } = await attendeeFor(id)
    await startPass(id)
    cloudfrontSigner.__configureForTests(null)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(503)
    expect(res.body.title).toBe('EVENT_VIDEO_SIGNING_UNAVAILABLE')
    expect(JSON.stringify(res.body)).not.toContain('eventos-video')
  })

  test('the uploaded mode keeps its vtoken response', async () => {
    const id = await createVideoEvent({ videoUrl: 'uploaded:event-123.mp4', videoUrlAv1: null })
    const { attendee, accessToken } = await attendeeFor(id)
    await startPass(id)

    const res = await videoToken(id, { attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(200)
    expect(res.body.mode).toBe('uploaded')
    expect(res.body.filename).toBe('event-123.mp4')
    expect(typeof res.body.vtoken).toBe('string')
  })
})

// --- four-place write path ---------------------------------------------------

async function callController(handler, { body = {}, params = {} } = {}) {
  let payload = null
  let statusCode = null
  const res = {
    status(code) { statusCode = code; return this },
    json(value) { payload = value; return this },
  }
  await handler({ body, params }, res, (err) => { throw err })
  return { statusCode, payload }
}

const adminPayload = (extra = {}) => ({
  title: 'Pase de prueba', event_datetime: '2031-06-01 18:00:00', host_user_id: hostId,
  category: 'video', format: 'video', content_type: 'video', ...extra,
})

describe('video_url_av1 and is_test through the write path', () => {
  test('both Zod schemas keep the fields instead of stripping them', () => {
    const create = createEventSchema.parse({ body: adminPayload({ video_url: MP4, video_url_av1: AV1, is_test: true }) })
    expect(create.body.video_url_av1).toBe(AV1)
    expect(create.body.is_test).toBe(true)
    const update = updateEventSchema.parse({ body: { video_url_av1: AV1, is_test: 0 } })
    expect(update.body.video_url_av1).toBe(AV1)
    expect(update.body.is_test).toBe(0)
  })

  test('create persists both (INSERT), and is_test defaults to 0', async () => {
    const { payload } = await callController(eventAdminController.createEvent, {
      body: adminPayload({ video_url: MP4, video_url_av1: AV1, is_test: true }),
    })
    expect(payload.success).toBe(true)
    const stored = await eventService.getEventById(payload.event.id)
    expect(stored.video_url_av1).toBe(AV1)
    expect(stored.is_test).toBe(1)

    const plain = await callController(eventAdminController.createEvent, { body: adminPayload() })
    expect(plain.payload.event.is_test).toBe(0)
    expect(plain.payload.event.video_url_av1).toBeNull()
  })

  test('update changes both (allowedFields), in both directions', async () => {
    const created = await eventService.createEvent(adminPayload({ video_url: MP4 }))

    const on = await callController(eventAdminController.updateEvent, {
      params: { id: created.id }, body: { video_url_av1: AV1, is_test: true },
    })
    expect(on.payload.event.video_url_av1).toBe(AV1)
    expect(on.payload.event.is_test).toBe(1)

    const off = await callController(eventAdminController.updateEvent, {
      params: { id: created.id }, body: { video_url_av1: null, is_test: false },
    })
    expect(off.payload.event.video_url_av1).toBeNull()
    expect(off.payload.event.is_test).toBe(0)
  })

  test('the controller refuses an unprotected CDN URL with its code in title', async () => {
    const { statusCode, payload } = await callController(eventAdminController.createEvent, {
      body: adminPayload({ video_url: `${ORIGIN}/stories/concierto.mp4` }),
    })
    expect(statusCode).toBe(400)
    expect(payload.title).toBe('EVENT_VIDEO_URL_UNPROTECTED')
  })

  test('the controller refuses AV1 without MP4 on update', async () => {
    const created = await eventService.createEvent(adminPayload({ video_url: MP4, video_url_av1: AV1 }))
    const { statusCode, payload } = await callController(eventAdminController.updateEvent, {
      params: { id: created.id }, body: { video_url: '' },
    })
    expect(statusCode).toBe(400)
    expect(payload.title).toBe('EVENT_VIDEO_AV1_REQUIRES_MP4')
  })
})
