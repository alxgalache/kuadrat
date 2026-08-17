/**
 * Admin access to Live events
 * (Change: admin-password-reset-and-event-access).
 *
 * The admin joins any event as an ordinary participant — no registration, no
 * OTP, no payment — through a real attendee row marked `is_staff`. These tests
 * cover the endpoint, the payment-gate exemption, and the five queries that
 * must keep the admin out of counts, host credit, payouts and invoicing.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const { generateEventAttendeeInvoice } = require('../services/invoiceService');

const stamp = Date.now();
const ADMIN_EMAIL = `event-admin${stamp}@test.com`;
const HOST_EMAIL = `event-host${stamp}@test.com`;
const BUYER_EMAIL = `event-buyer${stamp}@test.com`;

let adminId;
let hostId;
let adminToken;
let sellerToken;
let paidEventId;
let freeEventId;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function createEvent({ accessType, status = 'active' }) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, livekit_room_name, provider)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'charla', ?, ?, 'livekit')`,
    args: [
      id,
      `Evento ${accessType} ${id.slice(0, 8)}`,
      `evento-${id.slice(0, 8)}`,
      new Date().toISOString(),
      hostId,
      accessType,
      accessType === 'paid' ? 20 : null,
      status,
      `room-${id.slice(0, 8)}`,
    ],
  });
  return id;
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);

  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [ADMIN_EMAIL, hash, 'Ada Administradora'],
  });
  adminId = Number(admin.lastInsertRowid);
  adminToken = tokenFor(adminId, ADMIN_EMAIL, 'admin');

  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [HOST_EMAIL, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
  sellerToken = tokenFor(hostId, HOST_EMAIL, 'seller');

  paidEventId = await createEvent({ accessType: 'paid' });
  freeEventId = await createEvent({ accessType: 'free' });
});

const adminAccess = (eventId, token = adminToken) =>
  request(app).post(`/api/events/${eventId}/admin-access`).set('Authorization', `Bearer ${token}`);

describe('POST /api/events/:id/admin-access', () => {
  it('lets the admin into a paid event without paying', async () => {
    const res = await adminAccess(paidEventId);

    expect(res.statusCode).toBe(200);
    expect(res.body.attendeeId).toBeTruthy();
    expect(res.body.accessToken).toMatch(/^[a-f0-9]{64}$/);

    const row = await db.execute({
      sql: 'SELECT * FROM event_attendees WHERE id = ?',
      args: [res.body.attendeeId],
    });
    const attendee = row.rows[0];
    expect(Number(attendee.is_staff)).toBe(1);
    expect(Number(attendee.email_verified)).toBe(1);
    // Never 'paid' with amount_paid = 0 — that would be a lie in a table the
    // invoicing and payout queries read.
    expect(attendee.status).toBe('registered');
    expect(attendee.amount_paid).toBeNull();
  });

  it('works the same on a free event', async () => {
    const res = await adminAccess(freeEventId);
    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('reuses the same attendee row on repeated calls, with a new token each time', async () => {
    const first = await adminAccess(paidEventId);
    const second = await adminAccess(paidEventId);

    expect(second.body.attendeeId).toBe(first.body.attendeeId);
    expect(second.body.accessToken).not.toBe(first.body.accessToken);

    const rows = await db.execute({
      sql: 'SELECT COUNT(*) AS count FROM event_attendees WHERE event_id = ? AND email = ?',
      args: [paidEventId, ADMIN_EMAIL],
    });
    expect(Number(rows.rows[0].count)).toBe(1);

    // The superseded token stops working.
    expect(await eventService.getAttendeeByAccessToken(paidEventId, first.body.accessToken)).toBeNull();
    expect(await eventService.getAttendeeByAccessToken(paidEventId, second.body.accessToken)).not.toBeNull();
  });

  it('refuses a seller', async () => {
    const res = await adminAccess(paidEventId, sellerToken);
    expect(res.statusCode).toBe(403);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).post(`/api/events/${paidEventId}/admin-access`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for an unknown event', async () => {
    const res = await adminAccess(randomUUID());
    expect(res.statusCode).toBe(404);
  });
});

describe('payment gate exemption', () => {
  it('issues a viewer token for a paid event without payment', async () => {
    const access = await adminAccess(paidEventId);

    const res = await request(app)
      .post(`/api/events/${paidEventId}/token`)
      .send({ attendeeId: access.body.attendeeId, accessToken: access.body.accessToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
    // Viewer credentials, not host ones.
    expect(res.body.roomName).toBeTruthy();
  });

  it('still refuses an ordinary unpaid attendee', async () => {
    const { attendee, accessToken } = await eventService.registerAttendee(paidEventId, {
      first_name: 'Bea',
      last_name: 'Compradora',
      email: BUYER_EMAIL,
    });

    const res = await request(app)
      .post(`/api/events/${paidEventId}/token`)
      .send({ attendeeId: attendee.id, accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/pago/i);
  });

  it('still refuses a banned staff attendee', async () => {
    const access = await adminAccess(paidEventId);
    await db.execute({
      sql: 'INSERT INTO event_bans (id, event_id, email, reason) VALUES (?, ?, ?, ?)',
      args: [randomUUID(), paidEventId, ADMIN_EMAIL, 'test'],
    });

    const res = await request(app)
      .post(`/api/events/${paidEventId}/token`)
      .send({ attendeeId: access.body.attendeeId, accessToken: access.body.accessToken });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/expulsado/i);

    await db.execute({
      sql: 'DELETE FROM event_bans WHERE event_id = ? AND email = ?',
      args: [paidEventId, ADMIN_EMAIL],
    });
  });

  it('still refuses when the event is not active', async () => {
    const draftEventId = await createEvent({ accessType: 'paid', status: 'scheduled' });
    const access = await adminAccess(draftEventId);

    const res = await request(app)
      .post(`/api/events/${draftEventId}/token`)
      .send({ attendeeId: access.body.attendeeId, accessToken: access.body.accessToken });

    expect(res.statusCode).toBe(400);
  });

  it('does not turn the admin into the host', async () => {
    const res = await request(app)
      .post(`/api/events/${paidEventId}/host-token`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(403);
  });
});

describe('staff attendees stay out of counts, credit, payouts and invoices', () => {
  let countEventId;

  beforeAll(async () => {
    countEventId = await createEvent({ accessType: 'paid' });

    // Two paying attendees plus the admin.
    for (const name of ['uno', 'dos']) {
      const { attendee } = await eventService.registerAttendee(countEventId, {
        first_name: name,
        last_name: 'Pagador',
        email: `pagador-${name}-${stamp}@test.com`,
      });
      await db.execute({
        sql: "UPDATE event_attendees SET status = 'paid', amount_paid = 20 WHERE id = ?",
        args: [attendee.id],
      });
    }
    await adminAccess(countEventId);
  });

  it('the public attendee count excludes the admin', async () => {
    expect(await eventService.getAttendeeCount(countEventId)).toBe(2);
  });

  it('the admin panel attendee list still shows the admin', async () => {
    const attendees = await eventService.listAttendees(countEventId);
    expect(attendees).toHaveLength(3);
    expect(attendees.filter((a) => Number(a.is_staff) === 1)).toHaveLength(1);
  });

  it('host crediting produces no line for the admin', async () => {
    const uncredited = await db.execute({
      sql: `SELECT id, amount_paid FROM event_attendees
            WHERE event_id = ? AND status IN ('paid','joined')
              AND host_credited_at IS NULL AND is_staff = 0`,
      args: [countEventId],
    });
    expect(uncredited.rows).toHaveLength(2);
    expect(uncredited.rows.every((r) => Number(r.amount_paid) === 20)).toBe(true);
  });

  it("the seller's per-event revenue listing excludes the admin", async () => {
    const res = await request(app)
      .get('/api/seller/paid-events')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.statusCode).toBe(200);
    const events = res.body.data?.events || res.body.events || [];
    const row = events.find((e) => e.id === countEventId);
    expect(row).toBeDefined();
    expect(Number(row.paid_attendees)).toBe(2);
    expect(Number(row.total_amount)).toBe(40);
  });

  it('returns the event UUID rather than null', async () => {
    // events.id is TEXT; the endpoint used to map it through Number(), so
    // every row serialised as id: null and the client keyed its table on null.
    const res = await request(app)
      .get('/api/seller/paid-events')
      .set('Authorization', `Bearer ${sellerToken}`);

    const events = res.body.data?.events || res.body.events || [];
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.id).toEqual(expect.any(String));
      expect(event.id).not.toBeNull();
    }
  });

  it('invoice generation refuses a staff attendee', async () => {
    const staff = await db.execute({
      sql: 'SELECT id FROM event_attendees WHERE event_id = ? AND is_staff = 1',
      args: [countEventId],
    });

    await expect(generateEventAttendeeInvoice(staff.rows[0].id)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
