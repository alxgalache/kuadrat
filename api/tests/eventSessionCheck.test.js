/**
 * POST /api/events/:id/session — does the attendee session stored in the
 * browser still give access? (Change: enforce-verification-gates.)
 *
 * The event page used to claim «Ya tienes acceso» from the mere presence of
 * localStorage. A token the server no longer accepted — replaced from another
 * device, banned, never verified — left the attendee with no «Acceder» button
 * and a «Conectar al directo» that failed silently. The page now asks this
 * endpoint first, and each rejection carries a code the client explains.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const { createVerifiedAttendee } = require('./helpers/eventAttendees');
const { sha256 } = require('../utils/emailOtp');

const stamp = Date.now();
let hostId;
let freeEventId;
let paidEventId;

async function createEvent(accessType) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, livekit_room_name, provider)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'charla', 'scheduled', ?, 'livekit')`,
    args: [
      id, `Sesión ${id.slice(0, 8)}`, `sesion-${id.slice(0, 8)}`, new Date().toISOString(),
      hostId, accessType, accessType === 'paid' ? 10 : null, `room-${id}`,
    ],
  });
  return id;
}

const emailFor = (label) => `session-${label}-${randomUUID().slice(0, 8)}@test.com`;

const checkSession = (eventId, body) =>
  request(app).post(`/api/events/${eventId}/session`).send(body);

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`session-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
  freeEventId = await createEvent('free');
  paidEventId = await createEvent('paid');
});

describe('POST /api/events/:id/session', () => {
  it('grants a verified, unbanned session and writes nothing', async () => {
    const { attendee, accessToken } = await createVerifiedAttendee(freeEventId, {
      first_name: 'Vera', last_name: 'Válida', email: emailFor('ok'),
    });

    const res = await checkSession(freeEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.access).toBe('granted');
    const row = await eventService.getAttendeeById(attendee.id);
    expect(row.status).toBe('registered');
  });

  it('SESSION_INVALID for an attendee id that is not in this event', async () => {
    const res = await checkSession(freeEventId, { attendeeId: randomUUID(), accessToken: 'x'.repeat(64) });
    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('SESSION_INVALID');
  });

  it('SESSION_REPLACED once the token was rotated by a login elsewhere', async () => {
    const email = emailFor('replaced');
    const { attendee, accessToken } = await createVerifiedAttendee(freeEventId, {
      first_name: 'Rosa', last_name: 'Rotada', email,
    });
    // The helper verifies at service level; the password is the controller's
    // job, so give the row one here. «Acceder con contraseña» on another
    // device then issues a new token.
    await eventService.setAttendeePassword(attendee.id, 'ABC234');
    const login = await eventService.verifyAttendeePassword(freeEventId, email, 'ABC234');
    expect(login.found).toBe(true);

    const res = await checkSession(freeEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('SESSION_REPLACED');
  });

  it('SESSION_UNVERIFIED for a token on a row that never verified', async () => {
    const { attendee } = await eventService.registerAttendee(freeEventId, {
      first_name: 'Ulises', last_name: 'Unverified', email: emailFor('unverified'),
    });
    const accessToken = randomUUID().replace(/-/g, '');
    await db.execute({
      sql: 'UPDATE event_attendees SET access_token_hash = ? WHERE id = ?',
      args: [sha256(accessToken), attendee.id],
    });

    const res = await checkSession(freeEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('SESSION_UNVERIFIED');
  });

  it('SESSION_BANNED for an attendee whose email is banned from the event', async () => {
    const email = emailFor('banned');
    const { attendee, accessToken } = await createVerifiedAttendee(freeEventId, {
      first_name: 'Beto', last_name: 'Baneado', email,
    });
    await db.execute({
      sql: 'INSERT INTO event_bans (id, event_id, email, reason) VALUES (?, ?, ?, ?)',
      args: [randomUUID(), freeEventId, email, 'test'],
    });

    const res = await checkSession(freeEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('SESSION_BANNED');
  });

  it('SESSION_PAYMENT_REQUIRED for a verified attendee of a paid event who has not paid', async () => {
    const { attendee, accessToken } = await createVerifiedAttendee(paidEventId, {
      first_name: 'Pepa', last_name: 'Pendiente', email: emailFor('unpaid'),
    });

    const res = await checkSession(paidEventId, { attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('SESSION_PAYMENT_REQUIRED');
  });

  it('never answers 401, which the client treats as an expired login', async () => {
    const missing = await checkSession(freeEventId, {});
    const bogus = await checkSession(freeEventId, { attendeeId: 'nope', accessToken: 'nope' });

    expect(missing.statusCode).toBe(400);
    expect(bogus.statusCode).toBe(403);
  });
});
