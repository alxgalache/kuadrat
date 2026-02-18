const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function getRoomServiceClient() {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit environment variables not configured');
  }
  return new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/**
 * Generate a LiveKit token for an event host (can publish audio/video).
 */
async function generateHostToken(roomName, identity, name) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: true,
  });

  return await at.toJwt();
}

/**
 * Generate a LiveKit token for a viewer (can only watch/listen + send data).
 * @param {string} roomName
 * @param {string} identity
 * @param {string} name
 * @param {{ chatBanned?: boolean }} [options]
 */
async function generateViewerToken(roomName, identity, name, options = {}) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: options.chatBanned ? false : true,
    canUpdateOwnMetadata: true,
  });

  return await at.toJwt();
}

/**
 * Create a LiveKit room.
 */
async function createRoom(roomName, options = {}) {
  const svc = getRoomServiceClient();
  return await svc.createRoom({
    name: roomName,
    emptyTimeout: options.emptyTimeout || 30 * 60, // 30 minutes default
    maxParticipants: options.maxParticipants || 0, // 0 = unlimited
  });
}

/**
 * Delete a LiveKit room (disconnects all participants).
 */
async function deleteRoom(roomName) {
  const svc = getRoomServiceClient();
  await svc.deleteRoom(roomName);
}

/**
 * List participants in a room.
 */
async function listParticipants(roomName) {
  const svc = getRoomServiceClient();
  return await svc.listParticipants(roomName);
}

/**
 * Update a participant's permissions (e.g. promote viewer to speaker).
 */
async function updateParticipantPermissions(roomName, identity, permissions) {
  const svc = getRoomServiceClient();
  await svc.updateParticipant(roomName, identity, undefined, permissions);
}

/**
 * Mute or unmute a participant's published track.
 */
async function muteParticipantTrack(roomName, identity, trackSid, muted) {
  const svc = getRoomServiceClient();
  await svc.mutePublishedTrack(roomName, identity, trackSid, muted);
}

/**
 * Remove a participant from a room.
 */
async function removeParticipant(roomName, identity) {
  const svc = getRoomServiceClient();
  await svc.removeParticipant(roomName, identity);
}

module.exports = {
  generateHostToken,
  generateViewerToken,
  createRoom,
  deleteRoom,
  listParticipants,
  updateParticipantPermissions,
  muteParticipantTrack,
  removeParticipant,
};
