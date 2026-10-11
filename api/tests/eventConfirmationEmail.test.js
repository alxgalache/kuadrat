/**
 * «Registro confirmado» email of a /live event
 * (change: event-confirmation-calendar-links).
 *
 * It must carry the date, the event link with the other-device instructions
 * and the three calendar buttons; escape what the attendee and the admin
 * typed; keep the password out of every link; and still go out — without
 * date or calendar row — when event_datetime cannot be read.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const config = require('../config/env');
const emailService = require('../services/emailService');

const stamp = Date.now();
const PASSWORD = 'ABC234';

const baseEvent = {
  id: '11111111-2222-3333-4444-555555555555',
  slug: 'charla-con-ana-1a2b3c4d',
  title: 'Charla con Ana',
  event_datetime: '2026-10-20T19:00',
  duration_minutes: 60,
};

async function send(overrides = {}) {
  emailService.__clearOutbox();
  await emailService.sendEventConfirmationEmail({
    email: `conf-${randomUUID().slice(0, 8)}@test.com`,
    firstName: 'Ana',
    event: baseEvent,
    accessPassword: PASSWORD,
    ...overrides,
  });
  const outbox = emailService.__getOutbox();
  expect(outbox).toHaveLength(1);
  return outbox[0];
}

/** Every href of the HTML, entity- and percent-decoded. */
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)]
  .map(([, value]) => decodeURIComponent(value.replace(/&amp;/g, '&')));

describe('sendEventConfirmationEmail', () => {
  beforeEach(() => emailService.__clearOutbox());

  it('shows the date and time in peninsular Spanish time', async () => {
    const { html } = await send();
    expect(html).toContain('<strong>martes, 20 de octubre de 2026, 19:00</strong> (hora peninsular española)');
  });

  it('links to the event page with a button only, and explains other-device access', async () => {
    const { html } = await send();
    const pageUrl = `${config.clientUrl}/live/charla-con-ana-1a2b3c4d`;
    expect(html).toContain('Cuando empiece el evento, podrás acceder pulsando este botón:');
    expect(html).toMatch(new RegExp(`<a href="${pageUrl}"[^>]*>Ir al evento</a>`));
    expect(hrefs(html).filter((h) => h === pageUrl)).toHaveLength(1);
    // The URL is not repeated as visible text (escapeForEmail would encode its «/» as &#x2F;).
    expect(html).not.toContain('live&#x2F;charla-con-ana-1a2b3c4d');
    expect(html).toContain('pulsa «Acceder con contraseña» en la página del evento');
  });

  it('shows Google Calendar, Outlook and Apple in one table row, in that order', async () => {
    const { html } = await send();
    const google = html.indexOf('https://calendar.google.com/calendar/render?action=TEMPLATE');
    const outlook = html.indexOf('https://outlook.live.com/calendar/deeplink/compose?');
    const apple = html.indexOf(`/api/events/${baseEvent.id}/calendar.ics`);
    expect(google).toBeGreaterThan(-1);
    expect(outlook).toBeGreaterThan(google);
    expect(apple).toBeGreaterThan(outlook);

    // The three buttons share a single <tr>: no </tr> between the first and the last.
    expect(html.slice(google, apple)).not.toContain('</tr>');

    for (const [icon, label] of [
      ['google-calendar-v1.png', 'Google Calendar'],
      ['outlook-v1.png', 'Outlook'],
      ['apple-calendar-v1.png', 'Apple'],
    ]) {
      expect(html).toContain(`<img src="${config.clientUrl}/email/calendar/${icon}" width="28" height="28" alt=""`);
      expect(html).toMatch(new RegExp(`${icon}"[^>]*>\\s*${label}\\s*</a>`));
    }
    expect(html).toContain('Con «Apple» descargas el evento en un archivo .ics');
  });

  it('escapes the first name and the event title', async () => {
    const { html, subject } = await send({
      firstName: '<b>Ana</b>',
      event: { ...baseEvent, title: 'Arte <i>vivo</i>' },
    });
    expect(html).toContain('&lt;b&gt;Ana&lt;&#x2F;b&gt;');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('Arte &lt;i&gt;vivo&lt;&#x2F;i&gt;');
    expect(html).not.toContain('<i>vivo</i>');
    // The subject is a plain-text header, not HTML.
    expect(subject).toBe('Registro confirmado - Arte <i>vivo</i>');
  });

  it('shows the password in its box and in no link', async () => {
    const { html } = await send();
    expect(html).toContain(`>${PASSWORD}</p>`);
    const links = hrefs(html);
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const href of links) {
      expect(href).not.toContain(PASSWORD);
    }
  });

  it('still goes out, without date or calendar row, when event_datetime cannot be read', async () => {
    const { html } = await send({ event: { ...baseEvent, event_datetime: 'mañana' } });
    expect(html).not.toContain('Fecha y hora');
    expect(html).not.toContain('calendar.google.com');
    expect(html).not.toContain('outlook.live.com');
    expect(html).not.toContain('calendar.ics');
    expect(html).toContain(`>${PASSWORD}</p>`);
    expect(html).toContain('Ir al evento');
  });

  it('keeps the amount paid for a paid event', async () => {
    const { html } = await send({ amountPaid: 15 });
    expect(html).toContain('Pago realizado: <strong>15 €</strong>');
  });
});

