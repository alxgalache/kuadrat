const { createHash, randomBytes, randomInt, timingSafeEqual } = require('crypto');

/**
 * Shared primitives for the three email-ownership proofs: event attendees,
 * draw participants and auction buyers (enforce-verification-gates).
 *
 * They lived as three private copies, each drawing codes and passwords from
 * Math.random — a PRNG whose state can be recovered from its outputs, and
 * anyone can collect outputs by registering with their own inbox. One module
 * so the three flows cannot drift apart again.
 *
 * Attempt caps deliberately stay per flow (draws 3, auctions 5, events 5):
 * the first two are specified behaviour the change did not set out to alter.
 */

/** A verification code lives 10 minutes, in the three flows. */
const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Minimum gap between two sends for the same attendee, or the same email in
 * the same draw/auction. Mirrors the 30 s the modals already wait before
 * showing «Reenviar código» — enforced here too, because the modal is not
 * the only possible caller and every send is an email we pay for.
 */
const OTP_RESEND_COOLDOWN_SECONDS = 30;

/**
 * How long a draw/auction verificationToken stays usable. Longer than the
 * code's 10 minutes on purpose: the code is verified in the PERSONAL step and
 * register-buyer only fires after the delivery and invoicing forms.
 */
const VERIFICATION_TOKEN_TTL_MINUTES = 60;

/** Failed guesses allowed against one event verification code. */
const EVENT_OTP_MAX_ATTEMPTS = 5;

const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 6;

/** Six digits, 100000–999999 — the format every modal already expects. */
function generateOtpCode() {
  return String(randomInt(100000, 1000000));
}

/**
 * The event access password and the auction bid password: 6 characters from
 * an alphabet without the ambiguous 0/O/1/I/L, as specified for both.
 */
function generateAccessPassword() {
  let password = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += PASSWORD_ALPHABET.charAt(randomInt(PASSWORD_ALPHABET.length));
  }
  return password;
}

/** 32 bytes of CSPRNG output, hex. Access tokens and verification tokens. */
function generateOpaqueToken() {
  return randomBytes(32).toString('hex');
}

/**
 * What gets stored for a token or a code. SHA-256 and not bcrypt: the input
 * is either 256 bits of entropy or dies in 10 minutes, so there is nothing a
 * derivation cost would protect. Same algorithm as access_token_hash.
 */
function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Constant-time string comparison. Returns false instead of throwing when
 * the lengths differ — timingSafeEqual throws on unequal buffers, and a
 * 5-character guess is an ordinary wrong answer, not an exception.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * The one spelling of an email this API stores and compares. Every entry
 * point normalises before reading or writing, so `Ana@Ejemplo.com` and
 * `ana@ejemplo.com` resolve the same row.
 */
function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

module.exports = {
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  VERIFICATION_TOKEN_TTL_MINUTES,
  EVENT_OTP_MAX_ATTEMPTS,
  generateOtpCode,
  generateAccessPassword,
  generateOpaqueToken,
  sha256,
  safeEqual,
  normalizeEmail,
};
