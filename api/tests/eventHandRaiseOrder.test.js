/**
 * The raised hand carries its instant (Change: broadcast-participant-row-scaling).
 *
 * `handRaised` alone is a boolean, so the participant row cannot tell who
 * raised first — and stamping it on the client would give every hand the same
 * `Date.now()` for anybody joining late. The server stamps `handRaisedAt`, and
 * these are the six cases the ordering depends on.
 *
 * Same harness as `eventSocketCohost.test.js`: the api has no socket.io-client
 * dependency, so a recording fake stands in for the server.
 */

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const setupEventSocket = require('../socket/eventSocket');

const stamp = Date.now();
const HOST_EMAIL = `hand-host${stamp}@test.com`;

let hostId;
let eventId;

function createFakeServer() {
  let onConnection = null;
  const broadcasts = [];
  const io = {
    on: (name, handler) => { if (name === 'connection') onConnection = handler; },
    to: (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
  };
  const helpers = setupEventSocket(io);

  let counter = 0;
  const connect = () => {
    const handlers = {};
    const socket = {
      id: `socket-${++counter}`,
      data: {},
      handshake: { headers: {}, address: '127.0.0.1' },
      received: [],
      on: (name, handler) => { handlers[name] = handler; },
      emit: (event, payload) => socket.received.push({ event, payload }),
      join: () => {},
      leave: () => {},
      to: (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
    };
    onConnection(socket);
    socket.joinRoom = (payload) => new Promise((resolve) => { handlers.join_event_room(payload, resolve); });
    socket.send = (name, payload) => handlers[name](payload);
    return socket;
  };

  return { helpers, broadcasts, connect };
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [HOST_EMAIL, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);

  eventId = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, category,
             status, provider, interaction_mode, agora_channel_name)
          VALUES (?, ?, ?, ?, ?, 'free', 'charla', 'active', 'agora', 'broadcast', ?)`,
    args: [eventId, 'Manos levantadas', `manos-${stamp}`, new Date().toISOString(), hostId, `event-${eventId}`],
  });
});

async function viewerSession(label) {
  const { attendee, accessToken } = await eventService.registerAttendee(eventId, {
    first_name: 'Vera',
    last_name: label,
    email: `hand-viewer-${label}-${stamp}@test.com`,
  });
  return { eventId, attendeeId: attendee.id, accessToken, identity: `viewer-${attendee.id}` };
}

const presenceOf = (helpers, identity) =>
  helpers.getEventRoomPresence(eventId).find((p) => p.identity === identity);

describe('handRaisedAt', () => {
  it('is null on join and travels in the presence entry', async () => {
    const { connect } = createFakeServer();
    const session = await viewerSession('alta');

    const ack = await connect().joinRoom(session);

    const self = ack.presence.find((p) => p.identity === session.identity);
    expect(self).toHaveProperty('handRaisedAt', null);
    expect(self.handRaised).toBe(false);
  });

  it('stamps three hands in the order they were raised', async () => {
    const { connect, helpers } = createFakeServer();
    const sessions = [];
    for (const label of ['una', 'dos', 'tres']) {
      const session = await viewerSession(label);
      const socket = connect();
      await socket.joinRoom(session);
      sessions.push({ ...session, socket });
    }

    for (const { socket } of sessions) {
      socket.send('hand_raise', { raised: true });
      // Date.now() has millisecond resolution: three sends inside the same
      // millisecond would tie and the assertion would be vacuous.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const stamps = sessions.map(({ identity }) => presenceOf(helpers, identity).handRaisedAt);
    expect(stamps.every((value) => typeof value === 'number')).toBe(true);
    expect(stamps[0]).toBeLessThan(stamps[1]);
    expect(stamps[1]).toBeLessThan(stamps[2]);
  });

  it('does not re-stamp a hand that is already raised', async () => {
    const { connect, helpers } = createFakeServer();
    const session = await viewerSession('doble');
    const socket = connect();
    await socket.joinRoom(session);

    socket.send('hand_raise', { raised: true });
    const first = presenceOf(helpers, session.identity).handRaisedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.send('hand_raise', { raised: true });

    expect(presenceOf(helpers, session.identity).handRaisedAt).toBe(first);
  });

  it('clears the stamp when the hand goes down', async () => {
    const { connect, helpers } = createFakeServer();
    const session = await viewerSession('baja');
    const socket = connect();
    await socket.joinRoom(session);

    socket.send('hand_raise', { raised: true });
    socket.send('hand_raise', { raised: false });

    const entry = presenceOf(helpers, session.identity);
    expect(entry.handRaised).toBe(false);
    expect(entry.handRaisedAt).toBeNull();
  });

  it('clears hand and stamp when the host gives the floor', async () => {
    const { connect, helpers } = createFakeServer();
    const session = await viewerSession('promovida');
    const socket = connect();
    await socket.joinRoom(session);
    socket.send('hand_raise', { raised: true });

    helpers.notifyPromoted(eventId, session.identity);

    const entry = presenceOf(helpers, session.identity);
    expect(entry.speaker).toBe(true);
    expect(entry.handRaised).toBe(false);
    expect(entry.handRaisedAt).toBeNull();
  });

  it('keeps the hand and its place in the queue across a reconnect', async () => {
    const { connect, helpers } = createFakeServer();
    const session = await viewerSession('recarga');
    const first = connect();
    await first.joinRoom(session);
    first.send('hand_raise', { raised: true });
    const before = presenceOf(helpers, session.identity).handRaisedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const ack = await connect().joinRoom(session);

    const self = ack.presence.find((p) => p.identity === session.identity);
    expect(self.handRaised).toBe(true);
    expect(self.handRaisedAt).toBe(before);
  });
});
