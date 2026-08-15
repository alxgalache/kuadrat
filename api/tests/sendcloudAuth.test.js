/**
 * Tests for Sendcloud authentication
 * (openspec change: sendcloud-art-shipping-calculator, block 1).
 *
 * The retry-and-degrade dance is the kind of code that only runs when something
 * is already wrong, so it is exactly the code that is never exercised by hand.
 * `fetch` is stubbed, so nothing here reaches the network — including the token
 * endpoint.
 *
 * One assertion is a security property rather than a behaviour: no log record,
 * at any level, may contain the Authorization header, the API secret or the
 * access token. This file used to emit a ready-to-paste cURL with the
 * credential in it, at `logger.info`, on every single request.
 */

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}))

const config = require('../config/env')
const logger = require('../config/logger')
const sendcloudAuth = require('../services/shipping/sendcloudAuth')
const sendcloudApiClient = require('../services/shipping/sendcloudApiClient')

const API_KEY = 'test-client-id'
const API_SECRET = 'test-client-secret'
const TOKEN = 'access-token-abc123'

const realFetch = global.fetch

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

// A stub that answers the token endpoint with a token and every other URL with
// whatever the test queued.
function stubFetch(apiResponses, { tokenStatus = 200, expiresIn = 3599 } = {}) {
  const calls = { token: [], api: [] }
  const queue = [...apiResponses]

  global.fetch = jest.fn(async (url, options) => {
    if (String(url).includes('/oauth2/token')) {
      calls.token.push({ url: String(url), options })
      return tokenStatus === 200
        ? jsonResponse({ access_token: TOKEN, expires_in: expiresIn, scope: 'api' })
        : jsonResponse({ error: 'invalid_client' }, tokenStatus)
    }
    calls.api.push({ url: String(url), options })
    const next = queue.shift()
    if (!next) throw new Error(`Unexpected extra API call to ${url}`)
    return next
  })

  return calls
}

const authHeaderOf = (call) => call.options.headers.Authorization

let originalMode

beforeAll(() => {
  originalMode = config.sendcloud.authMode
  config.sendcloud.apiKey = API_KEY
  config.sendcloud.apiSecret = API_SECRET
})

afterAll(() => {
  config.sendcloud.authMode = originalMode
  global.fetch = realFetch
})

beforeEach(() => {
  sendcloudAuth.__reset()
  config.sendcloud.authMode = 'auto'
  jest.clearAllMocks()
})

