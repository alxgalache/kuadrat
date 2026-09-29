/**
 * Timetable and closing of a pre-recorded video pass
 * (openspec change: live-event-access-hardening).
 *
 *   · the real video duration is read from the MP4's `mvhd`, with the index at
 *     the start or at the end, without downloading the file;
 *   · the pass ends at start + duration (or duration_minutes if it could not be
 *     measured) and the chat closes five minutes later;
 *   · past that instant the server refuses the video and finishes the event,
 *     exactly as «Finalizar» does.
 *
 * No network: the HTTP transport is injected, and the MP4s are built in memory.
 */

const request = require('supertest')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { app } = require('./helpers/app')
const { db } = require('../config/database')
const eventService = require('../services/eventService')
const cloudfrontSigner = require('../utils/cloudfrontSigner')
const videoDurationService = require('../services/videoDurationService')
const { closeExpiredVideoPasses } = require('../services/videoPassService')
const { readMp4Duration } = require('../utils/mp4Duration')
const { passEndsAt, chatClosesAt, isPassClosed, CHAT_GRACE_MS } = require('../utils/videoPass')
const { createVerifiedAttendee } = require('./helpers/eventAttendees')

const ORIGIN = 'https://cdn.140d.art'
const MP4 = `${ORIGIN}/eventos-video/prueba/prueba_h264.mp4`
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const MIN = 60 * 1000

// --- in-memory MP4 ------------------------------------------------------------

const box = (type, payload = Buffer.alloc(0)) => {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

function mvhd(version, timescale, duration) {
  if (version === 1) {
    const p = Buffer.alloc(32 + 80)
    p.writeUInt8(1, 0)
    p.writeUInt32BE(timescale, 20)
    p.writeBigUInt64BE(BigInt(duration), 24)
    return box('mvhd', p)
  }
  const p = Buffer.alloc(20 + 80)
  p.writeUInt32BE(timescale, 12)
  p.writeUInt32BE(duration, 16)
  return box('mvhd', p)
}

const moov = (version = 0) => box('moov', Buffer.concat([mvhd(version, 1000, 2076640), box('trak', Buffer.alloc(64))]))
const ftyp = box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1'))
const mdat = box('mdat', Buffer.alloc(200000, 7))

const faststart = Buffer.concat([ftyp, moov(), mdat])
const indexAtEnd = Buffer.concat([ftyp, mdat, moov(1)])

const bufferReader = (buffer) => async (start, length) => buffer.subarray(start, start + length)

// A fetch that serves Range requests out of a buffer, and records the URLs
function rangeFetch(buffer, { status = 206 } = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push(url)
    const [a, b] = init.headers.Range.replace('bytes=', '').split('-').map(Number)
    if (status !== 206) return { status, body: { cancel: async () => {} }, arrayBuffer: async () => buffer }
    const slice = buffer.subarray(a, b + 1)
    return { status: 206, arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.length) }
  }
  fn.calls = calls
  return fn
}

// --- fixtures -------------------------------------------------------------------

let hostId
beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10)
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', 'Clara Cierre')",
    args: [`pass-host-${Date.now()}@test.com`, hash],
  })
  hostId = Number(host.lastInsertRowid)
})
beforeEach(() => cloudfrontSigner.__configureForTests({ origin: ORIGIN, keyPairId: 'KTESTKEYPAIR01', privateKey }))
afterEach(() => {
  cloudfrontSigner.__configureForTests(null)
  videoDurationService.__setFetchForTests(null)
})

