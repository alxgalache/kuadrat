/**
 * POST /api/events/:id/confirm-payment binds the PaymentIntent to what it
 * unlocks (Change: enforce-verification-gates).
 *
 * It used to check only `status === 'succeeded'`. Any paid intent on the
 * account — another event's, a shop order's — marked any attendee as paid,
 * and recorded event.price as amount_paid: eventCreditScheduler then credited
 * the host for money that never came in. Stripe is mocked; the database and
 * the whole Express stack are real.
 */

jest.mock('../services/stripeService');

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const emailService = require('../services/emailService');
const stripeService = require('../services/stripeService');
const { createVerifiedAttendee } = require('./helpers/eventAttendees');

const stamp = Date.now();
let hostId;
let eventId;
let otherEventId;

async function createPaidEvent(price = 10) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price, currency,
             category, status, livekit_room_name, provider)
          VALUES (?, ?, ?, ?, ?, 'paid', ?, 'EUR', 'charla', 'scheduled', ?, 'livekit')`,
    args: [id, `Pago ${id.slice(0, 8)}`, `pago-${id.slice(0, 8)}`, new Date().toISOString(), hostId, price, `room-${id}`],
  });
  return id;
}

const newAttendee = (targetEventId, label) => createVerifiedAttendee(targetEventId, {
  first_name: 'Paula', last_name: label, email: `pay-${label}-${randomUUID().slice(0, 8)}@test.com`,
});

/** A PaymentIntent exactly as /pay would have created it, with overrides. */
function paymentIntent({ attendeeId, forEventId = eventId, ...overrides }) {
  return {
    id: `pi_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    status: 'succeeded',
    amount: 1000,
    amount_received: 1000,
    currency: 'eur',
    customer: 'cus_test',
    metadata: { type: 'event', event_id: forEventId, attendee_id: attendeeId },
    ...overrides,
  };
}

function confirm(targetEventId, attendeeId, pi) {
  stripeService.retrievePaymentIntent.mockResolvedValue(pi);
  return request(app)
    .post(`/api/events/${targetEventId}/confirm-payment`)
    .send({ attendeeId, paymentIntentId: pi.id });
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`pay-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
  eventId = await createPaidEvent(10);
  otherEventId = await createPaidEvent(5);
});

beforeEach(() => {
  emailService.__clearOutbox();
  stripeService.retrievePaymentIntent.mockReset();
});

describe('a PaymentIntent that does not match is refused', () => {
  const cases = [
    ['from another event', (id) => paymentIntent({ attendeeId: id, forEventId: otherEventId })],
    ['for another attendee', () => paymentIntent({ attendeeId: randomUUID() })],
    ['from a shop order', (id) => paymentIntent({ attendeeId: id, metadata: { order_id: '1042' } })],
    ['with a smaller amount', (id) => paymentIntent({ attendeeId: id, amount: 500, amount_received: 500 })],
    ['in another currency', (id) => paymentIntent({ attendeeId: id, currency: 'usd' })],
  ];

  it.each(cases)('%s → 400 PAYMENT_MISMATCH, attendee stays unpaid', async (label, build) => {
    const { attendee } = await newAttendee(eventId, label.replace(/\s+/g, '-'));

    const res = await confirm(eventId, attendee.id, build(attendee.id));

    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('PAYMENT_MISMATCH');
    const row = await eventService.getAttendeeById(attendee.id);
    expect(row.status).toBe('registered');
    expect(row.stripe_payment_intent_id).toBeNull();
  });

  it('an intent that has not succeeded → 400 PAYMENT_NOT_SUCCEEDED', async () => {
    const { attendee } = await newAttendee(eventId, 'processing');

    const res = await confirm(eventId, attendee.id, paymentIntent({ attendeeId: attendee.id, status: 'processing' }));

    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('PAYMENT_NOT_SUCCEEDED');
  });

  it('an unverified attendee → 403 EMAIL_NOT_VERIFIED, Stripe never asked', async () => {
    const { attendee } = await eventService.registerAttendee(eventId, {
      first_name: 'Nico', last_name: 'Noverificado', email: `pay-unverified-${randomUUID().slice(0, 8)}@test.com`,
    });

    const res = await confirm(eventId, attendee.id, paymentIntent({ attendeeId: attendee.id }));

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('EMAIL_NOT_VERIFIED');
    expect(stripeService.retrievePaymentIntent).not.toHaveBeenCalled();
  });
});

describe('a matching PaymentIntent', () => {
  it('marks the attendee paid with what was actually charged, once', async () => {
    const { attendee } = await newAttendee(eventId, 'happy');
    const pi = paymentIntent({ attendeeId: attendee.id });

    const res = await confirm(eventId, attendee.id, pi);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessPassword).toMatch(/^[A-Z2-9]{6}$/);
    const row = await eventService.getAttendeeById(attendee.id);
    expect(row.status).toBe('paid');
    expect(row.stripe_payment_intent_id).toBe(pi.id);
    expect(Number(row.amount_paid)).toBe(10);
    expect(emailService.__getOutbox()).toHaveLength(1);
  });

  it('a retry with the same intent answers 200 with the same password and sends nothing', async () => {
    const { attendee } = await newAttendee(eventId, 'retry');
    const pi = paymentIntent({ attendeeId: attendee.id });
    const first = await confirm(eventId, attendee.id, pi);
    emailService.__clearOutbox();

    const second = await confirm(eventId, attendee.id, pi);

    expect(second.statusCode).toBe(200);
    expect(second.body.accessPassword).toBe(first.body.accessPassword);
    expect(emailService.__getOutbox()).toHaveLength(0);
  });

  it('an intent already recorded against another attendee → 409 PAYMENT_ALREADY_USED', async () => {
    const { attendee: holder } = await newAttendee(eventId, 'holder');
    const { attendee: claimant } = await newAttendee(eventId, 'claimant');
    const pi = paymentIntent({ attendeeId: claimant.id });
    await db.execute({
      sql: 'UPDATE event_attendees SET stripe_payment_intent_id = ? WHERE id = ?',
      args: [pi.id, holder.id],
    });

    const res = await confirm(eventId, claimant.id, pi);

    expect(res.statusCode).toBe(409);
    expect(res.body.title).toBe('PAYMENT_ALREADY_USED');
  });
});

describe('idx_event_attendees_stripe_pi', () => {
  it('refuses a second row with the same PaymentIntent', async () => {
    const { attendee: a } = await newAttendee(eventId, 'idx-a');
    const { attendee: b } = await newAttendee(eventId, 'idx-b');
    const piId = `pi_dup_${randomUUID().slice(0, 8)}`;

    await db.execute({ sql: 'UPDATE event_attendees SET stripe_payment_intent_id = ? WHERE id = ?', args: [piId, a.id] });

    await expect(db.execute({
      sql: 'UPDATE event_attendees SET stripe_payment_intent_id = ? WHERE id = ?',
      args: [piId, b.id],
    })).rejects.toThrow(/UNIQUE/i);
  });
});
