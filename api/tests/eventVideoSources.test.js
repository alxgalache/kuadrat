/**
 * Classification, validation and signed-URL lifetime of the video sources of a
 * pre-recorded event (openspec change: event-video-cdn-delivery).
 *
 * The /eventos-video/ prefix on the configured CDN origin is the protection
 * marker: it is what the CloudFront behavior protects, so a URL outside it on
 * the same origin would be public, and a URL inside it on a server that cannot
 * sign would fail in front of the audience. Pure — no database, no network.
 */

const crypto = require('crypto')
const signer = require('../utils/cloudfrontSigner')
const {
  classifyVideoUrl,
  validateVideoUrls,
  videoTokenExpiry,
} = require('../utils/eventVideoSources')

const ORIGIN = 'https://cdn.140d.art'
const MP4 = `${ORIGIN}/eventos-video/lynda_blair/lynda_blair_h264.mp4`
const AV1 = `${ORIGIN}/eventos-video/lynda_blair/lynda_blair_av1.mp4`
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })

const withSigning = () => signer.__configureForTests({ origin: ORIGIN, keyPairId: 'KTESTKEYPAIR01', privateKey })
const withoutSigning = () => signer.__configureForTests(null)

afterEach(withoutSigning)

describe('classifyVideoUrl', () => {
  test.each([
    [MP4, 'protected'],
    [`${ORIGIN}/stories/v.mp4`, 'external'],
    ['https://otro-host.example/eventos-video/v.mp4', 'external'],
    ['https://otro-host.example/v.mp4', 'external'],
    ['uploaded:event-123.mp4', 'uploaded'],
    ['http://cdn.140d.art/eventos-video/v.mp4', 'invalid'],
    ['no es una url', 'invalid'],
    ['', null],
    [null, null],
  ])('with signing configured: %s → %s', (value, expected) => {
    withSigning()
    expect(classifyVideoUrl(value)).toBe(expected)
  })

  test('without signing, any /eventos-video/ path reads as protected — never handed out unsigned', () => {
    withoutSigning()
    expect(classifyVideoUrl(MP4)).toBe('protected')
    expect(classifyVideoUrl('https://otro-host.example/eventos-video/v.mp4')).toBe('protected')
    expect(classifyVideoUrl(`${ORIGIN}/stories/v.mp4`)).toBe('external')
  })
})

describe('validateVideoUrls', () => {
  test('both protected URLs on a server that can sign → accepted', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url: MP4, video_url_av1: AV1 })).toBeNull()
  })

  test('a CDN URL outside /eventos-video/ → EVENT_VIDEO_URL_UNPROTECTED', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url: `${ORIGIN}/stories/concierto.mp4` }).code).toBe('EVENT_VIDEO_URL_UNPROTECTED')
  })

  test('an /eventos-video/ URL on a server without signing → EVENT_VIDEO_SIGNING_UNAVAILABLE', () => {
    withoutSigning()
    expect(validateVideoUrls({}, { video_url: MP4 }).code).toBe('EVENT_VIDEO_SIGNING_UNAVAILABLE')
  })

  test('a non-https URL → EVENT_VIDEO_URL_INVALID', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url: 'http://otro-host.example/v.mp4' }).code).toBe('EVENT_VIDEO_URL_INVALID')
  })

  test('AV1 without MP4 → EVENT_VIDEO_AV1_REQUIRES_MP4, also when the MP4 is cleared on update', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url_av1: AV1 }).code).toBe('EVENT_VIDEO_AV1_REQUIRES_MP4')
    expect(validateVideoUrls({ video_url: MP4, video_url_av1: AV1 }, { video_url: null }).code).toBe('EVENT_VIDEO_AV1_REQUIRES_MP4')
  })

  test('an uploaded file in the AV1 field, or AV1 next to an uploaded MP4 → rejected', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url: MP4, video_url_av1: 'uploaded:event-1.mp4' }).code).toBe('EVENT_VIDEO_URL_INVALID')
    expect(validateVideoUrls({ video_url: 'uploaded:event-1.mp4' }, { video_url_av1: AV1 }).code).toBe('EVENT_VIDEO_AV1_REQUIRES_MP4')
  })

  test('a request cannot point video_url at an uploaded file by name', () => {
    withSigning()
    expect(validateVideoUrls({}, { video_url: 'uploaded:otro.mp4' }).code).toBe('EVENT_VIDEO_URL_INVALID')
  })

  test('an unchanged value is not validated: old events stay editable', () => {
    withSigning()
    const legacy = { video_url: 'http://ejemplo.com/v.mp4' }
    expect(validateVideoUrls(legacy, { title: 'Nuevo título', video_url: 'http://ejemplo.com/v.mp4' })).toBeNull()
    const uploaded = { video_url: 'uploaded:event-1.mp4' }
    expect(validateVideoUrls(uploaded, { video_url: 'uploaded:event-1.mp4' })).toBeNull()
  })

  test('absent fields are left alone', () => {
    withoutSigning()
    expect(validateVideoUrls({ video_url: MP4 }, { title: 'x' })).toBeNull()
  })
})

describe('videoTokenExpiry', () => {
  const MIN = 60 * 1000
  const start = Date.parse('2026-10-01T20:00:00.000Z')

  test('mid-pass: the planned end of the pass plus 30 minutes', () => {
    const now = start + 10 * MIN
    const event = { video_started_at: new Date(start).toISOString(), duration_minutes: 40 }
    expect(videoTokenExpiry(event, now)).toBe(start + 70 * MIN)
  })

  test('after the planned end, while still active: now plus 15 minutes', () => {
    const now = start + 80 * MIN
    const event = { video_started_at: new Date(start).toISOString(), duration_minutes: 40 }
    expect(videoTokenExpiry(event, now)).toBe(now + 15 * MIN)
  })

  test('never longer than 6 hours', () => {
    const now = start
    const event = { video_started_at: new Date(start).toISOString(), duration_minutes: 900 }
    expect(videoTokenExpiry(event, now)).toBe(now + 6 * 60 * MIN)
  })

  test('reads a zone-less SQLite timestamp as UTC', () => {
    const now = start + 10 * MIN
    const event = { video_started_at: '2026-10-01 20:00:00', duration_minutes: 40 }
    expect(videoTokenExpiry(event, now)).toBe(start + 70 * MIN)
  })
})
