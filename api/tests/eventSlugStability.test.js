/**
 * The slug of a published event never changes
 * (change: event-confirmation-calendar-links).
 *
 * updateEvent used to regenerate it, with a random suffix, on every title
 * change. Once an event is published, /live/<slug> is in confirmation emails,
 * the event announcement and attendees' calendars, so a corrected title
 * turned all of them into 404s. Only a draft may still get a new slug.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const eventService = require('../services/eventService');

const stamp = Date.now();
let hostId;

async function createEvent(status) {
  const id = randomUUID();
  const slug = `titulo-original-${id.slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, category, status, livekit_room_name, provider)
          VALUES (?, 'Título original', ?, '2026-12-10T19:00', ?, 'charla', ?, ?, 'livekit')`,
    args: [id, slug, hostId, status, `room-${id}`],
  });
  return { id, slug };
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`slug-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
});

describe('updateEvent keeps the slug of a published event', () => {
  it('gives a draft a new slug from its new title', async () => {
    const { id, slug } = await createEvent('draft');
    const updated = await eventService.updateEvent(id, { title: 'Título corregido' });
    expect(updated.slug).not.toBe(slug);
    expect(updated.slug).toMatch(/^titulo-corregido-[0-9a-f]{8}$/);
  });

  it.each(['scheduled', 'active', 'finished', 'cancelled'])(
    'keeps the slug of a %s event when its title changes',
    async (status) => {
      const { id, slug } = await createEvent(status);
      const updated = await eventService.updateEvent(id, { title: 'Título corregido' });
      expect(updated.title).toBe('Título corregido');
      expect(updated.slug).toBe(slug);
    },
  );

  it('still serves the published event, with its new title, at the old URL', async () => {
    const { id, slug } = await createEvent('scheduled');
    await eventService.updateEvent(id, { title: 'Título corregido' });

    const res = await request(app).get(`/api/events/${slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.event.id).toBe(id);
    expect(res.body.event.title).toBe('Título corregido');
  });

  it('gives a new slug when one edit retitles a draft and publishes it', async () => {
    const { id, slug } = await createEvent('draft');
    const updated = await eventService.updateEvent(id, { title: 'Título corregido', status: 'scheduled' });
    expect(updated.status).toBe('scheduled');
    expect(updated.slug).not.toBe(slug);
    expect(updated.slug).toMatch(/^titulo-corregido-/);
  });
});
