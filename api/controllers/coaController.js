const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { sendSuccess } = require('../utils/response');
const { verifySunParams } = require('../services/ntag424Service');
const { hashIp } = require('../utils/ipPrivacy');

const TERMINAL_STATUSES = new Set(['revoked', 'lost', 'damaged']);
const USER_AGENT_MAX_LENGTH = 256;

// Fields returned to the frontend on a successful verification. Kept narrow
// on purpose — anything sensitive (seller_id, price, internal flags) is omitted
// even though the JOIN reads the full art row.
function projectArtForCollector(row) {
  return {
    id: row.art_id,
    name: row.art_name,
    slug: row.art_slug,
    description: row.art_description,
    basename: row.art_basename,
    type: row.art_type,
    dimensions: row.art_dimensions,
    artistName: row.artist_name || null,
  };
}

async function insertVerificationEvent({ uid, counter, status, ipHash, userAgent }) {
  try {
    await db.execute({
      sql: `INSERT INTO verification_events (uid, counter, status, ip_hash, user_agent)
            VALUES (?, ?, ?, ?, ?)`,
      args: [uid, counter, status, ipHash, userAgent],
    });
  } catch (err) {
    // The verification result is more important than the audit log row, so we
    // log and continue instead of failing the response.
    logger.error({ err, uid, status }, 'Failed to insert verification_events row');
  }
}

/**
 * GET /api/coa/verify?picc=<32hex>&cmac=<16hex>
 *
 * Public, unauthenticated. Verifies the SUN URL emitted by a NTAG 424 DNA
 * sticker, applies anti-replay via the SDM counter, and returns the bound
 * artwork on success. Every attempt — successful or not — is recorded in
 * verification_events for auditing.
 */
const verifyCoa = async (req, res, next) => {
  const userAgent = (req.get('user-agent') || '').slice(0, USER_AGENT_MAX_LENGTH);
  const ipHash = hashIp(req.ip);

  try {
    // Zod-validated query params (controller still defends against missing
    // values in case the middleware order changes in the future).
    const piccHex = typeof req.query.picc === 'string' ? req.query.picc : '';
    const cmacHex = typeof req.query.cmac === 'string' ? req.query.cmac : '';

    const result = verifySunParams({ piccHex, cmacHex });

    if (!result.ok) {
      const statusLower = result.reason.toLowerCase(); // 'malformed' | 'invalid_cmac'
      await insertVerificationEvent({
        uid: result.uidHex || null,
        counter: result.counter ?? null,
        status: statusLower,
        ipHash,
        userAgent,
      });
      return sendSuccess(res, { status: statusLower });
    }

    // Cryptography passed. Look up the tag together with the bound artwork.
    const tagQuery = await db.execute({
      sql: `SELECT
              t.uid               AS uid,
              t.status            AS tag_status,
              t.last_counter      AS last_counter,
              t.is_permanently_locked AS is_permanently_locked,
              a.id                AS art_id,
              a.name              AS art_name,
              a.slug              AS art_slug,
              a.description       AS art_description,
              (SELECT basename FROM product_images WHERE product_type = 'art' AND product_id = a.id ORDER BY position ASC, id ASC LIMIT 1) AS art_basename,
              a.type              AS art_type,
              a.dimensions        AS art_dimensions,
              u.full_name         AS artist_name
            FROM nfc_tags t
            JOIN art a ON a.id = t.art_id
            LEFT JOIN users u ON u.id = a.seller_id
            WHERE t.uid = ?
            LIMIT 1`,
      args: [result.uidHex],
    });
    const tag = tagQuery.rows[0];

    if (!tag) {
      await insertVerificationEvent({
        uid: result.uidHex,
        counter: result.counter,
        status: 'unknown_tag',
        ipHash,
        userAgent,
      });
      return sendSuccess(res, { status: 'unknown_tag' });
    }

    if (TERMINAL_STATUSES.has(tag.tag_status)) {
      await insertVerificationEvent({
        uid: result.uidHex,
        counter: result.counter,
        status: 'revoked',
        ipHash,
        userAgent,
      });
      return sendSuccess(res, { status: 'revoked' });
    }

    if (result.counter <= tag.last_counter) {
      await insertVerificationEvent({
        uid: result.uidHex,
        counter: result.counter,
        status: 'replay',
        ipHash,
        userAgent,
      });
      return sendSuccess(res, { status: 'replay' });
    }

    // Atomic counter update with anti-race guard. If another concurrent tap
    // ran first, rowsAffected === 0 and we treat this one as a replay.
    const update = await db.execute({
      sql: `UPDATE nfc_tags
            SET last_counter = ?
            WHERE uid = ? AND last_counter < ?`,
      args: [result.counter, result.uidHex, result.counter],
    });
    if (update.rowsAffected === 0) {
      await insertVerificationEvent({
        uid: result.uidHex,
        counter: result.counter,
        status: 'replay',
        ipHash,
        userAgent,
      });
      return sendSuccess(res, { status: 'replay' });
    }

    await insertVerificationEvent({
      uid: result.uidHex,
      counter: result.counter,
      status: 'ok',
      ipHash,
      userAgent,
    });

    return sendSuccess(res, {
      status: 'ok',
      counter: result.counter,
      art: projectArtForCollector(tag),
    });
  } catch (err) {
    logger.error({ err }, 'Unexpected error in /api/coa/verify');
    return next(new ApiError(500, 'Error al verificar el certificado'));
  }
};

module.exports = {
  verifyCoa,
};
