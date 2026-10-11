/**
 * GET /api/events/:id/calendar.ics (change: event-confirmation-calendar-links).
 *
 * The «Apple» button of the confirmation email. Public and addressed by id,
 * so it must expose only events an attendee can actually go to, never a draft,
 * and never a field toPublicEvent hides. Generated per request: a changed time
 * must show up in the next download.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');

const stamp = Date.now();
let hostId;

async function createEvent({ status = 'scheduled', isTest = 0, datetime = '2026-12-10T19:00' } = {}) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, duration_minutes, host_user_id, category, status,
             livekit_room_name, provider, format, video_url, video_url_av1, recording_enabled, is_test)
          VALUES (?, ?, ?, ?, 90, ?, 'charla', ?, ?, 'livekit', 'video', ?, ?, 1, ?)`,
    args: [
      id, 'Charla, con «acentos»', `charla-ics-${id.slice(0, 8)}`, datetime, hostId, status, `room-${id}`,
      'https://cdn.example.com/eventos-video/secreto.mp4',
      'https://cdn.example.com/eventos-video/secreto_av1.mp4',
      isTest,
    ],
  });
  return id;
}

const getIcs = (id) => request(app).get(`/api/events/${id}/calendar.ics`);

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`ics-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
});

describe('GET /api/events/:id/calendar.ics', () => {
  it.each([
    ['scheduled', 0],
    ['active', 0],
    ['scheduled', 1],
  ])('serves a %s event (is_test=%i) as text/calendar', async (status, isTest) => {
    const id = await createEvent({ status, isTest });
    const res = await getIcs(id);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="charla-ics-${id.slice(0, 8)}.ics"`);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.text).toContain(`UID:event-${id}@140d.art`);
    expect(res.text).toContain('DTSTART:20261210T180000Z');
    expect(res.text).toContain('DTEND:20261210T193000Z');
  });

  it.each(['draft', 'finished', 'cancelled'])('answers 404 for a %s event', async (status) => {
    const id = await createEvent({ status });
    const res = await getIcs(id);
    expect(res.statusCode).toBe(404);
    expect(res.text).not.toContain('BEGIN:VCALENDAR');
  });

  it('answers 404 for an id that does not exist', async () => {
    const res = await getIcs(randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it('reflects a time changed after the event was created', async () => {
    const id = await createEvent();
    await db.execute({ sql: "UPDATE events SET event_datetime = '2026-07-10T19:00' WHERE id = ?", args: [id] });

    const res = await getIcs(id);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('DTSTART:20260710T170000Z');
    expect(res.text).not.toContain('20261210');
  });

  it('never leaks the video sources or the recording flag', async () => {
    const id = await createEvent();
    const res = await getIcs(id);
    expect(res.text).not.toContain('secreto');
    expect(res.text).not.toContain('eventos-video');
    expect(res.text.toLowerCase()).not.toContain('recording');
  });
});
