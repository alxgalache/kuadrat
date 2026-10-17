/**
 * Stage covers in the authenticated Agora event room (change:
 * agora-stage-covers).
 *
 * The host or the co-presenter puts a cover up or takes it down; everybody in
 * the room — the sender included — gets the echo; late joiners get it in the
 * ACK; the end of the event drops it; and the recording reads it through
 * getStageState. Same recording fake as eventSocketCohost.test.js: no
 * socket.io-client, the handlers run unmodified against the test database.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const { createVerifiedAttendee } = require('./helpers/eventAttendees');
const setupEventSocket = require('../socket/eventSocket');

const stamp = Date.now();
const ADMIN_EMAIL = `cover-admin${stamp}@test.com`;
const HOST_EMAIL = `cover-host${stamp}@test.com`;

let hostId;
let broadcastId;
let meetingId;

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
    socket.joinRoom = (payload) => new Promise((resolve) => { handlers.join_event_room(payload, resolve); });
    socket.send = (name, payload) => handlers[name](payload);
    return socket;
  };

  return { helpers, broadcasts, connect };
}

const roomOf = (id) => `event-room-${id}`;
const coverEchoes = (broadcasts, id) => broadcasts.filter((b) => b.room === roomOf(id) && b.event === 'stage_cover');

async function createEvent(interactionMode) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, category,
             status, provider, interaction_mode, agora_channel_name)
          VALUES (?, ?, ?, ?, ?, 'free', 'charla', 'active', 'agora', ?, ?)`,
    args: [id, `Portadas ${interactionMode}`, `portadas-${interactionMode}-${id.slice(0, 8)}`,
      new Date().toISOString(), hostId, interactionMode, `event-${id}`],
  });
  return id;
}

const hostSession = (eventId) => ({ eventId, hostToken: tokenFor(hostId, HOST_EMAIL, 'seller') });

async function viewerSession(eventId, label) {
  const { attendee, accessToken } = await createVerifiedAttendee(eventId, {
    first_name: 'Vera', last_name: label, email: `cover-viewer-${label}-${randomUUID().slice(0, 6)}@test.com`,
  });
  return { eventId, attendeeId: attendee.id, accessToken };
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [ADMIN_EMAIL, hash, 'Ada Entrevistadora'],
  });
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [HOST_EMAIL, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
  broadcastId = await createEvent('broadcast');
  meetingId = await createEvent('meeting');
});

describe('who may set the cover', () => {
  it('the host puts one up and the whole room gets the echo', async () => {
    const { connect, broadcasts, helpers } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(broadcastId));

    host.send('stage_cover', { cover: 'intermedio' });

    expect(coverEchoes(broadcasts, broadcastId).map((b) => b.payload)).toEqual([{ cover: 'intermedio' }]);
    expect(helpers.getStageState(broadcastId).cover).toBe('intermedio');
  });

  it('the co-presenter changes it and takes it down', async () => {
    const { connect, broadcasts, helpers } = createFakeServer();
    const { attendee, accessToken } = await eventService.createOrGetStaffAttendee(broadcastId, {
      email: ADMIN_EMAIL, fullName: 'Ada Entrevistadora',
    });
    const admin = connect();
    const ack = await admin.joinRoom({ eventId: broadcastId, attendeeId: attendee.id, accessToken });
    expect(ack.presence.find((p) => p.identity === ack.identity).coHost).toBe(true);

    admin.send('stage_cover', { cover: 'final' });
    admin.send('stage_cover', { cover: null });

    expect(coverEchoes(broadcasts, broadcastId).map((b) => b.payload)).toEqual([{ cover: 'final' }, { cover: null }]);
    expect(helpers.getStageState(broadcastId).cover).toBeNull();
  });

  it('ignores an attendee and a promoted speaker without emitting', async () => {
    const { connect, broadcasts, helpers } = createFakeServer();
    const viewer = connect();
    await viewer.joinRoom(await viewerSession(broadcastId, 'plain'));
    const promoted = await viewerSession(broadcastId, 'promoted');
    await db.execute({ sql: 'UPDATE event_attendees SET speaker_granted = 1 WHERE id = ?', args: [promoted.attendeeId] });
    const speaker = connect();
    await speaker.joinRoom(promoted);

    viewer.send('stage_cover', { cover: 'inicio' });
    speaker.send('stage_cover', { cover: 'inicio' });

    expect(coverEchoes(broadcasts, broadcastId)).toHaveLength(0);
    expect(helpers.getStageState(broadcastId).cover).toBeNull();
  });

  it('ignores an unknown cover', async () => {
    const { connect, broadcasts, helpers } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(broadcastId));

    host.send('stage_cover', { cover: 'descanso' });
    host.send('stage_cover', { cover: '__proto__' });

    expect(coverEchoes(broadcasts, broadcastId)).toHaveLength(0);
    expect(helpers.getStageState(broadcastId).cover).toBeNull();
  });

  it('ignores the host of a meeting: covers exist only on a broadcast stage', async () => {
    const { connect, broadcasts, helpers } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(meetingId));

    host.send('stage_cover', { cover: 'inicio' });

    expect(coverEchoes(broadcasts, meetingId)).toHaveLength(0);
    expect(helpers.getStageState(meetingId).cover).toBeNull();
  });
});

describe('lifecycle', () => {
  it('a late joiner gets the current cover in the ACK', async () => {
    const { connect } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(broadcastId));
    host.send('stage_cover', { cover: 'intermedio' });

    const ack = await connect().joinRoom(await viewerSession(broadcastId, 'late'));

    expect(ack.stageCover).toBe('intermedio');
  });

  it('the ACK says null with no cover up', async () => {
    const { connect } = createFakeServer();
    const ack = await connect().joinRoom(await viewerSession(broadcastId, 'nocover'));
    expect(ack.stageCover).toBeNull();
  });

  it('the end of the event drops it', async () => {
    const { connect, helpers } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(broadcastId));
    host.send('stage_cover', { cover: 'final' });

    helpers.broadcastEventEnded(broadcastId);

    expect(helpers.getStageState(broadcastId)).toEqual({ screenSharing: false, cover: null });
  });

  it('setStageCover puts one up from the server and tells the room', async () => {
    const { helpers, broadcasts } = createFakeServer();

    helpers.setStageCover(broadcastId, 'inicio');

    expect(helpers.getStageState(broadcastId).cover).toBe('inicio');
    expect(coverEchoes(broadcasts, broadcastId).map((b) => b.payload)).toEqual([{ cover: 'inicio' }]);
  });

  it('getStageState reports the shared screen next to the cover', async () => {
    const { connect, helpers } = createFakeServer();
    const host = connect();
    await host.joinRoom(hostSession(broadcastId));
    host.send('screen_share', { active: true });
    host.send('stage_cover', { cover: 'intermedio' });

    expect(helpers.getStageState(broadcastId)).toEqual({ screenSharing: true, cover: 'intermedio' });
  });
});