describe('POST /api/events/:id/verify-email sends the new confirmation', () => {
  let eventId;
  let slug;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Password1', 10);
    const host = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
      args: [`conf-host${stamp}@test.com`, hash, 'Hugo Host'],
    });
    eventId = randomUUID();
    slug = `charla-conf-${eventId.slice(0, 8)}`;
    await db.execute({
      sql: `INSERT INTO events
              (id, title, slug, event_datetime, duration_minutes, host_user_id, category, status,
               livekit_room_name, provider, format)
            VALUES (?, 'Charla de confirmación', ?, '2026-12-10T19:00', 90, ?, 'charla', 'scheduled', ?, 'livekit', 'live')`,
      args: [eventId, slug, Number(host.lastInsertRowid), `room-${eventId}`],
    });
  });

  it('carries the date, the link and the calendar buttons of that event', async () => {
    emailService.__clearOutbox();
    const email = `conf-flow-${randomUUID().slice(0, 8)}@test.com`;

    const reg = await request(app)
      .post(`/api/events/${eventId}/register`)
      .send({ first_name: 'Ana', last_name: 'Asistente', email });
    const { attendeeId } = reg.body;
    await request(app).post(`/api/events/${eventId}/send-verification`).send({ attendeeId });
    const code = emailService.__getOutbox().filter((m) => m.to === email).pop()?.html.match(/>(\d{6})<\/p>/)?.[1];

    const verify = await request(app).post(`/api/events/${eventId}/verify-email`).send({ attendeeId, code });
    expect(verify.statusCode).toBe(200);

    const confirmation = emailService.__getOutbox()
      .filter((m) => m.to === email && m.subject.startsWith('Registro confirmado')).pop();
    expect(confirmation).toBeDefined();
    expect(confirmation.subject).toBe('Registro confirmado - Charla de confirmación');
    expect(confirmation.html).toContain('jueves, 10 de diciembre de 2026, 19:00');
    expect(confirmation.html).toContain(`${config.clientUrl}/live/${slug}`);
    expect(confirmation.html).toContain('dates=20261210T180000Z%2F20261210T193000Z');
    expect(confirmation.html).toContain(`/api/events/${eventId}/calendar.ics`);
    expect(confirmation.html).toContain(`>${verify.body.accessPassword}</p>`);
    for (const href of hrefs(confirmation.html)) {
      expect(href).not.toContain(verify.body.accessPassword);
    }
  });
});
