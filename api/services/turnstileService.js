const logger = require('../config/logger');
const config = require('../config/env');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const REQUEST_TIMEOUT_MS = 5000;

class TurnstileNetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TurnstileNetworkError';
    if (cause) this.cause = cause;
  }
}

async function verify(token, remoteip) {
  const params = new URLSearchParams();
  params.set('secret', config.turnstile.secret);
  params.set('response', token);
  if (remoteip) params.set('remoteip', remoteip);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    logger.error({ err }, 'Turnstile siteverify network error');
    throw new TurnstileNetworkError('Turnstile siteverify unreachable', err);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logger.error({ status: response.status }, 'Turnstile siteverify non-2xx response');
    throw new TurnstileNetworkError(`Turnstile siteverify HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    logger.error({ err }, 'Turnstile siteverify malformed JSON');
    throw new TurnstileNetworkError('Turnstile siteverify returned invalid JSON', err);
  }

  const success = body?.success === true;
  const errorCodes = Array.isArray(body?.['error-codes']) ? body['error-codes'] : [];

  if (!success) {
    logger.warn({ remoteip, errorCodes }, 'Turnstile siteverify rejected token');
  }

  return { success, errorCodes };
}

module.exports = { verify, TurnstileNetworkError };
