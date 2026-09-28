const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const emailOtp = require('../utils/emailOtp');

/**
 * Email-ownership proof for draw participants and auction buyers
 * (enforce-verification-gates).
 *
 * The two flows kept one private copy each of the same code, and in both the
 * `verified` flag was written and never read: register-buyer accepted any
 * email, and for an email that already had a buyer it handed back that
 * buyer's id — and, in auctions, their bid password. Placing a bid only needs
 * the id, so that was a bid charged to somebody else's saved card.
 *
 * The fix is not "check that SOME verification exists for this email": the
 * verification the victim completed yesterday would then serve the attacker
 * today. The proof has to travel with whoever obtained it, so verify-email
 * returns an opaque token and register-buyer demands it back.
 *
 * `table` and `scopeColumn` are interpolated into SQL. They come only from
 * the two constant configurations in drawService and auctionService, never
 * from a request.
 *
 * @param {object} options
 * @param {string} options.table - draw_email_verifications | auction_email_verifications
 * @param {string} options.scopeColumn - draw_id | auction_id
 * @param {number} options.maxAttempts - failed guesses allowed per code
 */
function createBuyerEmailVerification({ table, scopeColumn, maxAttempts }) {
  /**
   * Send-side half. Refuses inside the resend cooldown — the previous code is
   * still valid then, so nothing is lost — and otherwise replaces any earlier
   * code AND verification token for this email in this draw/auction.
   *
   * @returns {Promise<{ code: string } | { tooSoon: true }>}
   */
  async function createEmailVerification(email, scopeId, ipAddress = null) {
    const normalized = emailOtp.normalizeEmail(email);

    // Compared in SQL: created_at is CURRENT_TIMESTAMP (UTC, no zone marker)
    // and parsing it in Node would read it as local time.
    const recent = await db.execute({
      sql: `SELECT 1 FROM ${table}
            WHERE email = ? AND ${scopeColumn} = ?
              AND datetime(created_at) > datetime('now', ?)
            LIMIT 1`,
      args: [normalized, scopeId, `-${emailOtp.OTP_RESEND_COOLDOWN_SECONDS} seconds`],
    });
    if (recent.rows.length > 0) return { tooSoon: true };

    await db.execute({
      sql: `DELETE FROM ${table} WHERE email = ? AND ${scopeColumn} = ?`,
      args: [normalized, scopeId],
    });

    const code = emailOtp.generateOtpCode();
    const expiresAt = new Date(Date.now() + emailOtp.OTP_TTL_MS).toISOString();

    await db.execute({
      sql: `INSERT INTO ${table} (id, email, ${scopeColumn}, code, expires_at, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), normalized, scopeId, code, expiresAt, ipAddress || null],
    });

    return { code };
  }

  /**
   * Check a code. On success, mint the verificationToken: only its SHA-256 is
   * stored, next to verified_at, and the plaintext exists only in the return
   * value.
   *
   * @returns {Promise<{ valid: true, verificationToken: string } | { valid: false, error: string }>}
   */
  async function verifyEmailCode(email, scopeId, code) {
    const normalized = emailOtp.normalizeEmail(email);
    const result = await db.execute({
      sql: `SELECT * FROM ${table}
            WHERE email = ? AND ${scopeColumn} = ? AND verified = 0
            ORDER BY created_at DESC LIMIT 1`,
      args: [normalized, scopeId],
    });

    if (result.rows.length === 0) {
      return { valid: false, error: 'No se encontró una verificación pendiente' };
    }

    const verification = result.rows[0];

    if (new Date(verification.expires_at) < new Date()) {
      return { valid: false, error: 'El código ha expirado. Solicita uno nuevo' };
    }

    if (verification.attempts >= maxAttempts) {
      return { valid: false, error: 'Demasiados intentos. Solicita un nuevo código' };
    }

    if (!emailOtp.safeEqual(String(code ?? ''), String(verification.code))) {
      await db.execute({
        sql: `UPDATE ${table} SET attempts = attempts + 1 WHERE id = ?`,
        args: [verification.id],
      });
      return { valid: false, error: 'Código incorrecto' };
    }

    const verificationToken = emailOtp.generateOpaqueToken();
    // Guarded on verified = 0 so two concurrent correct answers cannot both
    // mint a token: the loser sees rowsAffected = 0.
    const update = await db.execute({
      sql: `UPDATE ${table}
            SET verified = 1, token_hash = ?, verified_at = CURRENT_TIMESTAMP
            WHERE id = ? AND verified = 0`,
      args: [emailOtp.sha256(verificationToken), verification.id],
    });
    if (update.rowsAffected === 0) {
      return { valid: false, error: 'No se encontró una verificación pendiente' };
    }

    return { valid: true, verificationToken };
  }

  /**
   * The email a verificationToken proves, or null when the token is unknown,
   * belongs to another draw/auction, or is older than the TTL. The TTL is
   * compared in SQL against verified_at, written as CURRENT_TIMESTAMP — same
   * zone-less UTC shape, so the comparison sorts correctly.
   *
   * @returns {Promise<string|null>}
   */
  async function resolveVerificationToken(scopeId, token) {
    if (!token || typeof token !== 'string') return null;
    const result = await db.execute({
      sql: `SELECT email FROM ${table}
            WHERE ${scopeColumn} = ? AND token_hash = ? AND verified = 1
              AND datetime(verified_at) > datetime('now', ?)
            LIMIT 1`,
      args: [scopeId, emailOtp.sha256(token), `-${emailOtp.VERIFICATION_TOKEN_TTL_MINUTES} minutes`],
    });
    return result.rows[0]?.email ?? null;
  }

  return { createEmailVerification, verifyEmailCode, resolveVerificationToken };
}

module.exports = { createBuyerEmailVerification };
