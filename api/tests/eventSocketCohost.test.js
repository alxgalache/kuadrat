/**
 * Authenticated Agora event room: co-presenter presence, stage layout and the
 * hardened host identity (Change: agora-interview-cohost).
 *
 * The api has no socket.io-client dependency, and none is added for this:
 * setupEventSocket only needs `io.on('connection')` and `io.to(room).emit`,
 * so a recording fake stands in for the server and each fake socket records
 * what it is sent. The handlers under test run unmodified against the local
 * test database.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const setupEventSocket = require('../socket/eventSocket');

const stamp = Date.now();
const ADMIN_EMAIL = `socket-admin${stamp}@test.com`;
const HOST_EMAIL = `socket-host${stamp}@test.com`;

let adminId;
let hostId;
let eventId;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

function createFakeServer() {
  let onConnection = null;
  const broadcasts = []; // { room, event, payload }
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

    socket.joinRoom = (payload) => new Promise((resolve) => {
      handlers.join_event_room(payload, resolve);
    });
    // Plain handlers; async ones (chat) return their promise
    socket.send = (name, payload) => handlers[name](payload);
    return socket;
  };

  return { helpers, broadcasts, connect };
}

const roomOf = (id) => `event-room-${id}`;

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);

  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [ADMIN_EMAIL, hash, 'Ada Entrevistadora'],
  });
  adminId = Number(admin.lastInsertRowid);

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
    args: [eventId, 'Entrevista socket', `entrevista-socket-${stamp}`, new Date().toISOString(), hostId, `event-${eventId}`],
  });
});

async function staffSession() {
  const { attendee, accessToken } = await eventService.createOrGetStaffAttendee(eventId, {
    email: ADMIN_EMAIL,
    fullName: 'Ada Entrevistadora',
  });
  return { eventId, attendeeId: attendee.id, accessToken };
}

async function viewerSession(label) {
  const { attendee, accessToken } = await eventService.registerAttendee(eventId, {
    first_name: 'Vera',
    last_name: label,
    email: `socket-viewer-${label}-${stamp}@test.com`,
  });
  return { eventId, attendeeId: attendee.id, accessToken };
}

describe('host identity on join_event_room', () => {
  it('denies an admin JWT that is not the event host', async () => {
    const { connect } = createFakeServer();
    const socket = connect();

    const ack = await socket.joinRoom({ eventId, hostToken: tokenFor(adminId, ADMIN_EMAIL, 'admin') });

    expect(ack.ok).toBe(false);
    expect(socket.received.map((r) => r.event)).toContain('room_join_denied');
  });

  it('accepts the event host with a host entry', async () => {
    const { connect } = createFakeServer();
    const socket = connect();

    const ack = await socket.joinRoom({ eventId, hostToken: tokenFor(hostId, HOST_EMAIL, 'seller') });

    expect(ack.ok).toBe(true);
    const self = ack.presence.find((p) => p.identity === ack.identity);
    expect(self.isHost).toBe(true);
    expect(self.coHost).toBe(false);
  });
});

describe('co-presenter presence', () => {
  it('marks the admin as co-presenter and speaker without persisting speaker_granted', async () => {
    const { connect } = createFakeServer();
    const session = await staffSession();

    const ack = await connect().joinRoom(session);

    expect(ack.ok).toBe(true);
    const self = ack.presence.find((p) => p.identity === `viewer-${session.attendeeId}`);
    expect(self.coHost).toBe(true);
    expect(self.speaker).toBe(true);

    const row = await db.execute({
      sql: 'SELECT speaker_granted FROM event_attendees WHERE id = ?',
      args: [session.attendeeId],
    });
    expect(Number(row.rows[0].speaker_granted)).toBe(0);
  });

  it('ignores a raised hand from the co-presenter', async () => {
    const { connect, broadcasts } = createFakeServer();
    const socket = connect();
    await socket.joinRoom(await staffSession());
    const before = broadcasts.length;

    socket.send('hand_raise', { raised: true });

    expect(broadcasts.length).toBe(before);
  });

  it('does not auto-ban the co-presenter for sending many messages', async () => {
    const { connect, broadcasts } = createFakeServer();
    const socket = connect();
    const session = await staffSession();
    await socket.joinRoom(session);

    for (let i = 0; i < 11; i++) {
      await socket.send('event_chat_message', { text: `Pregunta ${i}` });
    }

    const events = broadcasts.map((b) => b.event);
    expect(events.filter((e) => e === 'event_chat_message')).toHaveLength(11);
    expect(events).not.toContain('chat_banned');

    const bans = await db.execute({
      sql: 'SELECT COUNT(*) AS count FROM event_bans WHERE event_id = ? AND email = ?',
      args: [eventId, ADMIN_EMAIL],
    });
    expect(Number(bans.rows[0].count)).toBe(0);
  });
});

describe('stage_layout', () => {
  it('broadcasts the co-presenter choice and hands it to late joiners', async () => {
    const { connect, broadcasts } = createFakeServer();
    const cohost = connect();
    await cohost.joinRoom(await staffSession());

    cohost.send('stage_layout', { mode: 'pip' });

    expect(broadcasts).toContainEqual({ room: roomOf(eventId), event: 'stage_layout', payload: { mode: 'pip' } });

    const lateAck = await connect().joinRoom(await viewerSession('tarde'));
    expect(lateAck.stageLayout).toBe('pip');
  });

  it('starts every room on the split layout', async () => {
    const { connect } = createFakeServer();
    const ack = await connect().joinRoom(await viewerSession('primera'));
    expect(ack.stageLayout).toBe('split');
  });

  it('ignores the host, an ordinary attendee and invalid values', async () => {
    const { connect, broadcasts } = createFakeServer();
    const host = connect();
    await host.joinRoom({ eventId, hostToken: tokenFor(hostId, HOST_EMAIL, 'seller') });
    const viewer = connect();
    await viewer.joinRoom(await viewerSession('ignorada'));
    const cohost = connect();
    await cohost.joinRoom(await staffSession());

    host.send('stage_layout', { mode: 'pip' });
    viewer.send('stage_layout', { mode: 'pip' });
    cohost.send('stage_layout', { mode: 'grid' });

    expect(broadcasts.map((b) => b.event)).not.toContain('stage_layout');
    const ack = await connect().joinRoom(await viewerSession('comprobacion'));
    expect(ack.stageLayout).toBe('split');
  });

  it('forgets the layout when the event ends', async () => {
    const { connect, helpers } = createFakeServer();
    const cohost = connect();
    await cohost.joinRoom(await staffSession());
    cohost.send('stage_layout', { mode: 'pip' });

    helpers.broadcastEventEnded(eventId);

    const ack = await connect().joinRoom(await viewerSession('despues'));
    expect(ack.stageLayout).toBe('split');
  });
});
