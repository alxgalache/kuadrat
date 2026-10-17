/**
 * 48 h reminder of /live events (change: event-reminder-email).
 *
 * Pins who gets it (confirmed seat holders, confirmed before the reminder
 * instant), when (only inside [start − 48 h, start) of a scheduled event), how
 * many times (once, with three attempts on failure), what re-arms it (a new
 * date) and what the email carries. Everything goes through the noop outbox.
 *
 * sendDueReminders reads every scheduled event in the shared test database,
 * so each event here lives in its own week of 2031: no two windows overlap and
 * a pass for one test never reminds another test's attendees.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const config = require('../config/env');
const { db } = require('../config/database');
const eventService = require('../services/eventService');
const emailService = require('../services/emailService');
const { isReminderDue, sendDueReminders } = require('../services/eventReminderService');
const { eventStartUtc } = require('../utils/eventTime');
const { createVerifiedAttendee } = require('./helpers/eventAttendees');

const HOUR = 60 * 60 * 1000;
const stamp = Date.now();
let hostId;
let week = 0;

/** A 19:00 Madrid wall time in its own week of 2031. */
function nextWallTime() {
  const day = new Date(Date.UTC(2031, 0, 6 + 7 * week++));
  return `${day.toISOString().slice(0, 10)}T19:00`;
}

async function createEvent({
  status = 'scheduled', accessType = 'free', eventDatetime = nextWallTime(),
  title = null, coverImageUrl = null, videoUrl = null,
} = {}) {
  const id = randomUUID();
  const slug = `recordatorio-${id.slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, duration_minutes, host_user_id, cover_image_url,
             access_type, price, category, status, provider, video_url, recording_enabled)
          VALUES (?, ?, ?, ?, 60, ?, ?, ?, ?, 'charla', ?, 'agora', ?, 1)`,
    args: [
      id, title || `Recordatorio ${id.slice(0, 8)}`, slug, eventDatetime, hostId, coverImageUrl,
      accessType, accessType === 'paid' ? 10 : null, status, videoUrl,
    ],
  });
  const start = eventStartUtc({ event_datetime: eventDatetime }).getTime();
  // An instant inside the window: 47 h before the start.
  return { id, slug, eventDatetime, start, inWindow: start - 47 * HOUR };
}

const emailFor = (label) => `rem-${label}-${randomUUID().slice(0, 8)}@test.com`;

/** Verified through the real path, then confirmed like verify-email does. */
async function confirmedAttendee(eventId, label, { firstName = 'Ana', password = 'ABC234' } = {}) {
  const email = emailFor(label);
  const { attendee } = await createVerifiedAttendee(eventId, { first_name: firstName, last_name: 'Asistente', email });
  await eventService.setAttendeePassword(attendee.id, password);
  return { id: attendee.id, email };
}

const sentTo = (email) => emailService.__getOutbox().filter((m) => m.to === email);
const run = (now) => sendDueReminders({ now, sendIntervalMs: 0 });

async function reminderRow(attendeeId) {
  const result = await db.execute({
    sql: 'SELECT reminder_sent_at, reminder_attempts, confirmed_at FROM event_attendees WHERE id = ?',
    args: [attendeeId],
  });
  return result.rows[0];
}

