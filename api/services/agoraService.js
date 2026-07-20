const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');

// Reserved RTC uid for the event host. Attendee uids are assigned sequentially
// starting at 101 (1-100 reserved for system use). See design D3.
const HOST_UID = 1;
const FIRST_ATTENDEE_UID = 101;

// Default RTC token TTL: 4 hours (parity with LiveKit tokens).
const DEFAULT_TOKEN_TTL_SECONDS = 14400;

const AGORA_REST_BASE = 'https://api.agora.io';

// Kicking rules are banned for the REST API maximum (24 h). The primary
// enforcement is the token role (speaker_granted re-evaluated on renewal);
// the rule is belt-and-braces (design R2).
const KICKING_RULE_MINUTES = 1440;

// In-memory ruleId cache: `${cname}:${uid}` → ruleId. Lost on restart;
// liftPublishBan recovers via GET /dev/v1/kicking-rule (design D5).
const publishBanRules = new Map();

function assertTokenConfigured() {
  if (!config.agora.appId || !config.agora.appCertificate) {
    throw new ApiError(
      503,
      'El proveedor de streaming Agora no está configurado (AGORA_APP_ID / AGORA_APP_CERTIFICATE)',
      'Streaming no disponible'
    );
  }
}

function assertRestConfigured() {
  if (!config.agora.customerId || !config.agora.customerSecret) {
    throw new ApiError(
      503,
      'Las credenciales RESTful de Agora no están configuradas (AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET)',
      'Moderación no disponible'
    );
  }
}

/**
 * Generate an Agora RTC token (AccessToken2) for a channel + uid.
 * With Co-host authentication enabled in the Agora console, a 'subscriber'
 * token cannot publish even if the client is tampered with — the real
 * equivalent of LiveKit's canPublish:false.
 *
 * @param {object} params
 * @param {string} params.channel - Channel name (e.g. 'event-{id}')
 * @param {number} params.uid - Numeric RTC uid (host: 1; attendees: >= 101)
 * @param {'publisher'|'subscriber'} params.role
 * @param {number} [params.ttlSeconds=14400]
 * @returns {string} RTC token
 */
function generateRtcToken({ channel, uid, role, ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS }) {
  assertTokenConfigured();

  const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const token = RtcTokenBuilder.buildTokenWithUid(
    config.agora.appId,
    config.agora.appCertificate,
    channel,
    uid,
    rtcRole,
    ttlSeconds,
    ttlSeconds
  );

  logger.debug({ channel, uid, role, ttlSeconds }, '[agoraService] RTC token generated');
  return token;
}

/**
 * Get or assign the stable numeric RTC uid for an attendee.
 * Assigned once (on the first token) as MAX(agora_uid)+1 within the event
 * (starting at 101) and persisted in event_attendees.agora_uid. The single
 * UPDATE with subquery is atomic; the duplicate check + retry covers the
 * theoretical race between concurrent first-token requests.
 *
 * @param {string} eventId
 * @param {string} attendeeId
 * @returns {Promise<number>} The attendee's agora_uid
 */
async function ensureAttendeeUid(eventId, attendeeId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await db.execute({
      sql: 'SELECT agora_uid FROM event_attendees WHERE id = ? AND event_id = ?',
      args: [attendeeId, eventId],
    });
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Asistente no encontrado', 'Asistente no encontrado');
    }
    const current = existing.rows[0].agora_uid;
    if (current !== null && current !== undefined) {
      return Number(current);
    }

    await db.execute({
      sql: `UPDATE event_attendees
            SET agora_uid = (
              SELECT COALESCE(MAX(agora_uid), ${FIRST_ATTENDEE_UID - 1}) + 1
              FROM event_attendees WHERE event_id = ?
            )
            WHERE id = ? AND agora_uid IS NULL`,
      args: [eventId, attendeeId],
    });

    const assigned = await db.execute({
      sql: 'SELECT agora_uid FROM event_attendees WHERE id = ?',
      args: [attendeeId],
    });
    const uid = assigned.rows[0]?.agora_uid;
    if (uid === null || uid === undefined) continue;

    // Collision check: another concurrent assignment may have produced the
    // same uid. Loser clears its uid and retries.
    const dupes = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM event_attendees WHERE event_id = ? AND agora_uid = ?',
      args: [eventId, uid],
    });
    if (Number(dupes.rows[0].count) > 1) {
      logger.warn({ eventId, attendeeId, uid }, '[agoraService] agora_uid collision, retrying');
      await db.execute({
        sql: 'UPDATE event_attendees SET agora_uid = NULL WHERE id = ?',
        args: [attendeeId],
      });
      continue;
    }

    logger.info({ eventId, attendeeId, uid }, '[agoraService] agora_uid assigned');
    return Number(uid);
  }
  throw new ApiError(500, 'No se pudo asignar un identificador de sala', 'Error de sala');
}

