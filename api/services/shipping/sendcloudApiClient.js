const logger = require('../../config/logger')
const config = require('../../config/env')
const { ApiError } = require('../../middleware/errorHandler')

const SENDCLOUD_BASE_URL = 'https://panel.sendcloud.sc/api'
const SENDCLOUD_SERVICE_POINTS_URL = 'https://servicepoints.sendcloud.sc/api'
const TIMEOUT_MS = 10000

/**
 * Low-level HTTP client for the Sendcloud API.
 * Handles Basic Auth, request formatting, timeouts, and error logging.
 */

function getAuthHeader() {
  const credentials = Buffer.from(`${config.sendcloud.apiKey}:${config.sendcloud.apiSecret}`).toString('base64')
  return `Basic ${credentials}`
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
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body)
  }

  const startTime = Date.now()

  try {
    logger.debug({ method, url: url.toString() }, 'Sendcloud API request')

    // TODO: Remove after debugging - curl command for Postman import
    const curlParts = [`curl -X ${method} '${url.toString()}'`]
    for (const [h, v] of Object.entries(options.headers)) {
      curlParts.push(`-H '${h}: ${v}'`)
    }
    if (options.body) {
      curlParts.push(`-d '${options.body}'`)
    }
    logger.info(curlParts.join(' \\\n  '), 'Sendcloud cURL (Postman-ready)')

    const response = await fetch(url.toString(), options)
    const duration = Date.now() - startTime

    if (!response.ok) {
      let errorBody
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text()
      }

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
      'Authorization': getAuthHeader(),
      'Accept': accept,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }

  const startTime = Date.now()

  try {
    logger.debug({ url: url.toString(), accept }, 'Sendcloud API binary request')

    const response = await fetch(url.toString(), options)
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
