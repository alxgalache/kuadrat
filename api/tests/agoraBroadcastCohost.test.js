/**
 * The admin as co-presenter of Agora broadcast events
 * (Change: agora-interview-cohost).
 *
 * Covers the token endpoints (publisher role + `coHost` flag, derived from
 * is_staff AND the user's CURRENT admin role), the hardened host JWT branch of
 * renew-token, the host-only screen-token for the second RTC client, and the
 * refusal to moderate staff — a demote on the co-presenter would create a 24 h
 * Agora kicking rule and leave the interviewer unable to publish.
 *
 * .env.test carries no Agora credentials, so token generation and the kicking
 * rule REST calls are spied on: the fake token encodes `rtc-<uid>-<role>`,
 * which is exactly what these tests need to assert.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const agoraService = require('../services/agoraService');

const stamp = Date.now();
const ADMIN_EMAIL = `cohost-admin${stamp}@test.com`;
const FORMER_ADMIN_EMAIL = `cohost-former${stamp}@test.com`;
const HOST_EMAIL = `cohost-host${stamp}@test.com`;
const OTHER_SELLER_EMAIL = `cohost-seller${stamp}@test.com`;

let adminToken;
let formerAdminId;
let formerAdminToken;
let hostId;
let hostToken;
let otherSellerToken;

let broadcastEventId;
let meetingEventId;
let livekitEventId;
let scheduledBroadcastEventId;

let tokenSpy;
let banSpy;
let liftSpy;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function createUser(email, role, fullName, hash) {
  const result = await db.execute({
    sql: 'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
    args: [email, hash, role, fullName],
  });
  return Number(result.lastInsertRowid);
}

async function createEvent({ provider = 'agora', mode = 'broadcast', status = 'active' } = {}) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, provider, interaction_mode, agora_channel_name, livekit_room_name)
          VALUES (?, ?, ?, ?, ?, 'free', NULL, 'charla', ?, ?, ?, ?, ?)`,
    args: [
      id,
      `Entrevista ${id.slice(0, 8)}`,
      `entrevista-${id.slice(0, 8)}`,
      new Date().toISOString(),
      hostId,
      status,
      provider,
      mode,
      provider === 'agora' ? `event-${id}` : null,
      provider === 'livekit' ? `room-${id.slice(0, 8)}` : null,
    ],
  });
  return id;
}

const adminAccess = (eventId, token = adminToken) =>
  request(app).post(`/api/events/${eventId}/admin-access`).set('Authorization', `Bearer ${token}`);

const viewerToken = (eventId, { attendeeId, accessToken }) =>
  request(app).post(`/api/events/${eventId}/token`).send({ attendeeId, accessToken });

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);

  const adminId = await createUser(ADMIN_EMAIL, 'admin', 'Ada Entrevistadora', hash);
  adminToken = tokenFor(adminId, ADMIN_EMAIL, 'admin');

  formerAdminId = await createUser(FORMER_ADMIN_EMAIL, 'admin', 'Fede Exadmin', hash);
  formerAdminToken = tokenFor(formerAdminId, FORMER_ADMIN_EMAIL, 'admin');

  hostId = await createUser(HOST_EMAIL, 'seller', 'Hugo Host', hash);
  hostToken = tokenFor(hostId, HOST_EMAIL, 'seller');

  const otherSellerId = await createUser(OTHER_SELLER_EMAIL, 'seller', 'Sara Seller', hash);
  otherSellerToken = tokenFor(otherSellerId, OTHER_SELLER_EMAIL, 'seller');

  broadcastEventId = await createEvent();
  meetingEventId = await createEvent({ mode: 'meeting' });
  livekitEventId = await createEvent({ provider: 'livekit' });
  scheduledBroadcastEventId = await createEvent({ status: 'scheduled' });

  tokenSpy = jest
    .spyOn(agoraService, 'generateRtcToken')
    .mockImplementation(({ uid, role }) => `rtc-${uid}-${role}`);
  banSpy = jest.spyOn(agoraService, 'banPublish').mockResolvedValue('rule-id');
  liftSpy = jest.spyOn(agoraService, 'liftPublishBan').mockResolvedValue(false);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('co-presenter token (POST /api/events/:id/token)', () => {
  it('gives the admin a publisher token on their own attendee uid in a broadcast event', async () => {
    const access = await adminAccess(broadcastEventId);
    const res = await viewerToken(broadcastEventId, access.body);

    expect(res.statusCode).toBe(200);
    expect(res.body.coHost).toBe(true);
    expect(res.body.uid).toBeGreaterThanOrEqual(101);
    expect(res.body.rtcToken).toBe(`rtc-${res.body.uid}-publisher`);
  });

  it('falls back to subscriber once the staff user is no longer an admin', async () => {
    const access = await adminAccess(broadcastEventId, formerAdminToken);
    await db.execute({ sql: "UPDATE users SET role = 'seller' WHERE id = ?", args: [formerAdminId] });

    const res = await viewerToken(broadcastEventId, access.body);

    expect(res.statusCode).toBe(200);
    expect(res.body.coHost).toBe(false);
    expect(res.body.rtcToken).toBe(`rtc-${res.body.uid}-subscriber`);
  });

  it('is not a co-presenter in a meeting event (publisher like everyone there)', async () => {
    const access = await adminAccess(meetingEventId);
    const res = await viewerToken(meetingEventId, access.body);

    expect(res.statusCode).toBe(200);
    expect(res.body.coHost).toBe(false);
    expect(res.body.rtcToken).toBe(`rtc-${res.body.uid}-publisher`);
  });

  it('keeps an ordinary attendee as subscriber', async () => {
    const { attendee, accessToken } = await eventService.registerAttendee(broadcastEventId, {
      first_name: 'Olga',
      last_name: 'Oyente',
      email: `cohost-viewer${stamp}@test.com`,
    });

    const res = await viewerToken(broadcastEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.coHost).toBe(false);
    expect(res.body.rtcToken).toBe(`rtc-${res.body.uid}-subscriber`);
  });
});

describe('POST /api/events/:id/renew-token', () => {
  it('keeps the co-presenter as publisher on renewal', async () => {
    const access = await adminAccess(broadcastEventId);
    const first = await viewerToken(broadcastEventId, access.body);

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/renew-token`)
      .send({ attendeeId: access.body.attendeeId, accessToken: access.body.accessToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.coHost).toBe(true);
    expect(res.body.role).toBe('publisher');
    expect(res.body.uid).toBe(first.body.uid);
  });

  it('refuses a HOST_UID token to an admin who is not the host', async () => {
    const callsBefore = tokenSpy.mock.calls.length;

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/renew-token`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.statusCode).toBe(403);
    expect(tokenSpy.mock.calls.length).toBe(callsBefore);
  });

  it('still renews the host on uid 1', async () => {
    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/renew-token`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.uid).toBe(agoraService.HOST_UID);
    expect(res.body.rtcToken).toBe(`rtc-${agoraService.HOST_UID}-publisher`);
  });
});

describe('POST /api/events/:id/screen-token', () => {
  const screenToken = (eventId, token) => {
    const req = request(app).post(`/api/events/${eventId}/screen-token`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('gives the host a publisher token on the reserved screen uid', async () => {
    const res = await screenToken(broadcastEventId, hostToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.uid).toBe(2);
    expect(res.body.uid).toBe(agoraService.HOST_SCREEN_UID);
    expect(res.body.rtcToken).toBe('rtc-2-publisher');
  });

  it('refuses an admin who is not the host', async () => {
    const res = await screenToken(broadcastEventId, adminToken);
    expect(res.statusCode).toBe(403);
  });

  it('refuses a seller who is not the host', async () => {
    const res = await screenToken(broadcastEventId, otherSellerToken);
    expect(res.statusCode).toBe(403);
  });

  it('refuses a meeting event, which keeps swapping camera and screen', async () => {
    const res = await screenToken(meetingEventId, hostToken);
    expect(res.statusCode).toBe(400);
  });

  it('refuses a LiveKit event', async () => {
    const res = await screenToken(livekitEventId, hostToken);
    expect(res.statusCode).toBe(400);
  });

  it('refuses an event that is not active', async () => {
    const res = await screenToken(scheduledBroadcastEventId, hostToken);
    expect(res.statusCode).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await screenToken(broadcastEventId, null);
    expect(res.statusCode).toBe(401);
  });
});

describe('staff are never moderation targets', () => {
  let staffAttendeeId;
  let staffIdentity;
  let viewer;

  beforeAll(async () => {
    const access = await adminAccess(broadcastEventId);
    staffAttendeeId = access.body.attendeeId;
    staffIdentity = `viewer-${staffAttendeeId}`;
    // Assigns the agora uid, so a demote WOULD reach banPublish without the guard
    await viewerToken(broadcastEventId, access.body);

    viewer = await eventService.registerAttendee(broadcastEventId, {
      first_name: 'Rita',
      last_name: 'Reportera',
      email: `cohost-reporter${stamp}@test.com`,
    });
  });

  const attendeeRow = async (id) =>
    (await db.execute({ sql: 'SELECT * FROM event_attendees WHERE id = ?', args: [id] })).rows[0];

  it('refuses to demote the co-presenter without creating a kicking rule', async () => {
    banSpy.mockClear();

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/participants/${staffIdentity}/demote`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.statusCode).toBe(400);
    expect(banSpy).not.toHaveBeenCalled();
    expect(Number((await attendeeRow(staffAttendeeId)).speaker_granted)).toBe(0);
  });

  it('refuses to promote the co-presenter', async () => {
    liftSpy.mockClear();

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/participants/${staffIdentity}/promote`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.statusCode).toBe(400);
    expect(liftSpy).not.toHaveBeenCalled();
    expect(Number((await attendeeRow(staffAttendeeId)).speaker_granted)).toBe(0);
  });

  it('refuses to ban the co-presenter from the chat', async () => {
    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/participants/${staffIdentity}/ban-from-chat`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.statusCode).toBe(400);
    expect(Number((await attendeeRow(staffAttendeeId)).chat_banned)).toBe(0);
  });

  it('refuses a spam report against the co-presenter without banning email or IP', async () => {
    const bansBefore = await db.execute({
      sql: 'SELECT COUNT(*) AS count FROM event_bans WHERE event_id = ?',
      args: [broadcastEventId],
    });

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/participants/${staffIdentity}/report-spam`)
      .send({ reporterAttendeeId: viewer.attendee.id, reporterAccessToken: viewer.accessToken });

    expect(res.statusCode).toBe(400);

    const bansAfter = await db.execute({
      sql: 'SELECT COUNT(*) AS count FROM event_bans WHERE event_id = ?',
      args: [broadcastEventId],
    });
    expect(Number(bansAfter.rows[0].count)).toBe(Number(bansBefore.rows[0].count));
    expect(Number((await attendeeRow(staffAttendeeId)).chat_banned)).toBe(0);
  });

  it('still lets the host demote an ordinary attendee (the guard is narrow)', async () => {
    await viewerToken(broadcastEventId, { attendeeId: viewer.attendee.id, accessToken: viewer.accessToken });
    banSpy.mockClear();

    const res = await request(app)
      .post(`/api/events/${broadcastEventId}/participants/viewer-${viewer.attendee.id}/demote`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.statusCode).toBe(200);
    expect(banSpy).toHaveBeenCalledTimes(1);
  });
});
