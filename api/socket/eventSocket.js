/**
 * Event Socket.IO module
 *
 * Two coexisting layers:
 *  - Public room `event-{eventId}`: start/end notifications and the chat of
 *    pre-recorded video events. Unchanged, no authentication.
 *  - Authenticated room `event-room-{eventId}` (Agora live events only):
 *    presence with names, server-enforced chat, hand raising and targeted
 *    moderation signals. Agora audiences are invisible on the RTC channel
 *    (non-publishers are not remoteUsers), so this presence is the source of
 *    truth for the participant grid and the "N conectados" counter.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const eventService = require('../services/eventService');

// Server-side spam thresholds. Keep in sync with SPAM_MAX_MESSAGES /
// SPAM_WINDOW_MS in client/lib/constants.js (same values the LiveKit client
// uses for report-spam).
const SPAM_MAX_MESSAGES = 10;
const SPAM_WINDOW_MS = 10000;

const MAX_CHAT_MESSAGE_LENGTH = 2000;

module.exports = function setupEventSocket(io) {
  // eventId → Map<identity, { identity, name, isHost, agoraUid, handRaised,
  //                           speaker, chatBanned, attendeeId, email,
  //                           ipAddress, socketIds:Set, msgTimestamps:[] }>
  const eventRooms = new Map();

  // eventId → { active, everyoneWrites } — whiteboard toggle state (optional
  // phase). Set by the host, read by the whiteboard-token endpoint to decide
  // attendee roles and rebroadcast to late joiners via the join ACK.
  const eventWhiteboards = new Map();

  const roomName = (eventId) => `event-room-${eventId}`;

  function getRoom(eventId) {
    if (!eventRooms.has(eventId)) eventRooms.set(eventId, new Map());
    return eventRooms.get(eventId);
  }

  function publicPresence(entry) {
    return {
      identity: entry.identity,
      name: entry.name,
      isHost: entry.isHost,
      agoraUid: entry.agoraUid,
      handRaised: entry.handRaised,
      speaker: entry.speaker,
      chatBanned: entry.chatBanned,
      screenSharing: !!entry.screenSharing,
    };
  }

  function presenceList(eventId) {
    const room = eventRooms.get(eventId);
    if (!room) return [];
    return [...room.values()].map(publicPresence);
  }

  function emitToIdentity(eventId, identity, eventName, payload) {
    const entry = eventRooms.get(eventId)?.get(identity);
    if (!entry) return false;
    for (const socketId of entry.socketIds) {
      io.to(socketId).emit(eventName, payload);
    }
    return true;
  }

  function getClientIp(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return socket.handshake.address || null;
  }

  // Server-side spam detection (same thresholds as the LiveKit client filter,
  // same effect as report-spam: chat ban + email/IP ban).
  async function checkSpam(eventId, entry) {
    const now = Date.now();
    entry.msgTimestamps.push(now);
    entry.msgTimestamps = entry.msgTimestamps.filter((t) => now - t <= SPAM_WINDOW_MS);
    if (entry.msgTimestamps.length <= SPAM_MAX_MESSAGES) return false;

    entry.chatBanned = true;
    try {
      if (entry.attendeeId) {
        await eventService.markAttendeeChatBanned(entry.attendeeId);
        await eventService.banAttendee(eventId, entry.email, entry.ipAddress, 'spam');
      }
    } catch (err) {
      logger.error({ err, eventId, identity: entry.identity }, '[eventSocket] Error persisting spam ban');
    }
    io.to(roomName(eventId)).emit('chat_banned', { identity: entry.identity });
    io.to(roomName(eventId)).emit('presence_updated', publicPresence(entry));
    logger.warn({ eventId, identity: entry.identity }, '[eventSocket] Auto chat-ban for spam');
    return true;
  }

  async function authenticateJoin(socket, payload) {
    const { eventId, attendeeId, accessToken, hostToken } = payload || {};
    if (!eventId) return { ok: false, reason: 'Solicitud inválida' };

    const event = await eventService.getEventById(eventId);
    if (!event) return { ok: false, reason: 'Evento no encontrado' };
    if (event.provider !== 'agora' || event.format === 'video') {
      return { ok: false, reason: 'Este evento no usa sala en tiempo real' };
    }
    if (event.status !== 'active') return { ok: false, reason: 'El evento no está activo' };

    // Host / admin path: verified JWT
    if (hostToken) {
      let decoded;
      try {
        decoded = jwt.verify(hostToken, config.jwt.secret);
      } catch {
        return { ok: false, reason: 'Credenciales inválidas' };
      }
      const isEventHost = decoded.id === event.host_user_id;
      if (!isEventHost && decoded.role !== 'admin') {
        return { ok: false, reason: 'Credenciales inválidas' };
      }
      return {
        ok: true,
        event,
        entry: {
          identity: `host-${decoded.id}`,
          name: isEventHost ? (event.host_name || 'Host') : 'Admin',
          isHost: true,
          agoraUid: 1,
          handRaised: false,
          speaker: true,
          chatBanned: false,
          attendeeId: null,
          email: null,
          ipAddress: null,
        },
      };
    }

    // Attendee path: re-validate exactly like the token endpoint
    if (!attendeeId || !accessToken) return { ok: false, reason: 'Credenciales inválidas' };

    const attendee = await eventService.getAttendeeByAccessToken(eventId, accessToken);
    if (!attendee || attendee.id !== attendeeId) {
      return { ok: false, reason: 'Credenciales inválidas' };
    }
    if (event.access_type === 'paid' && !['paid', 'joined'].includes(attendee.status)) {
      return { ok: false, reason: 'Se requiere pago para acceder' };
    }
    const clientIp = getClientIp(socket);
    if (await eventService.isEmailBanned(eventId, attendee.email)) {
      return { ok: false, reason: 'Has sido expulsado de este evento' };
    }
    if (await eventService.isIpBanned(eventId, clientIp)) {
      return { ok: false, reason: 'Has sido expulsado de este evento' };
    }

    return {
      ok: true,
      event,
      entry: {
        identity: `viewer-${attendee.id}`,
        name: `${attendee.first_name} ${attendee.last_name}`,
        isHost: false,
        agoraUid: attendee.agora_uid != null ? Number(attendee.agora_uid) : null,
        handRaised: false,
        speaker: attendee.speaker_granted === 1,
        chatBanned: attendee.chat_banned === 1,
        attendeeId: attendee.id,
        email: attendee.email,
        ipAddress: attendee.ip_address || clientIp,
      },
    };
  }

  function leaveEventRoom(socket) {
    const { eventRoomId, identity } = socket.data || {};
    if (!eventRoomId || !identity) return;

    const room = eventRooms.get(eventRoomId);
    const entry = room?.get(identity);
    socket.leave(roomName(eventRoomId));
    socket.data.eventRoomId = null;
    socket.data.identity = null;

    if (!entry) return;
    entry.socketIds.delete(socket.id);
    if (entry.socketIds.size === 0) {
      room.delete(identity);
      if (room.size === 0) eventRooms.delete(eventRoomId);
      io.to(roomName(eventRoomId)).emit('presence_left', { identity });
    }
  }

  io.on("connection", (socket) => {
    // ── Public room (unchanged) ─────────────────────────────
    // Join an event room to receive real-time updates
    socket.on("join_event", (eventId) => {
      if (!eventId) return;
      socket.join(`event-${eventId}`);
    });

    // Leave an event room
    socket.on("leave_event", (eventId) => {
      if (!eventId) return;
      socket.leave(`event-${eventId}`);
    });

    // Chat message for video events (LiveKit events use LiveKit's built-in chat)
    socket.on("chat_message", ({ eventId, sender, message }) => {
      if (!eventId || !message) return;
      io.to(`event-${eventId}`).emit("chat_message", {
        sender: sender || 'Anónimo',
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // ── Authenticated event room (Agora live events) ────────
    socket.on('join_event_room', async (payload, ack) => {
      try {
        const result = await authenticateJoin(socket, payload);
        if (!result.ok) {
          const denial = { reason: result.reason };
          socket.emit('room_join_denied', denial);
          if (typeof ack === 'function') ack({ ok: false, ...denial });
          return;
        }

        // A socket can only be in one event room at a time
        leaveEventRoom(socket);

        const eventId = payload.eventId;
        const room = getRoom(eventId);
        const existing = room.get(result.entry.identity);
        let entry;
        if (existing) {
          // Same identity reconnecting (refresh, second tab): merge sockets,
          // refresh the re-validated fields.
          existing.socketIds.add(socket.id);
          existing.name = result.entry.name;
          existing.agoraUid = result.entry.agoraUid ?? existing.agoraUid;
          existing.speaker = result.entry.speaker;
          existing.chatBanned = result.entry.chatBanned;
          entry = existing;
        } else {
          entry = { ...result.entry, socketIds: new Set([socket.id]), msgTimestamps: [] };
          room.set(entry.identity, entry);
        }

        socket.data.eventRoomId = eventId;
        socket.data.identity = entry.identity;
        socket.join(roomName(eventId));

        if (!existing) {
          socket.to(roomName(eventId)).emit('presence_joined', publicPresence(entry));
        }

        if (typeof ack === 'function') {
          ack({
            ok: true,
            identity: entry.identity,
            chatBanned: entry.chatBanned,
            presence: presenceList(eventId),
            whiteboard: eventWhiteboards.get(eventId) || { active: false, everyoneWrites: false },
          });
        }
      } catch (err) {
        logger.error({ err }, '[eventSocket] join_event_room failed');
        socket.emit('room_join_denied', { reason: 'Error interno' });
        if (typeof ack === 'function') ack({ ok: false, reason: 'Error interno' });
      }
    });

    socket.on('leave_event_room', () => {
      leaveEventRoom(socket);
    });

    // Chat with server-side chat_banned enforcement. No history for late
    // joiners (parity with the LiveKit data-channel chat).
    socket.on('event_chat_message', async ({ text } = {}) => {
      const { eventRoomId, identity } = socket.data || {};
      if (!eventRoomId || !identity) return;
      const entry = eventRooms.get(eventRoomId)?.get(identity);
      if (!entry) return;

      const message = typeof text === 'string' ? text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH) : '';
      if (!message) return;

      if (entry.chatBanned) return; // silently discarded

      if (!entry.isHost) {
        const banned = await checkSpam(eventRoomId, entry);
        if (banned) return;
      }

      io.to(roomName(eventRoomId)).emit('event_chat_message', {
        identity: entry.identity,
        name: entry.name,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Hand raise state lives in presence (parity with the LiveKit attribute)
    socket.on('hand_raise', ({ raised } = {}) => {
      const { eventRoomId, identity } = socket.data || {};
      if (!eventRoomId || !identity) return;
      const entry = eventRooms.get(eventRoomId)?.get(identity);
      if (!entry || entry.isHost) return;
      entry.handRaised = !!raised;
      io.to(roomName(eventRoomId)).emit('presence_updated', publicPresence(entry));
    });

    // Host flags screen sharing so meeting grids can feature their tile
    // (RTC alone can't distinguish a screen track from a camera track)
    socket.on('screen_share', ({ active } = {}) => {
      const { eventRoomId, identity } = socket.data || {};
      if (!eventRoomId || !identity) return;
      const entry = eventRooms.get(eventRoomId)?.get(identity);
      if (!entry || !entry.isHost) return;
      entry.screenSharing = !!active;
      io.to(roomName(eventRoomId)).emit('presence_updated', publicPresence(entry));
    });

    // In-room host moderation: ask a participant to mute (soft mute, meeting
    // mode tile menu). Server-validated: only the room host can emit it.
    socket.on('moderate_force_mute', ({ identity: targetIdentity } = {}) => {
      const { eventRoomId, identity } = socket.data || {};
      if (!eventRoomId || !identity || !targetIdentity) return;
      const sender = eventRooms.get(eventRoomId)?.get(identity);
      if (!sender || !sender.isHost) return;
      emitToIdentity(eventRoomId, targetIdentity, 'force_mute', { identity: targetIdentity });
    });

    // Whiteboard toggle (optional phase): host turns the shared whiteboard
    // on/off; everyoneWrites grants writer tokens to attendees (meeting mode)
    socket.on('whiteboard_toggle', ({ active, everyoneWrites } = {}) => {
      const { eventRoomId, identity } = socket.data || {};
      if (!eventRoomId || !identity) return;
      const sender = eventRooms.get(eventRoomId)?.get(identity);
      if (!sender || !sender.isHost) return;
      const state = { active: !!active, everyoneWrites: !!everyoneWrites };
      eventWhiteboards.set(eventRoomId, state);
      io.to(roomName(eventRoomId)).emit('whiteboard_toggle', state);
    });

    socket.on('disconnect', () => {
      leaveEventRoom(socket);
    });
  });

  // Return broadcast helper functions
  return {
    /**
     * Broadcast that the event has started (went live)
     * @param {string|number} eventId
     */
    broadcastEventStarted(eventId) {
      io.to(`event-${eventId}`).emit("event_started", { eventId });
    },

    /**
     * Broadcast that the event has ended
     * @param {string|number} eventId
     */
    broadcastEventEnded(eventId) {
      io.to(`event-${eventId}`).emit("event_ended", { eventId });
      // Agora rooms: drop the in-memory presence, clients leave() on their own
      eventRooms.delete(eventId);
      eventWhiteboards.delete(eventId);
    },

    // ── Agora event-room moderation helpers (called from controllers) ──

    /**
     * Presence snapshot of an Agora event room (source of truth for the
     * admin participants panel).
     */
    getEventRoomPresence(eventId) {
      return presenceList(eventId);
    },

    /**
     * Whiteboard toggle state (optional phase). The whiteboard-token endpoint
     * reads it to decide attendee roles.
     */
    getWhiteboardState(eventId) {
      return eventWhiteboards.get(eventId) || { active: false, everyoneWrites: false };
    },

    /**
     * Notify a promotion: marks speaker, clears the raised hand (parity with
     * LiveKit clearing the attribute) and signals the target to renew its
     * token and start publishing.
     */
    notifyPromoted(eventId, identity) {
      const entry = eventRooms.get(eventId)?.get(identity);
      if (entry) {
        entry.speaker = true;
        entry.handRaised = false;
        io.to(roomName(eventId)).emit('presence_updated', publicPresence(entry));
      }
      emitToIdentity(eventId, identity, 'promoted', { identity });
    },

    /**
     * Notify a demotion: clears speaker and signals the target to unpublish
     * and fall back to audience.
     */
    notifyDemoted(eventId, identity) {
      const entry = eventRooms.get(eventId)?.get(identity);
      if (entry) {
        entry.speaker = false;
        io.to(roomName(eventId)).emit('presence_updated', publicPresence(entry));
      }
      emitToIdentity(eventId, identity, 'demoted', { identity });
    },

    /**
     * Ask a participant's client to mute its microphone (soft mute — the hard
     * equivalent is demoting, see design R4).
     */
    notifyForceMute(eventId, identity) {
      emitToIdentity(eventId, identity, 'force_mute', { identity });
    },

    /**
     * Broadcast a chat ban so the target shows the banned notice and the rest
     * update their presence state.
     */
    notifyChatBanned(eventId, identity) {
      const entry = eventRooms.get(eventId)?.get(identity);
      if (entry) entry.chatBanned = true;
      io.to(roomName(eventId)).emit('chat_banned', { identity });
      if (entry) io.to(roomName(eventId)).emit('presence_updated', publicPresence(entry));
    },
  };
};