// ---------------------------------------------------------------------------
// Moderation REST client (kicking rules)
// Docs: POST/GET/DELETE https://api.agora.io/dev/v1/kicking-rule
// ---------------------------------------------------------------------------

function restHeaders() {
  const credentials = Buffer.from(
    `${config.agora.customerId}:${config.agora.customerSecret}`
  ).toString('base64');
  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${credentials}`,
  };
}

// Agora's REST gateway is occasionally very slow (observed: 7 s POSTs and
// 504 "upstream server is timing out" on DELETE). Bound every call so a slow
// gateway can never hang a promote/demote request.
const REST_TIMEOUT_MS = 15000;

async function restRequest(method, path, body) {
  let res;
  try {
    res = await fetch(`${AGORA_REST_BASE}${path}`, {
      method,
      headers: restHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(
      { method, path, err: err?.message },
      '[agoraService] Agora REST request failed (network/timeout)'
    );
    throw new ApiError(502, 'La operación de moderación no se pudo completar', 'Error de moderación');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!res.ok) {
    logger.error(
      { method, path, status: res.status, response: text?.slice(0, 500) },
      '[agoraService] Agora REST request failed'
    );
    throw new ApiError(502, 'La operación de moderación no se pudo completar', 'Error de moderación');
  }
  return data;
}

// One retry absorbs the gateway's transient 504s/timeouts.
async function restRequestWithRetry(method, path, body, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await restRequest(method, path, body);
    } catch (err) {
      if (attempt >= retries) throw err;
      logger.warn(
        { method, path, attempt: attempt + 1 },
        '[agoraService] Retrying Agora REST request'
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Ban a uid from publishing audio+video in a channel (hard enforcement used
 * on demote). Saves the ruleId for the matching liftPublishBan. A retried
 * POST after a gateway timeout may leave a duplicate rule — harmless, since
 * liftPublishBan deletes every matching rule.
 */
async function banPublish(channel, uid) {
  assertRestConfigured();
  const data = await restRequestWithRetry('POST', '/dev/v1/kicking-rule', {
    appid: config.agora.appId,
    cname: channel,
    uid,
    time: KICKING_RULE_MINUTES,
    privileges: ['publish_audio', 'publish_video'],
  });
  if (data?.id) {
    publishBanRules.set(`${channel}:${uid}`, data.id);
  }
  logger.info({ channel, uid, ruleId: data?.id }, '[agoraService] publish ban created');
  return data?.id || null;
}

/**
 * Remove the publish ban(s) for a uid (used on re-promote). Always lists the
 * live rules: this recovers ids lost on restart AND catches duplicates left
 * by retried creations — a surviving rule would block the re-promoted user's
 * publish for up to 24 h. No-op if no rule exists.
 */
async function liftPublishBan(channel, uid) {
  assertRestConfigured();
  const key = `${channel}:${uid}`;
  const knownId = publishBanRules.get(key);

  let ids = [];
  try {
    const list = await restRequestWithRetry(
      'GET',
      `/dev/v1/kicking-rule?appid=${encodeURIComponent(config.agora.appId)}`
    );
    ids = (list?.rules || [])
      .filter(
        (r) =>
          r.cname === channel &&
          Number(r.uid) === Number(uid) &&
          (r.privileges || []).includes('publish_audio')
      )
      .map((r) => r.id);
  } catch (err) {
    // Listing failed: fall back to the id we remember, if any
    if (!knownId) throw err;
  }
  if (knownId && !ids.includes(knownId)) ids.push(knownId);

  if (ids.length === 0) {
    logger.debug({ channel, uid }, '[agoraService] no publish ban to lift');
    publishBanRules.delete(key);
    return false;
  }

  for (const id of ids) {
    await restRequestWithRetry('DELETE', '/dev/v1/kicking-rule', {
      appid: config.agora.appId,
      id,
    });
  }
  publishBanRules.delete(key);
  logger.info({ channel, uid, ruleIds: ids }, '[agoraService] publish ban lifted');
  return true;
}

/**
 * Kick a uid out of the channel and block rejoining (join_channel privilege).
 * The client sees connection-state-change with reason UID_BANNED.
 */
async function kickUser(channel, uid) {
  assertRestConfigured();
  const data = await restRequestWithRetry('POST', '/dev/v1/kicking-rule', {
    appid: config.agora.appId,
    cname: channel,
    uid,
    time: KICKING_RULE_MINUTES,
    privileges: ['join_channel'],
  });
  logger.info({ channel, uid, ruleId: data?.id }, '[agoraService] user kicked from channel');
  return data?.id || null;
}

function isConfigured() {
  return !!(config.agora.appId && config.agora.appCertificate);
}

module.exports = {
  HOST_UID,
  generateRtcToken,
  ensureAttendeeUid,
  banPublish,
  liftPublishBan,
  kickUser,
  isConfigured,
};
