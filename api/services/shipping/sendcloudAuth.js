const config = require('../../config/env')
const logger = require('../../config/logger')
const { ApiError } = require('../../middleware/errorHandler')

/**
 * Authentication for the Sendcloud API.
 *
 * Sendcloud accepts two methods with the same pair of credentials: OAuth2
 * `client_credentials` (the recommended one, still in beta) and HTTP Basic.
 * `SENDCLOUD_AUTH_MODE` selects between them — see `config.sendcloud.authMode`.
 *
 * The token lives in a module variable, per process. Sharing it across replicas
 * (database, Redis) was considered and rejected: the token endpoint is not
 * rate-limited in any way that matters and each replica asks for one per hour,
 * so shared state would only add a failure mode. Renewal is lazy with a 60 s
 * margin rather than scheduled, so it cannot silently stop happening if a cron
 * dies.
 *
 * The response carries no `refresh_token` (verified against the live account),
 * so "refreshing" is always asking for a whole new token.
 */

const TOKEN_URL = 'https://account.sendcloud.com/oauth2/token'
const TIMEOUT_MS = 10000

// Renew once fewer than this many milliseconds of validity remain, so a token
// cannot expire between the check and the request that uses it.
const RENEWAL_MARGIN_MS = 60 * 1000

// After a fallback to Basic Auth, stop attempting OAuth2 for this long. Without
// it every single call would pay for (and log) a failed token dance.
const SUPPRESSION_MS = 5 * 60 * 1000

// { accessToken, expiresAt } — expiresAt is an absolute epoch milliseconds.
let cached = null

// The single in-flight token request. N concurrent callers that all find the
// cache empty must produce ONE request to the token endpoint, not N.
let inFlight = null

// Epoch milliseconds until which OAuth2 is not attempted (see SUPPRESSION_MS).
let suppressedUntil = 0

function basicHeader() {
  const credentials = Buffer
    .from(`${config.sendcloud.apiKey}:${config.sendcloud.apiSecret}`)
    .toString('base64')
  return `Basic ${credentials}`
}

/**
 * True while OAuth2 is suppressed after a fallback to Basic Auth.
 */
function isSuppressed() {
  return Date.now() < suppressedUntil
}

/**
 * Start (or restart) the suppression window. Called by the API client when a
 * request had to be resolved with Basic Auth in `auto` mode.
 */
function suppressOauth2() {
  suppressedUntil = Date.now() + SUPPRESSION_MS
  cached = null
}

/**
 * Drop the cached token so the next call fetches a fresh one. Called on 401/403
 * before the single retry.
 */
function invalidate() {
  cached = null
}

async function requestToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'api',
  })

  let response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        // The token request itself is authenticated with Basic — that is how
        // client_credentials carries the client id and secret.
        'Authorization': basicHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new ApiError(504, 'Sendcloud no respondió a tiempo al solicitar el token', 'Timeout de Sendcloud')
    }
    throw new ApiError(502, 'No se pudo conectar con Sendcloud para autenticar', 'Error de conexión')
  }

  if (!response.ok) {
    // Deliberately not logging the response body: a failed token request can
    // echo back the credential that was sent.
    logger.error({ status: response.status }, 'Sendcloud OAuth2 token request failed')
    throw new ApiError(
      response.status >= 500 ? 502 : 401,
      `Sendcloud rechazó la solicitud de token (${response.status})`,
      'Error de autenticación de Sendcloud'
    )
  }

  const data = await response.json()
  if (!data?.access_token) {
    throw new ApiError(502, 'Sendcloud devolvió un token vacío', 'Error de autenticación de Sendcloud')
  }

  const expiresIn = Number(data.expires_in) || 3600

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

/**
 * Return a valid OAuth2 access token, fetching or renewing it as needed.
 */
async function getAccessToken() {
  if (cached && Date.now() < cached.expiresAt - RENEWAL_MARGIN_MS) {
    return cached.accessToken
  }

  if (inFlight) return inFlight

  inFlight = requestToken()
    .then((token) => {
      cached = token
      inFlight = null
      return token.accessToken
    })
    .catch((error) => {
      inFlight = null
      throw error
    })

  return inFlight
}

/**
 * Build the `Authorization` header for a Sendcloud API request.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceBasic] - Skip OAuth2 for this call (the API
 *   client sets it when resolving a request that already failed twice).
 * @returns {Promise<string>}
 */
async function getAuthHeader({ forceBasic = false } = {}) {
  const mode = config.sendcloud.authMode

  if (mode === 'basic' || forceBasic || isSuppressed()) {
    return basicHeader()
  }

  try {
    const token = await getAccessToken()
    return `Bearer ${token}`
  } catch (error) {
    // A token endpoint that rejects or cannot be reached is exactly the failure
    // `auto` exists to survive — and it never reaches the API, so the client's
    // 401/403 fallback would not see it. `oauth2` mode has opted out of the
    // safety net and gets the error.
    if (mode !== 'auto') throw error

    logger.warn(
      { status: error.status, err: error },
      'Sendcloud OAuth2 token could not be obtained, falling back to Basic Auth'
    )
    suppressOauth2()
    return basicHeader()
  }
}

/**
 * Test seam: forget the token, the in-flight request and the suppression window.
 */
function __reset() {
  cached = null
  inFlight = null
  suppressedUntil = 0
}

module.exports = {
  getAccessToken,
  getAuthHeader,
  invalidate,
  isSuppressed,
  suppressOauth2,
  __reset,
  TOKEN_URL,
  RENEWAL_MARGIN_MS,
  SUPPRESSION_MS,
}
