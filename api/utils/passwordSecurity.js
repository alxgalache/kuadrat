const { createHash, randomBytes } = require('crypto');

/**
 * Shared primitives for the admin-initiated password reset and for the
 * session invalidation that rides along with every password change.
 *
 * Lives in utils/ rather than inside a controller because three unrelated
 * modules need the exact same behaviour and any divergence between them is
 * silent: `config/passport.js` (session invalidation), `controllers/
 * authController.js` (consuming a reset link) and `routes/admin/
 * authorRoutes.js` (issuing one).
 */

/** Reset links live for 24h — shorter than the 48h of an invitation, because
 *  the account being reset is already live in production. */
const RESET_TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Generate the plaintext reset token. 32 bytes of CSPRNG output: only ever
 * travels inside the email body, never into a response or a log line.
 */
function generateResetToken() {
  return randomBytes(32).toString('hex');
}

/**
 * What actually gets stored. SHA-256 and not bcrypt on purpose: the token is
 * already 256 bits of cryptographic entropy, so there is no dictionary to
 * attack and no need to pay a derivation cost. Same reasoning — and same
 * algorithm — as `event_attendees.access_token_hash`.
 */
function hashResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Format an instant the way SQLite's CURRENT_TIMESTAMP does: 'YYYY-MM-DD
 * HH:MM:SS' in UTC.
 *
 * Writing `new Date().toISOString()` instead would look equivalent and
 * compare wrong: on the same calendar day '2026-08-16T10:00:00.000Z' sorts
 * ABOVE '2026-08-16 12:00:00' because 'T' (0x54) outranks ' ' (0x20), so an
 * expired token would read as still valid.
 */
function sqlUtcTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** The instant a reset link issued now stops working. */
function resetTokenExpiry(now = Date.now()) {
  return sqlUtcTimestamp(new Date(now + RESET_TOKEN_EXPIRATION_MS));
}

/**
 * Parse a datetime as written by SQLite, which stores CURRENT_TIMESTAMP in
 * UTC *without* a zone marker. `new Date('2026-08-16 10:00:00')` in Node
 * reads that as LOCAL time — two hours off in a container running
 * TZ=Europe/Madrid, which is enough to invalidate the wrong sessions.
 *
 * @returns {Date|null} null when the value is absent or unparseable.
 */
function parseSqlUtcDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  // Values that already carry a zone (trailing Z or ±HH:MM) are unambiguous.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const isoish = raw.replace(' ', 'T');
  const date = new Date(hasZone ? isoish : `${isoish}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether a JWT must be rejected because it predates the user's last password
 * change.
 *
 * Compared in whole seconds, since `iat` is expressed in seconds. The
 * comparison is strict so a sign-in landing in the same second as the change
 * survives — otherwise resetting your password and immediately logging in
 * would hand you a token the very next request throws away.
 *
 * A NULL `passwordChangedAt` invalidates nothing: that is what lets this ship
 * without signing out every existing session.
 */
function isJwtIssuedBeforePasswordChange(iat, passwordChangedAt) {
  const changedAt = parseSqlUtcDate(passwordChangedAt);
  if (!changedAt) return false;

  // The column is set but the token cannot say when it was issued, so it
  // cannot prove it came after the change.
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return true;

  return iat < Math.floor(changedAt.getTime() / 1000);
}

module.exports = {
  RESET_TOKEN_EXPIRATION_MS,
  generateResetToken,
  hashResetToken,
  sqlUtcTimestamp,
  resetTokenExpiry,
  parseSqlUtcDate,
  isJwtIssuedBeforePasswordChange,
};
