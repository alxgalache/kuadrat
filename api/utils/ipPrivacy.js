/**
 * Privacy-preserving IP fingerprinting for verification_events.
 *
 * We hash incoming IPs with HMAC-SHA256(IP_HASH_SALT, ip) and store only the
 * truncated hex digest. This lets us detect abuse patterns (e.g. enumeration
 * attempts from the same source) without keeping personally identifiable
 * data in the audit log. Rotating IP_HASH_SALT breaks cross-period
 * correlation, which is desirable for periodic privacy refreshes.
 */

const crypto = require('node:crypto');
const config = require('../config/env');

const HASH_LENGTH = 32; // characters of truncated hex digest

/**
 * @param {string|null|undefined} ip
 * @returns {string|null} truncated hex hash, or null when input is empty
 */
function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHmac('sha256', config.ipHashSalt)
    .update(ip)
    .digest('hex')
    .slice(0, HASH_LENGTH);
}

module.exports = { hashIp };
