/**
 * Event registration: the access credential is born in email verification,
 * and nothing accepts it before (Change: enforce-verification-gates).
 *
 * The bug this pins down: POST /register used to return the access token in
 * its first step. The client stored it before the OTP, reloading showed «Ya
 * tienes acceso», and — worse — the token really worked: /token handed a free
 * event's room to anyone who had typed an email, verified or not.
 *
 * Also covered here: the capacity rules (only verified attendees hold a seat,
 * checked atomically at verification), the attempt cap and resend cooldown,
 * and two grep-based regression guards.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const emailService = require('../services/emailService');
const setupEventSocket = require('../socket/eventSocket');
const { sha256 } = require('../utils/emailOtp');

const stamp = Date.now();
let hostId;

async function createEvent({
  accessType = 'free', status = 'active', maxAttendees = null, format = 'live', price = null,
} = {}) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, livekit_room_name, provider, max_attendees, format, video_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'charla', ?, ?, 'livekit', ?, ?, ?)`,
    args: [
      id, `Evento ${id.slice(0, 8)}`, `evento-${id.slice(0, 8)}`, new Date().toISOString(),
      hostId, accessType, price, status, `room-${id}`, maxAttendees, format,
      format === 'video' ? 'https://example.com/video.mp4' : null,
    ],
  });
  return id;
}

const emailFor = (label) => `reg-${label}-${randomUUID().slice(0, 8)}@test.com`;

function register(eventId, email, extra = {}) {
  return request(app)
    .post(`/api/events/${eventId}/register`)
    .send({ first_name: 'Ana', last_name: 'Asistente', email, ...extra });
}

/** Last 6-digit code emailed to `to`, read from the noop transport's outbox. */
function lastCodeSentTo(to) {
  const message = emailService.__getOutbox().filter((m) => m.to === to).pop();
  const match = message?.html?.match(/>(\d{6})<\/p>/);
  return match ? match[1] : null;
}

/** Let the next send through without waiting 30 real seconds. */
async function expireCooldown(attendeeId) {
  await db.execute({
    sql: "UPDATE event_attendees SET verification_sent_at = datetime('now', '-1 minute') WHERE id = ?",
    args: [attendeeId],
  });
}

