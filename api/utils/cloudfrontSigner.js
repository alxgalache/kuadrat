/**
 * CloudFront signed URLs for pre-recorded event videos
 * (change: event-video-cdn-delivery).
 *
 * The `eventos-video/*` behavior of the media distribution only serves a
 * request carrying a valid signature from a key in the `eventos-video` key
 * group. This module is the only place that produces one.
 *
 *   · Custom policy whose `Resource` is the EXACT object URL (no wildcard): a
 *     signature for one file never opens another.
 *   · RSA-SHA256, declared with `Hash-Algorithm=SHA256` (CloudFront defaults to
 *     SHA-1 when the parameter is absent).
 *   · Native `crypto`, no SDK: `@aws-sdk/cloudfront-signer` is not published at
 *     the version the rest of the SDK is pinned to, and mixing versions would
 *     duplicate `@smithy/*`. The format was checked byte for byte against
 *     `openssl dgst -sha256 -sign` — the command docs/eventos-video/03 uses to
 *     verify the AWS side before any code runs.
 *
 * Signing is local: it needs the private key and nothing else, no AWS
 * credentials and no network. That is what lets preproduction use it.
 */

const crypto = require('crypto');
const config = require('../config/env');

let testOverride = null;

function settings() {
  return testOverride || config.eventVideoCdn;
}

/** True when this environment can sign (all three EVENT_VIDEO_* variables set). */
function isConfigured() {
  return Boolean(settings().enabled);
}

/** The protected distribution origin (e.g. https://cdn.140d.art), or null. */
function configuredOrigin() {
  return settings().origin || null;
}

// CloudFront's URL-safe base64: + → -, = → _, / → ~
const cloudfrontBase64 = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

/**
 * @param {string} url      The object URL exactly as it will be requested.
 * @param {object} options
 * @param {Date|number} options.expiresAt  Expiry (Date or epoch milliseconds).
 * @returns {string} The URL with Policy, Signature, Key-Pair-Id and Hash-Algorithm.
 */
function signUrl(url, { expiresAt }) {
  const current = settings();
  if (!current.enabled) {
    throw new Error('CloudFront URL signing is not configured (EVENT_VIDEO_* variables)');
  }
  const expiresMs = expiresAt instanceof Date ? expiresAt.getTime() : Number(expiresAt);
  const policy = JSON.stringify({
    Statement: [{
      Resource: url,
      Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(expiresMs / 1000) } },
    }],
  });
  const signature = crypto.sign('sha256', Buffer.from(policy, 'utf8'), current.privateKey);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}Policy=${cloudfrontBase64(Buffer.from(policy, 'utf8'))}` +
    `&Signature=${cloudfrontBase64(signature)}` +
    `&Key-Pair-Id=${current.keyPairId}` +
    '&Hash-Algorithm=SHA256';
}

/**
 * Tests inject a throwaway key generated at runtime; `.env.test` carries no PEM.
 * @param {{origin: string, keyPairId: string, privateKey: crypto.KeyObject}|null} next
 */
function __configureForTests(next) {
  if (config.nodeEnv !== 'test') {
    throw new Error('__configureForTests is only available under NODE_ENV=test');
  }
  testOverride = next ? { enabled: true, ...next } : null;
}

module.exports = {
  signUrl,
  isConfigured,
  configuredOrigin,
  __configureForTests,
};