async function createVideoEvent({ startedAgoMs = null, durationSeconds = null, durationMinutes = 45, status = 'scheduled' } = {}) {
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO events (id, title, slug, event_datetime, duration_minutes, host_user_id, category,
            status, format, content_type, video_url, video_started_at, video_duration_seconds)
          VALUES (?, ?, ?, ?, ?, ?, 'video', ?, 'video', 'video', ?, ?, ?)`,
    args: [
      id, `Pase ${id.slice(0, 8)}`, `pase-cierre-${id.slice(0, 8)}`, new Date().toISOString(), durationMinutes, hostId,
      status, MP4, startedAgoMs === null ? null : new Date(Date.now() - startedAgoMs).toISOString(), durationSeconds,
    ],
  })
  return id
}

// --- tests ----------------------------------------------------------------------

describe('readMp4Duration', () => {
  test('index at the start (faststart), mvhd v0', async () => {
    expect(await readMp4Duration(bufferReader(faststart))).toBeCloseTo(2076.64, 2)
  })

  test('index after mdat, mvhd v1', async () => {
    expect(await readMp4Duration(bufferReader(indexAtEnd))).toBeCloseTo(2076.64, 2)
  })

  test('not an MP4 → null', async () => {
    expect(await readMp4Duration(bufferReader(Buffer.from('<html>no soy un vídeo</html>')))).toBeNull()
    expect(await readMp4Duration(bufferReader(Buffer.alloc(0)))).toBeNull()
  })
})

describe('videoDurationService', () => {
  test('a protected MP4 is read through a SIGNED Range request, only its header', async () => {
    const fetch = rangeFetch(faststart)
    videoDurationService.__setFetchForTests(fetch)

    expect(await videoDurationService.measureVideoDuration(MP4)).toBeCloseTo(2076.64, 2)
    expect(fetch.calls.length).toBeLessThanOrEqual(3)
    for (const url of fetch.calls) {
      expect(url.startsWith(`${MP4}?Policy=`)).toBe(true)
      expect(url).toContain('Key-Pair-Id=KTESTKEYPAIR01')
    }
  })

  test('a server answering 200 to a Range request is aborted: no duration', async () => {
    videoDurationService.__setFetchForTests(rangeFetch(faststart, { status: 200 }))
    await expect(videoDurationService.measureVideoDuration(MP4)).rejects.toThrow(/Range request answered 200/)
  })

  test('refreshVideoDuration stores the duration, and NULL when it cannot be measured', async () => {
    const id = await createVideoEvent({ durationSeconds: 999 })
    videoDurationService.__setFetchForTests(rangeFetch(indexAtEnd))
    expect(await videoDurationService.refreshVideoDuration(id)).toBeCloseTo(2076.64, 2)
    expect((await eventService.getEventById(id)).video_duration_seconds).toBeCloseTo(2076.64, 2)

    videoDurationService.__setFetchForTests(async () => { throw new Error('ECONNREFUSED') })
    expect(await videoDurationService.refreshVideoDuration(id)).toBeNull()
    expect((await eventService.getEventById(id)).video_duration_seconds).toBeNull()
  })

  test('without an injected transport the network stays closed under test', async () => {
    await expect(videoDurationService.measureVideoDuration('https://otro-host.example/v.mp4')).rejects.toThrow(/disabled under NODE_ENV=test/)
  })
})

describe('videoPass timetable', () => {
  const start = Date.parse('2026-10-01T20:00:00.000Z')
  const base = { video_started_at: new Date(start).toISOString(), duration_minutes: 45 }

  test('the measured duration wins over duration_minutes', () => {
    expect(passEndsAt({ ...base, video_duration_seconds: 2076.64 })).toBe(start + 2076640)
    expect(chatClosesAt({ ...base, video_duration_seconds: 2076.64 })).toBe(start + 2076640 + CHAT_GRACE_MS)
  })

  test('without a measurement, duration_minutes', () => {
    expect(passEndsAt(base)).toBe(start + 45 * MIN)
  })

  test('closed exactly five minutes after the end, and not before', () => {
    const event = { ...base, video_duration_seconds: 600 }
    expect(isPassClosed(event, start + 10 * MIN + 5 * MIN - 1)).toBe(false)
    expect(isPassClosed(event, start + 10 * MIN + 5 * MIN)).toBe(true)
  })

  test('nothing before «Iniciar»', () => {
    expect(passEndsAt({ duration_minutes: 45 })).toBeNull()
    expect(isPassClosed({ duration_minutes: 45 })).toBe(false)
  })
})

describe('closing the pass on the server', () => {
  test('finishes the passes past their closing instant and tells every open page', async () => {
    const closed = await createVideoEvent({ status: 'active', startedAgoMs: 16 * MIN, durationSeconds: 600 })
    const running = await createVideoEvent({ status: 'active', startedAgoMs: 12 * MIN, durationSeconds: 600 })
    const broadcasts = []
    const eventSocket = { broadcastEventEnded: (id) => broadcasts.push(id) }

    const finished = await closeExpiredVideoPasses({ eventSocket })

    expect(finished).toContain(closed)
    expect(finished).not.toContain(running)
    expect(broadcasts).toContain(closed)
    const row = await eventService.getEventById(closed)
    expect(row.status).toBe('finished')
    expect(row.finished_at).toBeTruthy()
    expect((await eventService.getEventById(running)).status).toBe('active')
  })

  test('the public payload carries the closing timetable of a running pass', async () => {
    const id = await createVideoEvent({ status: 'active', startedAgoMs: 2 * MIN, durationSeconds: 600 })
    const { slug, video_started_at: startedAt } = await eventService.getEventById(id)

    const res = await request(app).get(`/api/events/${slug}`)

    const start = Date.parse(startedAt)
    expect(res.body.event.video_ends_at).toBe(new Date(start + 600 * 1000).toISOString())
    expect(res.body.event.chat_closes_at).toBe(new Date(start + 600 * 1000 + CHAT_GRACE_MS).toISOString())
  })

  test('/video-token refuses once the chat has closed, even before the scheduler runs', async () => {
    const id = await createVideoEvent({ status: 'scheduled', durationSeconds: 600 })
    const { attendee, accessToken } = await createVerifiedAttendee(id, {
      first_name: 'Tomás', last_name: 'Tarde', email: `tarde-${crypto.randomUUID().slice(0, 8)}@test.com`,
    })
    await db.execute({
      sql: "UPDATE events SET status = 'active', video_started_at = ? WHERE id = ?",
      args: [new Date(Date.now() - 16 * MIN).toISOString(), id],
    })

    const res = await request(app).post(`/api/events/${id}/video-token`).send({ attendeeId: attendee.id, accessToken })

    expect(res.statusCode).toBe(400)
    expect(res.body.title).toBe('EVENT_PASS_CLOSED')
  })
})
