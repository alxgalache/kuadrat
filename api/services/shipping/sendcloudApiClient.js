const logger = require('../../config/logger')
const config = require('../../config/env')
const sendcloudAuth = require('./sendcloudAuth')
const { ApiError } = require('../../middleware/errorHandler')

const SENDCLOUD_BASE_URL = 'https://panel.sendcloud.sc/api'
const SENDCLOUD_SERVICE_POINTS_URL = 'https://servicepoints.sendcloud.sc/api'
const TIMEOUT_MS = 10000

/**
 * Low-level HTTP client for the Sendcloud API.
 * Handles authentication, request formatting, timeouts, and error logging.
 *
 * Nothing here ever logs the `Authorization` header, the API secret or the
 * access token: this file used to emit a ready-to-paste cURL command at
 * `logger.info` on every request, credential included, in production too.
 */

/**
 * Issue a request with the configured authentication, retrying once on an
 * authentication failure and — in `auto` mode — resolving through Basic Auth if
 * OAuth2 still fails after that retry.
 *
 * The caller passes fully-built options WITHOUT `Authorization` and WITHOUT
 * `signal`: both are added per attempt (a consumed AbortSignal.timeout cannot be
 * reused). The serialized body, in contrast, is built once by the caller and
 * reused verbatim, so the retry cannot diverge from the first attempt.
 *
 * @returns {Promise<{ response: Response, errorText: string|null }>} `errorText`
 *   is the raw body, already read, when the response is not ok — the body of a
 *   Response can only be consumed once and the retry decision needs it.
 */
async function authorizedFetch(url, baseOptions) {
  const mode = config.sendcloud.authMode
  let forceBasic = false
  let retried = false

  for (;;) {
    const authorization = await sendcloudAuth.getAuthHeader({ forceBasic })
    const usedOauth = authorization.startsWith('Bearer ')

    const response = await fetch(url, {
      ...baseOptions,
      headers: { ...baseOptions.headers, 'Authorization': authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.ok) return { response, errorText: null }

    const errorText = await response.text()

    // Only 401/403 are credential problems. A 429 or a 5xx is not, so it must
    // not discard a perfectly good token nor switch authentication method —
    // neither would make the call succeed, and both would hide the real cause.
    const isAuthFailure = response.status === 401 || response.status === 403

    if (isAuthFailure && usedOauth) {
      if (!retried) {
        retried = true
        sendcloudAuth.invalidate()
        continue
      }

      if (mode === 'auto') {
        logger.warn(
          { url, status: response.status, errorBody: errorText },
          'Sendcloud OAuth2 rejected after retry, falling back to Basic Auth'
        )
        sendcloudAuth.suppressOauth2()
        forceBasic = true
        continue
      }
    }

    return { response, errorText }
  }
}

function parseErrorBody(errorText) {
  if (!errorText) return null
  try {
    return JSON.parse(errorText)
  } catch {
    return errorText
  }
}

async function request(method, path, { body, params, version = 'v3', baseUrl } = {}) {
  const base = baseUrl || SENDCLOUD_BASE_URL
  const url = new URL(`${base}/${version}/${path}`)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }

  // Serialized once and reused across the retry, so both attempts send exactly
  // the same bytes.
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body)
  }

  const startTime = Date.now()

  try {
    logger.debug({ method, url: url.toString() }, 'Sendcloud API request')

    const { response, errorText } = await authorizedFetch(url.toString(), options)
    const duration = Date.now() - startTime

    if (!response.ok) {
      const errorBody = parseErrorBody(errorText)

      logger.error({
        method,
        url: url.toString(),
        status: response.status,
        duration,
        errorBody,
      }, 'Sendcloud API error response')

      const message = errorBody?.error?.message || errorBody?.message || `Sendcloud API error: ${response.status}`
      throw new ApiError(response.status >= 500 ? 502 : response.status, message, 'Error de Sendcloud')
    }

    const data = await response.json()

    logger.debug({
      method,
      url: url.toString(),
      status: response.status,
      duration,
    }, 'Sendcloud API response')

    return data
  } catch (error) {
    if (error instanceof ApiError) throw error

    const duration = Date.now() - startTime

    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      logger.error({ method, url: url.toString(), duration }, 'Sendcloud API timeout')
      throw new ApiError(504, 'Sendcloud API no respondió a tiempo', 'Timeout de Sendcloud')
    }

    logger.error({ method, url: url.toString(), duration, err: error }, 'Sendcloud API network error')
    throw new ApiError(502, 'No se pudo conectar con Sendcloud', 'Error de conexión')
  }
}

/**
 * Fetch a binary resource (e.g. PDF label) from the Sendcloud API.
 * Returns a Buffer on success or null on error.
 */
async function getBinary(path, { params, version = 'v3', accept = 'application/pdf' } = {}) {
  const url = new URL(`${SENDCLOUD_BASE_URL}/${version}/${path}`)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const options = {
    method: 'GET',
    headers: {
      'Accept': accept,
    },
  }

  const startTime = Date.now()

  try {
    logger.debug({ url: url.toString(), accept }, 'Sendcloud API binary request')

    // Same authentication path as request(): a label download is as likely to
    // meet an expired token as any other call.
    const { response } = await authorizedFetch(url.toString(), options)
    const duration = Date.now() - startTime

    if (!response.ok) {
      logger.error({
        url: url.toString(),
        status: response.status,
        duration,
      }, 'Sendcloud API binary request error')
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    logger.debug({
      url: url.toString(),
      status: response.status,
      duration,
      bytes: buffer.length,
    }, 'Sendcloud API binary response')

    return buffer
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error({ url: url.toString(), duration, err: error }, 'Sendcloud API binary request failed')
    return null
  }
}

// Convenience methods
const get = (path, options) => request('GET', path, options)
const post = (path, options) => request('POST', path, options)
const put = (path, options) => request('PUT', path, options)
const del = (path, options) => request('DELETE', path, options)

module.exports = { get, post, put, del, request, getBinary }
