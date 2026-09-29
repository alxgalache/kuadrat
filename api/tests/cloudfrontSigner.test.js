/**
 * CloudFront signed URLs for pre-recorded event videos
 * (openspec change: event-video-cdn-delivery).
 *
 * The signature is verified with the public half of a throwaway RSA pair
 * generated here — exactly what CloudFront does with the public key in the
 * `eventos-video` key group. `.env.test` carries no PEM on purpose, and
 * signing reaches no network.
 */

const crypto = require('crypto')
const signer = require('../utils/cloudfrontSigner')
const { resolveEventVideoCdn } = require('../config/env')

const ORIGIN = 'https://cdn.140d.art'
const KEY_PAIR_ID = 'KTESTKEYPAIR01'
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })

// CloudFront's URL-safe base64, reversed
const fromCloudfrontBase64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64')

function parseSigned(signed) {
  const url = new URL(signed)
  const policyJson = fromCloudfrontBase64(url.searchParams.get('Policy')).toString('utf8')
  return {
    url,
    policyJson,
    policy: JSON.parse(policyJson),
    signature: fromCloudfrontBase64(url.searchParams.get('Signature')),
  }
}

afterEach(() => signer.__configureForTests(null))

describe('signUrl', () => {
  beforeEach(() => signer.__configureForTests({ origin: ORIGIN, keyPairId: KEY_PAIR_ID, privateKey }))

  test('the signature verifies with the public key, over SHA-256', () => {
    const signed = signer.signUrl(`${ORIGIN}/eventos-video/lynda_blair/lynda_blair_h264.mp4`, { expiresAt: Date.now() + 60_000 })
    const { url, policyJson, signature } = parseSigned(signed)
    expect(url.searchParams.get('Hash-Algorithm')).toBe('SHA256')
    expect(url.searchParams.get('Key-Pair-Id')).toBe(KEY_PAIR_ID)
    expect(crypto.verify('sha256', Buffer.from(policyJson, 'utf8'), publicKey, signature)).toBe(true)
  })

  test('the policy grants exactly that one object, with no wildcard, until the requested second', () => {
    const target = `${ORIGIN}/eventos-video/lynda_blair/lynda_blair_h264.mp4`
    const expiresAt = new Date('2026-10-01T20:30:45.900Z')
    const { policy } = parseSigned(signer.signUrl(target, { expiresAt }))
    expect(policy.Statement).toHaveLength(1)
    expect(policy.Statement[0].Resource).toBe(target)
    expect(policy.Statement[0].Resource).not.toContain('*')
    expect(policy.Statement[0].Condition).toEqual({ DateLessThan: { 'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000) } })
  })

  test('the signed parameters use CloudFront URL-safe base64 only (no + = /)', () => {
    for (let i = 0; i < 20; i += 1) {
      const signed = signer.signUrl(`${ORIGIN}/eventos-video/v${i}.mp4`, { expiresAt: Date.now() + i * 1000 })
      const query = signed.split('?')[1]
      const policy = query.match(/Policy=([^&]+)/)[1]
      const signature = query.match(/Signature=([^&]+)/)[1]
      expect(policy).not.toMatch(/[+=/]/)
      expect(signature).not.toMatch(/[+=/]/)
    }
  })

  test('a URL with its own query string keeps it, inside the signed Resource too', () => {
    const target = `${ORIGIN}/eventos-video/v.mp4?v=2`
    const signed = signer.signUrl(target, { expiresAt: Date.now() + 60_000 })
    expect(signed.startsWith(`${target}&Policy=`)).toBe(true)
    expect(parseSigned(signed).policy.Statement[0].Resource).toBe(target)
  })

  test('refuses to sign when this environment has no signing key', () => {
    signer.__configureForTests(null)
    expect(signer.isConfigured()).toBe(false)
    expect(() => signer.signUrl(`${ORIGIN}/eventos-video/v.mp4`, { expiresAt: Date.now() })).toThrow(/not configured/)
  })
})

describe('resolveEventVideoCdn (EVENT_VIDEO_* startup validation)', () => {
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const valid = {
    EVENT_VIDEO_CDN_URL: ORIGIN,
    EVENT_VIDEO_CF_KEY_PAIR_ID: KEY_PAIR_ID,
    EVENT_VIDEO_CF_PRIVATE_KEY_B64: Buffer.from(pem).toString('base64'),
  }

  test('none of the three → signing disabled, not an error', () => {
    expect(resolveEventVideoCdn({})).toEqual({ enabled: false, origin: null, keyPairId: null, privateKey: null })
  })

  test('all three → enabled, with the origin normalised', () => {
    const cfg = resolveEventVideoCdn({ ...valid, EVENT_VIDEO_CDN_URL: `${ORIGIN}/` })
    expect(cfg.enabled).toBe(true)
    expect(cfg.origin).toBe(ORIGIN)
    expect(cfg.keyPairId).toBe(KEY_PAIR_ID)
    expect(cfg.privateKey.asymmetricKeyType).toBe('rsa')
  })

  test('a partial configuration fails and names what is missing', () => {
    expect(() => resolveEventVideoCdn({ EVENT_VIDEO_CF_KEY_PAIR_ID: KEY_PAIR_ID }))
      .toThrow(/partially configured.*EVENT_VIDEO_CDN_URL, EVENT_VIDEO_CF_PRIVATE_KEY_B64/)
  })

  test.each([
    ['http origin', 'http://cdn.140d.art'],
    ['origin with a path', 'https://cdn.140d.art/eventos-video'],
    ['not a URL', 'cdn.140d.art'],
  ])('rejects EVENT_VIDEO_CDN_URL: %s', (_label, url) => {
    expect(() => resolveEventVideoCdn({ ...valid, EVENT_VIDEO_CDN_URL: url })).toThrow(/EVENT_VIDEO_CDN_URL/)
  })

  test('rejects a key ID with spaces or quotes pasted in', () => {
    expect(() => resolveEventVideoCdn({ ...valid, EVENT_VIDEO_CF_KEY_PAIR_ID: '"K123 456"' })).toThrow(/KEY_PAIR_ID/)
  })

  test('rejects a truncated base64 key', () => {
    expect(() => resolveEventVideoCdn({ ...valid, EVENT_VIDEO_CF_PRIVATE_KEY_B64: valid.EVENT_VIDEO_CF_PRIVATE_KEY_B64.slice(0, 200) }))
      .toThrow(/not a base64-encoded PEM private key/)
  })

  test('rejects a non-RSA key (CloudFront would accept ECDSA; this project supports one kind)', () => {
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' })
    expect(() => resolveEventVideoCdn({ ...valid, EVENT_VIDEO_CF_PRIVATE_KEY_B64: Buffer.from(ec).toString('base64') }))
      .toThrow(/must be an RSA key/)
  })
})
