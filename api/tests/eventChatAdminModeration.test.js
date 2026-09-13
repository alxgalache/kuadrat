/**
 * The admin bans from the event chat exactly like the host
 * (Change: live-event-mobile-layout, capability event-chat-admin-moderation).
 *
 * `ban-from-chat` already authorised any user whose CURRENT role is admin —
 * the gap was the client, which only drew the message menu for the host. These
 * tests pin the server contract that menu relies on: host or current admin, the
 * same guards for both, and a trace of who acted.
 *
 * No Agora or LiveKit credential is involved: the socket notification and the
 * LiveKit permission call are spied on.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const logger = require('../config/logger');
const eventService = require('../services/eventService');
const livekitService = require('../services/livekitService');

const stamp = Date.now();
const ADMIN_EMAIL = `chatmod-admin${stamp}@test.com`;
const HOST_EMAIL = `chatmod-host${stamp}@test.com`;
const ADMIN_HOST_EMAIL = `chatmod-adminhost${stamp}@test.com`;
const SELLER_EMAIL = `chatmod-seller${stamp}@test.com`;
const FORMER_ADMIN_EMAIL = `chatmod-former${stamp}@test.com`;

let adminId;
let adminToken;
let hostId;
let hostToken;
let adminHostId;
let adminHostToken;
let sellerToken;
let formerAdminToken;

let broadcastEventId;
let meetingEventId;
let livekitEventId;
let adminHostedEventId;

let notifySpy;
let livekitSpy;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function createUser(email, role, fullName, hash) {
  const result = await db.execute({
    sql: 'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
    args: [email, hash, role, fullName],
  });
  return Number(result.lastInsertRowid);
}

async function createEvent({ provider = 'agora', mode = 'broadcast', host = hostId } = {}) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, provider, interaction_mode, agora_channel_name, livekit_room_name)
          VALUES (?, ?, ?, ?, ?, 'free', NULL, 'charla', 'active', ?, ?, ?, ?)`,
    args: [
      id,
      `Charla ${id.slice(0, 8)}`,
      `charla-${id.slice(0, 8)}`,
      new Date().toISOString(),
      host,
      provider,
      mode,
      provider === 'agora' ? `event-${id}` : null,
      provider === 'livekit' ? `room-${id.slice(0, 8)}` : null,
    ],
  });
  return id;
}

async function newAttendee(eventId, label) {
  const { attendee } = await eventService.registerAttendee(eventId, {
    first_name: 'Pablo',
    last_name: label,
    email: `chatmod-${label}-${randomUUID().slice(0, 8)}@test.com`,
  });
  return attendee;
}

const chatBanned = async (attendeeId) => {
  const result = await db.execute({
    sql: 'SELECT chat_banned FROM event_attendees WHERE id = ?',
    args: [attendeeId],
  });
  return Number(result.rows[0].chat_banned);
};

const ban = (eventId, attendeeId, token) => {
  const req = request(app).post(`/api/events/${eventId}/participants/viewer-${attendeeId}/ban-from-chat`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);

  adminId = await createUser(ADMIN_EMAIL, 'admin', 'Ada Moderadora', hash);
  adminToken = tokenFor(adminId, ADMIN_EMAIL, 'admin');

  hostId = await createUser(HOST_EMAIL, 'seller', 'Hugo Host', hash);
  hostToken = tokenFor(hostId, HOST_EMAIL, 'seller');

  adminHostId = await createUser(ADMIN_HOST_EMAIL, 'admin', 'Alba Anfitriona', hash);
  adminHostToken = tokenFor(adminHostId, ADMIN_HOST_EMAIL, 'admin');

  const sellerId = await createUser(SELLER_EMAIL, 'seller', 'Sara Seller', hash);
  sellerToken = tokenFor(sellerId, SELLER_EMAIL, 'seller');

  // Signed while still admin, demoted afterwards: passport reads the row
  const formerAdminId = await createUser(FORMER_ADMIN_EMAIL, 'admin', 'Fede Exadmin', hash);
  formerAdminToken = tokenFor(formerAdminId, FORMER_ADMIN_EMAIL, 'admin');
  await db.execute({ sql: "UPDATE users SET role = 'seller' WHERE id = ?", args: [formerAdminId] });

  broadcastEventId = await createEvent();
  meetingEventId = await createEvent({ mode: 'meeting' });
  livekitEventId = await createEvent({ provider: 'livekit' });
  adminHostedEventId = await createEvent({ host: adminHostId });

  notifySpy = jest.spyOn(app.get('eventSocket'), 'notifyChatBanned');
  livekitSpy = jest.spyOn(livekitService, 'updateParticipantPermissions').mockResolvedValue(undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('an admin who is not the host', () => {
  it('bans an ordinary attendee from an Agora broadcast chat', async () => {
    const attendee = await newAttendee(broadcastEventId, 'broadcast');
    notifySpy.mockClear();

    const res = await ban(broadcastEventId, attendee.id, adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await chatBanned(attendee.id)).toBe(1);
    expect(notifySpy).toHaveBeenCalledWith(broadcastEventId, `viewer-${attendee.id}`);
  });

  it('bans an attendee from an Agora meeting chat', async () => {
    const attendee = await newAttendee(meetingEventId, 'meeting');
    notifySpy.mockClear();

    const res = await ban(meetingEventId, attendee.id, adminToken);

    expect(res.statusCode).toBe(200);
    expect(await chatBanned(attendee.id)).toBe(1);
    expect(notifySpy).toHaveBeenCalledWith(meetingEventId, `viewer-${attendee.id}`);
  });

  it('bans an attendee from a LiveKit chat by revoking canPublishData', async () => {
    const attendee = await newAttendee(livekitEventId, 'livekit');
    livekitSpy.mockClear();
    notifySpy.mockClear();

    const res = await ban(livekitEventId, attendee.id, adminToken);

    expect(res.statusCode).toBe(200);
    expect(await chatBanned(attendee.id)).toBe(1);
    expect(livekitSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^room-/),
      `viewer-${attendee.id}`,
      expect.objectContaining({ canPublishData: false }),
    );
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('answers alreadyBanned on a second ban', async () => {
    const attendee = await newAttendee(broadcastEventId, 'twice');
    await ban(broadcastEventId, attendee.id, adminToken);

    const res = await ban(broadcastEventId, attendee.id, adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyBanned).toBe(true);
  });

  it('cannot ban a member of the staff', async () => {
    const { attendee: staff } = await eventService.createOrGetStaffAttendee(meetingEventId, {
      email: `chatmod-staff${stamp}@test.com`,
      fullName: 'Otro Admin',
    });

    const res = await ban(meetingEventId, staff.id, adminToken);

    expect(res.statusCode).toBe(400);
    expect(await chatBanned(staff.id)).toBe(0);
  });

  it('leaves a trace with actorRole admin', async () => {
    const attendee = await newAttendee(broadcastEventId, 'trace');
    const infoSpy = jest.spyOn(logger, 'info');

    await ban(broadcastEventId, attendee.id, adminToken);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: broadcastEventId,
        identity: `viewer-${attendee.id}`,
        actorUserId: adminId,
        actorRole: 'admin',
      }),
      expect.any(String),
    );
    infoSpy.mockRestore();
  });
});

describe('everyone else', () => {
  it('still lets the host ban, traced as host', async () => {
    const attendee = await newAttendee(broadcastEventId, 'host');
    const infoSpy = jest.spyOn(logger, 'info');

    const res = await ban(broadcastEventId, attendee.id, hostToken);

    expect(res.statusCode).toBe(200);
    expect(await chatBanned(attendee.id)).toBe(1);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: hostId, actorRole: 'host' }),
      expect.any(String),
    );
    infoSpy.mockRestore();
  });

  it('traces a host whose account is also admin as host', async () => {
    const attendee = await newAttendee(adminHostedEventId, 'adminhost');
    const infoSpy = jest.spyOn(logger, 'info');

    const res = await ban(adminHostedEventId, attendee.id, adminHostToken);

    expect(res.statusCode).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: adminHostId, actorRole: 'host' }),
      expect.any(String),
    );
    infoSpy.mockRestore();
  });

  it('refuses a seller who is not the host', async () => {
    const attendee = await newAttendee(broadcastEventId, 'seller');

    const res = await ban(broadcastEventId, attendee.id, sellerToken);

    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).toContain('Solo el host o un administrador pueden expulsar del chat');
    expect(await chatBanned(attendee.id)).toBe(0);
  });

  it('refuses a JWT that says admin once the account no longer is', async () => {
    const attendee = await newAttendee(broadcastEventId, 'former');

    const res = await ban(broadcastEventId, attendee.id, formerAdminToken);

    expect(res.statusCode).toBe(403);
    expect(await chatBanned(attendee.id)).toBe(0);
  });

  it('refuses an unauthenticated caller', async () => {
    const attendee = await newAttendee(broadcastEventId, 'anon');

    const res = await ban(broadcastEventId, attendee.id, null);

    expect(res.statusCode).toBe(401);
    expect(await chatBanned(attendee.id)).toBe(0);
  });
});