describe('OAuth2 token lifecycle', () => {
  it('sends client_credentials with scope api, authenticated by Basic', async () => {
    const calls = stubFetch([jsonResponse({ data: [] })])

    await sendcloudApiClient.get('shipping-options')

    expect(calls.token).toHaveLength(1)
    const tokenCall = calls.token[0]
    expect(tokenCall.url).toBe('https://account.sendcloud.com/oauth2/token')
    expect(tokenCall.options.body).toBe('grant_type=client_credentials&scope=api')
    expect(tokenCall.options.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(authHeaderOf(tokenCall)).toBe(
      `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`
    )

    expect(authHeaderOf(calls.api[0])).toBe(`Bearer ${TOKEN}`)
  })

  it('reuses a cached token across calls', async () => {
    const calls = stubFetch([jsonResponse({ data: [] }), jsonResponse({ data: [] })])

    await sendcloudApiClient.get('shipping-options')
    await sendcloudApiClient.get('shipping-options')

    expect(calls.token).toHaveLength(1)
    expect(calls.api).toHaveLength(2)
  })

  it('renews once fewer than 60 seconds of validity remain', async () => {
    // 30 s of life: already inside the renewal margin, so it is never reused.
    const calls = stubFetch([jsonResponse({ data: [] }), jsonResponse({ data: [] })], {
      expiresIn: 30,
    })

    await sendcloudApiClient.get('shipping-options')
    await sendcloudApiClient.get('shipping-options')

    expect(calls.token).toHaveLength(2)
  })

  it('collapses concurrent callers onto a single token request', async () => {
    const calls = stubFetch([
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
    ])

    await Promise.all([
      sendcloudApiClient.get('shipping-options'),
      sendcloudApiClient.get('shipping-options'),
      sendcloudApiClient.get('shipping-options'),
      sendcloudApiClient.get('shipping-options'),
    ])

    expect(calls.token).toHaveLength(1)
    expect(calls.api).toHaveLength(4)
  })
})

describe('retry and degradation', () => {
  it('discards the token and retries exactly once with the identical body', async () => {
    const calls = stubFetch([
      jsonResponse({ error: { message: 'expired' } }, 401),
      jsonResponse({ data: { id: 'ship_1' } }),
    ])

    await sendcloudApiClient.post('shipments', { body: { order_number: '1000' } })

    expect(calls.api).toHaveLength(2)
    expect(calls.token).toHaveLength(2) // the first token was invalidated
    // Byte-for-byte the same body on both attempts: it is serialized once.
    expect(calls.api[0].options.body).toBe(calls.api[1].options.body)
    expect(calls.api[1].options.body).toBe('{"order_number":"1000"}')
  })

  it('falls back to Basic in auto mode after the retry also fails', async () => {
    const calls = stubFetch([
      jsonResponse({ error: { message: 'nope' } }, 401),
      jsonResponse({ error: { message: 'nope' } }, 401),
      jsonResponse({ data: [] }),
    ])

    await sendcloudApiClient.get('shipping-options')

    expect(calls.api).toHaveLength(3)
    expect(authHeaderOf(calls.api[0])).toMatch(/^Bearer /)
    expect(authHeaderOf(calls.api[1])).toMatch(/^Bearer /)
    expect(authHeaderOf(calls.api[2])).toMatch(/^Basic /)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('suppresses further OAuth2 attempts for five minutes after a fallback', async () => {
    const calls = stubFetch([
      jsonResponse({}, 403),
      jsonResponse({}, 403),
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
    ])

    await sendcloudApiClient.get('shipping-options')
    expect(sendcloudAuth.isSuppressed()).toBe(true)

    const tokenCallsBefore = calls.token.length
    await sendcloudApiClient.get('shipping-options')

    // The next call goes straight to Basic: no token dance, no second warning.
    expect(calls.token).toHaveLength(tokenCallsBefore)
    expect(authHeaderOf(calls.api[3])).toMatch(/^Basic /)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('does not fall back in oauth2 mode, it throws', async () => {
    config.sendcloud.authMode = 'oauth2'
    const calls = stubFetch([jsonResponse({}, 401), jsonResponse({}, 401)])

    await expect(sendcloudApiClient.get('shipping-options')).rejects.toMatchObject({
      statusCode: 401,
    })

    expect(calls.api).toHaveLength(2) // one attempt plus the single retry
    expect(calls.api.every(c => authHeaderOf(c).startsWith('Bearer '))).toBe(true)
    expect(sendcloudAuth.isSuppressed()).toBe(false)
  })

  it('never contacts the token endpoint in basic mode', async () => {
    config.sendcloud.authMode = 'basic'
    const calls = stubFetch([jsonResponse({ data: [] })])

    await sendcloudApiClient.get('shipping-options')

    expect(calls.token).toHaveLength(0)
    expect(authHeaderOf(calls.api[0])).toMatch(/^Basic /)
  })

  it.each([[429], [500], [503]])(
    'does not retry, discard the token or fall back on HTTP %i',
    async (status) => {
      const calls = stubFetch([jsonResponse({ message: 'later' }, status)])

      await expect(sendcloudApiClient.get('shipping-options')).rejects.toBeDefined()

      expect(calls.api).toHaveLength(1)
      expect(calls.token).toHaveLength(1)
      expect(sendcloudAuth.isSuppressed()).toBe(false)
      // The token survives: the next call reuses it without asking for a new one.
      expect(await sendcloudAuth.getAccessToken()).toBe(TOKEN)
      expect(calls.token).toHaveLength(1)
    }
  )

  it('degrades to Basic in auto mode when the token endpoint itself rejects', async () => {
    // The API never sees a 401 in this case, so the request-level fallback
    // would never fire — and `auto` would be broken with no way back.
    const calls = stubFetch([jsonResponse({ data: [] })], { tokenStatus: 401 })

    await sendcloudApiClient.get('shipping-options')

    expect(authHeaderOf(calls.api[0])).toMatch(/^Basic /)
    expect(sendcloudAuth.isSuppressed()).toBe(true)
  })
})

describe('credentials never reach the logs', () => {
  it('logs nothing containing the header, the secret or the token', async () => {
    stubFetch([jsonResponse({}, 401), jsonResponse({}, 401), jsonResponse({ data: [] })])

    await sendcloudApiClient.get('shipping-options')

    const everythingLogged = ['info', 'warn', 'error', 'debug', 'fatal']
      .flatMap(level => logger[level].mock.calls)
      .map(args => JSON.stringify(args))
      .join('\n')

    const basicCredential = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')

    expect(everythingLogged).not.toContain(API_SECRET)
    expect(everythingLogged).not.toContain(TOKEN)
    expect(everythingLogged).not.toContain(basicCredential)
    // No header VALUE either. The words "Basic Auth" do appear, in the prose of
    // the fallback warning; what must never appear is a credential after them.
    expect(everythingLogged).not.toMatch(/Bearer\s+\S/)
    expect(everythingLogged).not.toMatch(/Basic\s+[A-Za-z0-9+/=]{8,}/)
    expect(everythingLogged).not.toContain('Authorization')
  })
})