/** register → send-verification → verify-email, all over HTTP. */
async function registerAndVerify(eventId, email) {
  const reg = await register(eventId, email);
  const { attendeeId } = reg.body;
  await request(app).post(`/api/events/${eventId}/send-verification`).send({ attendeeId });
  const verify = await request(app)
    .post(`/api/events/${eventId}/verify-email`)
    .send({ attendeeId, code: lastCodeSentTo(email) });
  return { attendeeId, verify };
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`reg-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
});

beforeEach(() => emailService.__clearOutbox());

// ---------------------------------------------------------------------------

describe('POST /register issues no credential', () => {
  let eventId;
  beforeAll(async () => { eventId = await createEvent(); });

  it('answers only { attendeeId } and stores no token hash', async () => {
    const res = await register(eventId, emailFor('new'));

    expect(res.statusCode).toBe(200);
    expect(res.body.attendeeId).toBeTruthy();
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.attendee).toBeUndefined();
    expect(res.body.isExisting).toBeUndefined();

    const row = await eventService.getAttendeeById(res.body.attendeeId);
    expect(row.access_token_hash).toBeNull();
    expect(Number(row.email_verified)).toBe(0);
  });

  it('answers an existing email with the same shape and leaves the row untouched', async () => {
    const email = emailFor('existing');
    const first = await register(eventId, email);
    await db.execute({
      sql: "UPDATE event_attendees SET status = 'joined' WHERE id = ?",
      args: [first.body.attendeeId],
    });

    const second = await register(eventId, email, { first_name: 'Otro' });

    expect(second.statusCode).toBe(200);
    expect(Object.keys(second.body).sort()).toEqual(['attendeeId', 'success']);
    expect(second.body.attendeeId).toBe(first.body.attendeeId);
    const row = await eventService.getAttendeeById(first.body.attendeeId);
    expect(row.first_name).toBe('Ana');
    expect(row.status).toBe('joined');
  });

  it('normalises the email, so two spellings resolve one row', async () => {
    const local = `mixed-${randomUUID().slice(0, 8)}`;
    const a = await register(eventId, `${local.toUpperCase()}@Ejemplo.com`);
    const b = await register(eventId, `${local}@ejemplo.com`);

    expect(b.body.attendeeId).toBe(a.body.attendeeId);
    const row = await eventService.getAttendeeById(a.body.attendeeId);
    expect(row.email).toBe(`${local}@ejemplo.com`);
  });

  it('rejects a malformed email without creating a row', async () => {
    const res = await register(eventId, 'foo');
    expect(res.statusCode).toBe(400);
    const rows = await db.execute({
      sql: "SELECT 1 FROM event_attendees WHERE event_id = ? AND email = 'foo'",
      args: [eventId],
    });
    expect(rows.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('a token on an unverified row authenticates nowhere', () => {
  let eventId;
  let videoEventId;
  // A row as the bug left it: a real token hash, email never verified.
  async function legacyUnverified(targetEventId) {
    const res = await register(targetEventId, emailFor('legacy'));
    const accessToken = randomUUID().replace(/-/g, '');
    await db.execute({
      sql: 'UPDATE event_attendees SET access_token_hash = ? WHERE id = ?',
      args: [sha256(accessToken), res.body.attendeeId],
    });
    return { attendeeId: res.body.attendeeId, accessToken };
  }

  beforeAll(async () => {
    eventId = await createEvent();
    videoEventId = await createEvent({ format: 'video' });
  });

  it('POST /token answers 403 and does not mark the row joined', async () => {
    const creds = await legacyUnverified(eventId);

    const res = await request(app).post(`/api/events/${eventId}/token`).send(creds);

    expect(res.statusCode).toBe(403);
    expect(res.body.token).toBeUndefined();
    const row = await eventService.getAttendeeById(creds.attendeeId);
    expect(row.status).toBe('registered');
  });

  it('POST /video-token answers 403', async () => {
    const creds = await legacyUnverified(videoEventId);
    const res = await request(app).post(`/api/events/${videoEventId}/video-token`).send(creds);
    expect(res.statusCode).toBe(403);
  });

  it('the authenticated Socket.IO room refuses the join', async () => {
    const creds = await legacyUnverified(eventId);

    let onConnection;
    setupEventSocket({
      on: (name, handler) => { if (name === 'connection') onConnection = handler; },
      to: () => ({ emit: () => {} }),
    });
    const handlers = {};
    const socket = {
      id: 'socket-unverified',
      data: {},
      handshake: { headers: {}, address: '127.0.0.1' },
      on: (name, handler) => { handlers[name] = handler; },
      emit: () => {},
      join: () => {},
      leave: () => {},
      to: () => ({ emit: () => {} }),
    };
    onConnection(socket);

    const ack = await new Promise((resolve) => {
      handlers.join_event_room({ eventId, ...creds }, resolve);
    });

    expect(ack.ok).toBe(false);
  });

  it('the same row authenticates once the email is verified', async () => {
    const email = emailFor('late');
    const { verify } = await registerAndVerify(eventId, email);

    expect(verify.statusCode).toBe(200);
    const res = await request(app)
      .post(`/api/events/${eventId}/token`)
      .send({ attendeeId: verify.body.attendeeId, accessToken: verify.body.accessToken });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('verify-email issues the credential', () => {
  let freeEventId;
  let paidEventId;
  beforeAll(async () => {
    freeEventId = await createEvent();
    paidEventId = await createEvent({ accessType: 'paid', price: 10 });
  });

  it('free event: token, password, paymentRequired false, confirmation email', async () => {
    const email = emailFor('free');
    const { attendeeId, verify } = await registerAndVerify(freeEventId, email);

    expect(verify.statusCode).toBe(200);
    expect(verify.body).toMatchObject({ attendeeId, paymentRequired: false });
    expect(verify.body.accessToken).toMatch(/^[0-9a-f]{64}$/);
    expect(verify.body.accessPassword).toMatch(/^[A-Z2-9]{6}$/);

    const row = await eventService.getAttendeeById(attendeeId);
    expect(Number(row.email_verified)).toBe(1);
    expect(row.access_token_hash).toBe(sha256(verify.body.accessToken));
    expect(row.verification_code_hash).toBeNull();
    expect(emailService.__getOutbox().filter((m) => m.to === email)).toHaveLength(2);
  });

  it('paid event, unpaid: token but no password, paymentRequired true', async () => {
    const { verify } = await registerAndVerify(paidEventId, emailFor('paid'));

    expect(verify.statusCode).toBe(200);
    expect(verify.body.paymentRequired).toBe(true);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.accessPassword).toBeUndefined();
  });

  it('a returning attendee gets a new token and keeps their password', async () => {
    const email = emailFor('returning');
    const { attendeeId, verify: first } = await registerAndVerify(freeEventId, email);
    await expireCooldown(attendeeId);

    const { verify: second } = await registerAndVerify(freeEventId, email);

    expect(second.statusCode).toBe(200);
    expect(second.body.accessToken).not.toBe(first.body.accessToken);
    expect(second.body.accessPassword).toBe(first.body.accessPassword);

    // The earlier device's token is dead
    const old = await request(app)
      .post(`/api/events/${freeEventId}/token`)
      .send({ attendeeId, accessToken: first.body.accessToken });
    expect(old.statusCode).toBe(403);
  });

  it('a wrong code answers OTP_INVALID and counts the attempt', async () => {
    const email = emailFor('wrong');
    const reg = await register(freeEventId, email);
    await request(app).post(`/api/events/${freeEventId}/send-verification`).send({ attendeeId: reg.body.attendeeId });

    const res = await request(app)
      .post(`/api/events/${freeEventId}/verify-email`)
      .send({ attendeeId: reg.body.attendeeId, code: '000000' });

    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('OTP_INVALID');
    const row = await eventService.getAttendeeById(reg.body.attendeeId);
    expect(Number(row.verification_attempts)).toBe(1);
  });

  it('after 5 failed attempts even the right code is refused, until a new send', async () => {
    const email = emailFor('attempts');
    const reg = await register(freeEventId, email);
    const { attendeeId } = reg.body;
    await request(app).post(`/api/events/${freeEventId}/send-verification`).send({ attendeeId });
    const code = lastCodeSentTo(email);
    const wrong = code === '999999' ? '999998' : '999999';

    for (let i = 0; i < 5; i++) {
      await request(app).post(`/api/events/${freeEventId}/verify-email`).send({ attendeeId, code: wrong });
    }
    const blocked = await request(app).post(`/api/events/${freeEventId}/verify-email`).send({ attendeeId, code });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.body.title).toBe('OTP_TOO_MANY_ATTEMPTS');
    expect(Number((await eventService.getAttendeeById(attendeeId)).email_verified)).toBe(0);

    await expireCooldown(attendeeId);
    await request(app).post(`/api/events/${freeEventId}/send-verification`).send({ attendeeId });
    const ok = await request(app)
      .post(`/api/events/${freeEventId}/verify-email`)
      .send({ attendeeId, code: lastCodeSentTo(email) });
    expect(ok.statusCode).toBe(200);
  });

  it('a second send within 30 s answers OTP_RESEND_TOO_SOON and sends nothing', async () => {
    const email = emailFor('cooldown');
    const reg = await register(freeEventId, email);
    const { attendeeId } = reg.body;

    const first = await request(app).post(`/api/events/${freeEventId}/send-verification`).send({ attendeeId });
    const second = await request(app).post(`/api/events/${freeEventId}/send-verification`).send({ attendeeId });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.body.title).toBe('OTP_RESEND_TOO_SOON');
    expect(emailService.__getOutbox().filter((m) => m.to === email)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('capacity: only verified attendees hold a seat', () => {
  it('unverified registrations neither fill the event nor show in the count', async () => {
    const eventId = await createEvent({ maxAttendees: 2 });
    for (let i = 0; i < 3; i++) {
      const res = await register(eventId, emailFor(`ghost${i}`));
      expect(res.statusCode).toBe(200);
    }
    expect(await eventService.getAttendeeCount(eventId)).toBe(0);
  });

  it('verifying into a full event answers EVENT_FULL and leaves the row unverified', async () => {
    const eventId = await createEvent({ maxAttendees: 1 });
    const lateEmail = emailFor('late');
    const late = await register(eventId, lateEmail);
    await request(app).post(`/api/events/${eventId}/send-verification`).send({ attendeeId: late.body.attendeeId });

    // Someone else takes the only seat in between
    await registerAndVerify(eventId, emailFor('first'));

    const res = await request(app)
      .post(`/api/events/${eventId}/verify-email`)
      .send({ attendeeId: late.body.attendeeId, code: lastCodeSentTo(lateEmail) });

    expect(res.statusCode).toBe(409);
    expect(res.body.title).toBe('EVENT_FULL');
    const row = await eventService.getAttendeeById(late.body.attendeeId);
    expect(Number(row.email_verified)).toBe(0);
    expect(row.access_token_hash).toBeNull();
  });

  it('a new email is refused at /register once the event is full, a verified one is not', async () => {
    const eventId = await createEvent({ maxAttendees: 1 });
    const holderEmail = emailFor('holder');
    await registerAndVerify(eventId, holderEmail);

    const newcomer = await register(eventId, emailFor('newcomer'));
    expect(newcomer.statusCode).toBe(409);
    expect(newcomer.body.title).toBe('EVENT_FULL');

    const returning = await register(eventId, holderEmail);
    expect(returning.statusCode).toBe(200);
  });

  it('two attendees racing for the last seat: exactly one wins', async () => {
    const eventId = await createEvent({ maxAttendees: 1 });
    const contenders = [];
    for (const label of ['a', 'b']) {
      const { attendee } = await eventService.registerAttendee(eventId, {
        first_name: 'Rival', last_name: label, email: emailFor(`race-${label}`),
      });
      const sent = await eventService.sendVerificationCode(eventId, attendee.id);
      contenders.push({ id: attendee.id, code: sent.code });
    }

    const results = await Promise.all(
      contenders.map((c) => eventService.verifyEmailCode(eventId, c.id, c.code)),
    );

    expect(results.filter((r) => r.valid)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'EVENT_FULL')).toHaveLength(1);
    expect(await eventService.getAttendeeCount(eventId)).toBe(1);
  });

  it('paid event: the seat belongs to whoever verifies, paid or not', async () => {
    const eventId = await createEvent({ accessType: 'paid', price: 10, maxAttendees: 1 });
    const { verify } = await registerAndVerify(eventId, emailFor('unpaid-holder'));
    expect(verify.body.paymentRequired).toBe(true);

    const newcomer = await register(eventId, emailFor('paid-newcomer'));
    expect(newcomer.statusCode).toBe(409);
    expect(newcomer.body.title).toBe('EVENT_FULL');
  });
});

// ---------------------------------------------------------------------------

describe('POST /pay requires a verified email', () => {
  it('answers 403 EMAIL_NOT_VERIFIED for an unverified row', async () => {
    const eventId = await createEvent({ accessType: 'paid', price: 10 });
    const reg = await register(eventId, emailFor('pay'));

    const res = await request(app)
      .post(`/api/events/${eventId}/pay`)
      .send({ attendeeId: reg.body.attendeeId });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('EMAIL_NOT_VERIFIED');
  });
});

// ---------------------------------------------------------------------------

describe('regression guards', () => {
  const API_ROOT = path.join(__dirname, '..');

  function jsFilesUnder(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return jsFilesUnder(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });
  }

  it('access_token_hash appears in SQL only inside eventService.js', () => {
    // One lookup by token — the one that filters out unverified rows. A second
    // query on the column elsewhere would be a gate that skips the filter.
    const offenders = ['controllers', 'routes', 'socket', 'services', 'scheduler']
      .flatMap((dir) => jsFilesUnder(path.join(API_ROOT, dir)))
      .filter((file) => !file.endsWith(path.join('services', 'eventService.js')))
      .filter((file) => /access_token_hash/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(API_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('no verification code or password is drawn from Math.random', () => {
    const files = [
      'services/eventService.js',
      'services/drawService.js',
      'services/auctionService.js',
      'services/buyerEmailVerification.js',
      'utils/emailOtp.js',
    ];
    // Calls, not mentions: emailOtp.js documents why Math.random was removed.
    const offenders = files.filter((file) => /Math\.random\s*\(/.test(
      fs.readFileSync(path.join(API_ROOT, file), 'utf8'),
    ));

    expect(offenders).toEqual([]);
  });
});
