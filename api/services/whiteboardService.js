const { sdkToken, roomToken, TokenRole } = require('netless-token');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');

// Agora Interactive Whiteboard (optional phase of add-agora-streaming-provider).
// SDK tokens are ALWAYS generated server-side from AK/SK; clients only ever
// receive per-role room tokens. Rooms are created lazily (zero cost for events
// that never open the whiteboard) and persisted in events.whiteboard_room_uuid
// so reactivation keeps the drawn content.

const NETLESS_API_BASE = 'https://api.netless.link';

// Server-side SDK token for the create-room REST call: short-lived on purpose.
const SDK_TOKEN_LIFESPAN_MS = 10 * 60 * 1000;
// Room tokens: 4 h, parity with the RTC tokens.
const ROOM_TOKEN_LIFESPAN_MS = 4 * 60 * 60 * 1000;

function isConfigured() {
  const { appIdentifier, ak, sk } = config.agoraWhiteboard;
  return !!(appIdentifier && ak && sk);
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new ApiError(
      503,
      'La pizarra interactiva no está configurada (AGORA_WHITEBOARD_*)',
      'Pizarra no disponible'
    );
  }
}

/**
 * Get the whiteboard room uuid for an event, creating the room on first use
 * (POST https://api.netless.link/v5/rooms) and persisting it.
 *
 * @param {object} event - Event row (id + whiteboard_room_uuid)
 * @returns {Promise<string>} Room uuid
 */
async function ensureRoom(event) {
  assertConfigured();
  if (event.whiteboard_room_uuid) return event.whiteboard_room_uuid;

  const { ak, sk, region } = config.agoraWhiteboard;
  const adminToken = sdkToken(ak, sk, SDK_TOKEN_LIFESPAN_MS, { role: TokenRole.Admin });

  const res = await fetch(`${NETLESS_API_BASE}/v5/rooms`, {
    method: 'POST',
    headers: {
      token: adminToken,
      'Content-Type': 'application/json',
      region,
    },
    body: JSON.stringify({ isRecord: false }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!res.ok || !data?.uuid) {
    logger.error(
      { status: res.status, response: text?.slice(0, 500), eventId: event.id },
      '[whiteboardService] Room creation failed'
    );
    throw new ApiError(502, 'No se pudo crear la sala de pizarra', 'Error de pizarra');
  }

  await db.execute({
    sql: 'UPDATE events SET whiteboard_room_uuid = ? WHERE id = ? AND whiteboard_room_uuid IS NULL',
    args: [data.uuid, event.id],
  });
  // Concurrent first activations: trust whatever won the guarded UPDATE
  const persisted = await db.execute({
    sql: 'SELECT whiteboard_room_uuid FROM events WHERE id = ?',
    args: [event.id],
  });
  const uuid = persisted.rows[0]?.whiteboard_room_uuid || data.uuid;

  logger.info({ eventId: event.id, uuid }, '[whiteboardService] Whiteboard room created');
  return uuid;
}

/**
 * Generate a room token for a role.
 * @param {string} uuid - Whiteboard room uuid
 * @param {'writer'|'reader'} role
 * @returns {string} Room token
 */
function generateRoomToken(uuid, role) {
  assertConfigured();
  const { ak, sk } = config.agoraWhiteboard;
  return roomToken(ak, sk, ROOM_TOKEN_LIFESPAN_MS, {
    uuid,
    role: role === 'writer' ? TokenRole.Writer : TokenRole.Reader,
  });
}

module.exports = {
  isConfigured,
  ensureRoom,
  generateRoomToken,
};