const toSqlite = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`rem-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
});

beforeEach(() => emailService.__clearOutbox());
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------

describe('scheduler switch', () => {
  it('stays off under test although .env.test asks for it', () => {
    expect(process.env.EVENT_REMINDERS_ENABLED).toBe('true');
    expect(config.events.reminderSchedulerEnabled).toBe(false);
  });

  it('does not start the scheduler when off', () => {
    const startEventReminderScheduler = require('../scheduler/eventReminderScheduler');
    expect(startEventReminderScheduler()).toBeNull();
  });
});

describe('isReminderDue', () => {
  const summer = { event_datetime: '2031-07-10T19:00' }; // 17:00 UTC
  const winter = { event_datetime: '2031-12-10T19:00' }; // 18:00 UTC
  const at = (iso) => Date.parse(iso);

  it('opens exactly 48 h before the start, read as Madrid wall time', () => {
    expect(isReminderDue(summer, at('2031-07-08T16:59:59Z'))).toBe(false);
    expect(isReminderDue(summer, at('2031-07-08T17:00:00Z'))).toBe(true);
    expect(isReminderDue(winter, at('2031-12-08T17:59:59Z'))).toBe(false);
    expect(isReminderDue(winter, at('2031-12-08T18:00:00Z'))).toBe(true);
  });

  it('stays open until the start and closes at it', () => {
    expect(isReminderDue(summer, at('2031-07-09T09:00:00Z'))).toBe(true);
    expect(isReminderDue(summer, at('2031-07-10T16:59:59Z'))).toBe(true);
    expect(isReminderDue(summer, at('2031-07-10T17:00:00Z'))).toBe(false);
    expect(isReminderDue(summer, at('2031-07-11T09:00:00Z'))).toBe(false);
  });

  it('is never due for an unreadable date', () => {
    expect(isReminderDue({ event_datetime: 'nope' }, at('2031-07-09T09:00:00Z'))).toBe(false);
    expect(isReminderDue({ event_datetime: null }, at('2031-07-09T09:00:00Z'))).toBe(false);
  });
});

describe('recipients', () => {
  it('reminds a confirmed attendee and one confirmed before the column existed', async () => {
    const event = await createEvent();
    const old = await confirmedAttendee(event.id, 'old');
    const legacy = await confirmedAttendee(event.id, 'legacy');
    await db.execute({ sql: 'UPDATE event_attendees SET confirmed_at = NULL WHERE id = ?', args: [legacy.id] });

    await run(event.inWindow);

    expect(sentTo(old.email)).toHaveLength(1);
    expect(sentTo(legacy.email)).toHaveLength(1);
  });

  it('skips whoever confirmed inside the 48 h: their confirmation is fresh', async () => {
    const event = await createEvent();
    const late = await confirmedAttendee(event.id, 'late');
    await db.execute({
      sql: 'UPDATE event_attendees SET confirmed_at = ? WHERE id = ?',
      args: [toSqlite(event.start - 30 * HOUR), late.id],
    });

    await run(event.inWindow);

    expect(sentTo(late.email)).toHaveLength(0);
  });

  it('skips unverified, cancelled, staff and banned rows', async () => {
    const event = await createEvent();

    const unverifiedEmail = emailFor('unverified');
    const { attendee: unverified } = await eventService.registerAttendee(event.id, {
      first_name: 'Una', last_name: 'Verificar', email: unverifiedEmail,
    });
    await db.execute({ sql: "UPDATE event_attendees SET access_password = 'ABC234' WHERE id = ?", args: [unverified.id] });

    const cancelled = await confirmedAttendee(event.id, 'cancelled');
    await db.execute({ sql: "UPDATE event_attendees SET status = 'cancelled' WHERE id = ?", args: [cancelled.id] });

    const staffEmail = emailFor('staff');
    await eventService.createOrGetStaffAttendee(event.id, { email: staffEmail, fullName: 'Admin Galería' });
    await db.execute({
      sql: "UPDATE event_attendees SET access_password = 'ABC234', email_verified = 1 WHERE event_id = ? AND email = ?",
      args: [event.id, staffEmail],
    });

    const banned = await confirmedAttendee(event.id, 'banned');
    await eventService.banAttendee(event.id, banned.email, null, 'spam');

    const ok = await confirmedAttendee(event.id, 'ok');

    await run(event.inWindow);

    expect(sentTo(unverifiedEmail)).toHaveLength(0);
    expect(sentTo(cancelled.email)).toHaveLength(0);
    expect(sentTo(staffEmail)).toHaveLength(0);
    expect(sentTo(banned.email)).toHaveLength(0);
    expect(sentTo(ok.email)).toHaveLength(1);
  });

  it('in a paid event, reminds who paid and skips who owes the payment', async () => {
    const event = await createEvent({ accessType: 'paid' });
    const paid = await confirmedAttendee(event.id, 'paid');
    await db.execute({ sql: "UPDATE event_attendees SET status = 'paid' WHERE id = ?", args: [paid.id] });
    const owes = await confirmedAttendee(event.id, 'owes'); // verified, status still 'registered'

    await run(event.inWindow);

    expect(sentTo(paid.email)).toHaveLength(1);
    expect(sentTo(owes.email)).toHaveLength(0);
  });

  it('sends one reminder per address, also on later passes', async () => {
    const event = await createEvent();
    const first = await confirmedAttendee(event.id, 'dup');
    // A legacy second row with the same address in another case.
    await db.execute({
      sql: `INSERT INTO event_attendees
              (id, event_id, first_name, last_name, email, email_verified, status, access_password)
            VALUES (?, ?, 'Ana', 'Duplicada', ?, 1, 'registered', 'ZZZ999')`,
      args: [randomUUID(), event.id, first.email.toUpperCase()],
    });

    await run(event.inWindow);
    await run(event.inWindow + HOUR);

    const all = emailService.__getOutbox().filter((m) => m.to.toLowerCase() === first.email);
    expect(all).toHaveLength(1);
  });
});

describe('event states and the window', () => {
  it.each(['draft', 'active', 'finished', 'cancelled'])('sends nothing for a %s event', async (status) => {
    const event = await createEvent({ status });
    const attendee = await confirmedAttendee(event.id, status);

    await run(event.inWindow);

    expect(sentTo(attendee.email)).toHaveLength(0);
  });

  it('sends nothing before the window or once the start has passed', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'edges');

    await run(event.start - 49 * HOUR);
    await run(event.start + 1);

    expect(sentTo(attendee.email)).toHaveLength(0);
  });
});

describe('exactly once', () => {
  it('two concurrent passes send one reminder, and a later pass none', async () => {
    const event = await createEvent();
    const a = await confirmedAttendee(event.id, 'conc-a');
    const b = await confirmedAttendee(event.id, 'conc-b');

    await Promise.all([run(event.inWindow), run(event.inWindow)]);
    await run(event.inWindow + HOUR);

    expect(sentTo(a.email)).toHaveLength(1);
    expect(sentTo(b.email)).toHaveLength(1);
    expect((await reminderRow(a.id)).reminder_attempts).toBe(1);
  });
});

describe('failures', () => {
  it('releases a failed send and retries it on the next pass', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'retry');
    jest.spyOn(emailService, 'sendEventReminderEmail').mockResolvedValueOnce({ success: false });

    await run(event.inWindow);
    const afterFailure = await reminderRow(attendee.id);
    expect(afterFailure.reminder_sent_at).toBeNull();
    expect(afterFailure.reminder_attempts).toBe(1);

    await run(event.inWindow + 5 * 60 * 1000);
    const afterRetry = await reminderRow(attendee.id);
    expect(afterRetry.reminder_sent_at).not.toBeNull();
    expect(afterRetry.reminder_attempts).toBe(2);
    expect(sentTo(attendee.email)).toHaveLength(1);
  });

  it('gives up after three failed attempts', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'giveup');
    const spy = jest.spyOn(emailService, 'sendEventReminderEmail').mockResolvedValue({ success: false });

    for (let pass = 0; pass < 5; pass++) await run(event.inWindow + pass * HOUR);

    expect(spy).toHaveBeenCalledTimes(3);
    const row = await reminderRow(attendee.id);
    expect(row.reminder_attempts).toBe(3);
    expect(row.reminder_sent_at).toBeNull();
  });

  it('a failing recipient does not stop the others', async () => {
    const event = await createEvent();
    const failing = await confirmedAttendee(event.id, 'fails');
    const fine = await confirmedAttendee(event.id, 'fine');
    const original = emailService.sendEventReminderEmail;
    jest.spyOn(emailService, 'sendEventReminderEmail').mockImplementation(async (args) => (
      args.email === failing.email ? { success: false } : original(args)
    ));

    await run(event.inWindow);

    expect(sentTo(failing.email)).toHaveLength(0);
    expect(sentTo(fine.email)).toHaveLength(1);
  });
});

describe('a new date re-arms the reminder', () => {
  it('resets the markers when event_datetime changes and reminds again before the new date', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'rearm');
    await run(event.inWindow);
    expect(sentTo(attendee.email)).toHaveLength(1);

    const newDate = '2032-06-15T19:00';
    await eventService.updateEvent(event.id, { event_datetime: newDate });
    const row = await reminderRow(attendee.id);
    expect(row.reminder_sent_at).toBeNull();
    expect(row.reminder_attempts).toBe(0);

    const newStart = eventStartUtc({ event_datetime: newDate }).getTime();
    await run(newStart - 47 * HOUR);
    const reminders = sentTo(attendee.email);
    expect(reminders).toHaveLength(2);
    expect(reminders[1].subject).toContain('el martes 15 de junio a las 19:00');
  });

  it('keeps the markers on a resave of the same date, even re-formatted, or on another field', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'keep');
    await run(event.inWindow);

    await eventService.updateEvent(event.id, { event_datetime: `${event.eventDatetime}:00` });
    await eventService.updateEvent(event.id, { description: 'Otra descripción' });

    const row = await reminderRow(attendee.id);
    expect(row.reminder_sent_at).not.toBeNull();
    expect(row.reminder_attempts).toBe(1);
  });
});

describe('confirmed_at', () => {
  it('is stamped on the first password and kept on a second store', async () => {
    const event = await createEvent();
    const email = emailFor('stamp');
    const { attendee } = await createVerifiedAttendee(event.id, { first_name: 'Ana', last_name: 'A', email });
    expect((await reminderRow(attendee.id)).confirmed_at).toBeNull();

    await eventService.setAttendeePassword(attendee.id, 'ABC234');
    const stamped = (await reminderRow(attendee.id)).confirmed_at;
    expect(stamped).not.toBeNull();

    await db.execute({ sql: "UPDATE event_attendees SET confirmed_at = '2020-01-01 00:00:00' WHERE id = ?", args: [attendee.id] });
    await eventService.setAttendeePassword(attendee.id, 'ABC234');
    expect((await reminderRow(attendee.id)).confirmed_at).toBe('2020-01-01 00:00:00');
  });

  it('does not move when the attendee verifies again from another device', async () => {
    const event = await createEvent();
    const email = emailFor('reverify');
    const lastCode = () => {
      const message = emailService.__getOutbox().filter((m) => m.to === email).pop();
      return message?.html?.match(/>(\d{6})<\/p>/)?.[1];
    };
    const verify = async () => {
      const reg = await request(app).post(`/api/events/${event.id}/register`)
        .send({ first_name: 'Ana', last_name: 'A', email });
      const { attendeeId } = reg.body;
      await db.execute({
        sql: "UPDATE event_attendees SET verification_sent_at = datetime('now', '-1 minute') WHERE id = ?",
        args: [attendeeId],
      });
      await request(app).post(`/api/events/${event.id}/send-verification`).send({ attendeeId });
      const res = await request(app).post(`/api/events/${event.id}/verify-email`)
        .send({ attendeeId, code: lastCode() });
      expect(res.statusCode).toBe(200);
      return attendeeId;
    };

    const attendeeId = await verify();
    expect((await reminderRow(attendeeId)).confirmed_at).not.toBeNull();
    await db.execute({ sql: "UPDATE event_attendees SET confirmed_at = '2020-01-01 00:00:00' WHERE id = ?", args: [attendeeId] });

    await verify();
    expect((await reminderRow(attendeeId)).confirmed_at).toBe('2020-01-01 00:00:00');
  });
});

describe('the email', () => {
  it('carries the subject, date, image, password, link and calendar row, escaped', async () => {
    const event = await createEvent({
      eventDatetime: '2031-10-23T19:00',
      title: 'Charla con Lorca',
      coverImageUrl: 'https://img.example.test/portada.jpg',
      videoUrl: 'https://secret.example.test/video.mp4',
    });
    const attendee = await confirmedAttendee(event.id, 'content', { firstName: '<b>Ana</b>', password: 'ABC234' });

    await run(event.inWindow);

    const [message] = sentTo(attendee.email);
    expect(message.subject).toBe('Recordatorio: «Charla con Lorca» es el jueves 23 de octubre a las 19:00');
    const { html } = message;
    expect(html).toContain('Tu evento se acerca');
    expect(html).toContain('jueves, 23 de octubre de 2031, 19:00');
    expect(html).toContain('ABC234');
    expect(html).toContain('https://img.example.test/portada.jpg');
    expect(html).toContain(`/live/${event.slug}`);
    expect(html).toContain('calendar.google.com/calendar/render');
    expect(html).toContain('outlook.live.com/calendar/deeplink/compose');
    expect(html).toContain(`/api/events/${event.id}/calendar.ics`);
    expect(html).toContain('Recibes este email porque te registraste en este evento.');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('&lt;b&gt;Ana');
    expect(html).not.toContain('secret.example.test');
    expect(html).not.toMatch(/recording/i);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).not.toContain('ABC234');
  });

  it('leaves the image block out when the event has no cover', async () => {
    const event = await createEvent();
    const attendee = await confirmedAttendee(event.id, 'nocover');

    await run(event.inWindow);

    const [message] = sentTo(attendee.email);
    expect(message.html).not.toContain('width="520"');
  });
});
