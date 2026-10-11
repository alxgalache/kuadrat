/**
 * «Add to calendar» links and .ics (change: event-confirmation-calendar-links).
 *
 * Pins the exact URL forms that make each destination work (render +
 * TEMPLATE for Google, UTC with Z for Outlook), that the three agree, that
 * no secret ever reaches a calendar, and the RFC 5545 folding and escaping.
 */

const config = require('../config/env');
const {
  eventPageUrl,
  buildCalendarEvent,
  googleCalendarUrl,
  outlookCalendarUrl,
  icsUrl,
  buildIcs,
} = require('../utils/eventCalendar');

const baseEvent = {
  id: '11111111-2222-3333-4444-555555555555',
  slug: 'charla-con-ana-1a2b3c4d',
  title: 'Charla con Ana',
  event_datetime: '2026-12-10T19:00',
  duration_minutes: 90,
};

/** Undo RFC 5545 folding and split into logical lines. */
const unfold = (ics) => ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);

/** Value of the first `NAME:` line of an unfolded .ics. */
const icsValue = (ics, name) => unfold(ics).find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);

const unescapeIcs = (text) => text
  .replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

describe('eventCalendar', () => {
  it('points the page link at /live/<slug> on the client', () => {
    expect(eventPageUrl(baseEvent)).toBe(`${config.clientUrl}/live/charla-con-ana-1a2b3c4d`);
  });

  describe('Google Calendar', () => {
    it('uses render + action=TEMPLATE with UTC dates', () => {
      const url = new URL(googleCalendarUrl(baseEvent));
      expect(`${url.origin}${url.pathname}`).toBe('https://calendar.google.com/calendar/render');
      expect(url.searchParams.get('action')).toBe('TEMPLATE');
      expect(url.searchParams.get('dates')).toBe('20261210T180000Z/20261210T193000Z');
      expect(url.searchParams.get('text')).toBe('Charla con Ana · 140d');
      expect(url.searchParams.get('location')).toBe(eventPageUrl(baseEvent));
      expect(url.searchParams.get('details')).toContain(eventPageUrl(baseEvent));
    });

    it('converts a summer event with UTC+2', () => {
      const url = new URL(googleCalendarUrl({ ...baseEvent, event_datetime: '2026-07-10T19:00', duration_minutes: 60 }));
      expect(url.searchParams.get('dates')).toBe('20260710T170000Z/20260710T180000Z');
    });

    it('never encodes a space as «+»', () => {
      expect(googleCalendarUrl(baseEvent)).not.toContain('+');
    });
  });

  describe('Outlook', () => {
    it('uses the outlook.live.com compose deeplink with UTC times and Z', () => {
      const raw = outlookCalendarUrl({ ...baseEvent, event_datetime: '2026-07-10T19:00', duration_minutes: 60 });
      const url = new URL(raw);
      expect(`${url.origin}${url.pathname}`).toBe('https://outlook.live.com/calendar/deeplink/compose');
      expect(url.searchParams.get('path')).toBe('/calendar/action/compose');
      expect(url.searchParams.get('rru')).toBe('addevent');
      expect(url.searchParams.get('startdt')).toBe('2026-07-10T17:00:00Z');
      expect(url.searchParams.get('enddt')).toBe('2026-07-10T18:00:00Z');
      expect(url.searchParams.get('subject')).toBe('Charla con Ana · 140d');
      expect(url.searchParams.get('location')).toBe(eventPageUrl(baseEvent));
    });

    it('carries no «+» offset, which Outlook would read as a space', () => {
      const raw = outlookCalendarUrl(baseEvent);
      expect(raw).not.toContain('+');
      expect(raw).not.toMatch(/%2B/i);
    });

    it('sends the description as HTML, with the link as an anchor', () => {
      const body = new URL(outlookCalendarUrl(baseEvent)).searchParams.get('body');
      const page = eventPageUrl(baseEvent);
      expect(body).toContain(`<a href="${page}">${page}</a>`);
      expect(body).toContain('<br>');
    });

    it('escapes HTML in the event title inside the body', () => {
      const body = new URL(outlookCalendarUrl({ ...baseEvent, title: 'Arte <b>"vivo"</b> & más' }))
        .searchParams.get('body');
      expect(body).toContain('Arte &lt;b&gt;&quot;vivo&quot;&lt;/b&gt; &amp; más');
      expect(body).not.toContain('<b>');
    });
  });

  describe('the three destinations', () => {
    it('agree on title, start, end and page link', () => {
      const entry = buildCalendarEvent(baseEvent);
      const google = new URL(googleCalendarUrl(baseEvent)).searchParams;
      const outlook = new URL(outlookCalendarUrl(baseEvent)).searchParams;
      const ics = buildIcs(baseEvent);

      expect(google.get('text')).toBe(entry.title);
      expect(outlook.get('subject')).toBe(entry.title);
      expect(unescapeIcs(icsValue(ics, 'SUMMARY'))).toBe(entry.title);

      expect(google.get('dates')).toBe(`${icsValue(ics, 'DTSTART')}/${icsValue(ics, 'DTEND')}`);
      expect(outlook.get('startdt').replace(/[-:]/g, '')).toBe(icsValue(ics, 'DTSTART'));
      expect(outlook.get('enddt').replace(/[-:]/g, '')).toBe(icsValue(ics, 'DTEND'));

      expect(google.get('location')).toBe(entry.pageUrl);
      expect(outlook.get('location')).toBe(entry.pageUrl);
      expect(icsValue(ics, 'URL')).toBe(entry.pageUrl);
    });

    it('never contain the access password, which does not exist at this layer', () => {
      // Even if a caller passes the attendee's password on the event object,
      // nothing in the builders reads it.
      const event = { ...baseEvent, access_password: 'ABC234', accessPassword: 'ABC234' };
      for (const output of [googleCalendarUrl(event), outlookCalendarUrl(event), buildIcs(event)]) {
        expect(output).not.toContain('ABC234');
      }
      const details = new URL(googleCalendarUrl(event)).searchParams.get('details');
      expect(details).toContain('Registro confirmado - Charla con Ana');
      expect(details).toContain('Acceder con contraseña');
    });

    it('never contain the fields toPublicEvent hides', () => {
      const event = {
        ...baseEvent,
        video_url: 'https://cdn.example.com/eventos-video/secreto.mp4',
        video_url_av1: 'https://cdn.example.com/eventos-video/secreto_av1.mp4',
        recording_enabled: 1,
      };
      for (const output of [googleCalendarUrl(event), outlookCalendarUrl(event), buildIcs(event)]) {
        expect(output).not.toContain('secreto');
        expect(output).not.toContain('recording');
      }
    });

    it('are all null when the start cannot be read', () => {
      const event = { ...baseEvent, event_datetime: 'mañana' };
      expect(buildCalendarEvent(event)).toBeNull();
      expect(googleCalendarUrl(event)).toBeNull();
      expect(outlookCalendarUrl(event)).toBeNull();
      expect(buildIcs(event)).toBeNull();
    });
  });

  describe('.ics', () => {
    it('lives on the API, addressed by event id', () => {
      expect(icsUrl(baseEvent))
        .toBe(`${config.siteApiBaseUrl}/api/events/11111111-2222-3333-4444-555555555555/calendar.ics`);
    });

    it('is a PUBLISH calendar with one event, a stable UID and a 15-minute alarm', () => {
      const now = new Date('2026-10-11T10:00:00Z');
      const lines = unfold(buildIcs(baseEvent, { now }));
      expect(lines[0]).toBe('BEGIN:VCALENDAR');
      expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
      expect(lines).toEqual(expect.arrayContaining([
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'UID:event-11111111-2222-3333-4444-555555555555@140d.art',
        'DTSTAMP:20261011T100000Z',
        'DTSTART:20261210T180000Z',
        'DTEND:20261210T193000Z',
        'ACTION:DISPLAY',
        'TRIGGER:-PT15M',
      ]));
      expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
      expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    });

    it('ends every line with CRLF and never a bare LF', () => {
      const ics = buildIcs(baseEvent);
      expect(ics.endsWith('\r\n')).toBe(true);
      expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });

    it('folds long lines to 75 octets without cutting a character, and escapes text', () => {
      const title = 'Conversación con Ana, pintora; «arte» emergente \\ y más palabras hasta pasar de largo 🎨🎨🎨';
      const ics = buildIcs({ ...baseEvent, title });

      for (const line of ics.split('\r\n')) {
        expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
      }
      // A cut multi-byte character would decode as U+FFFD somewhere.
      expect(ics).not.toContain('�');

      const summary = icsValue(ics, 'SUMMARY');
      expect(summary).toContain('Ana\\, pintora\\; «arte»');
      expect(summary).toContain('\\\\ y más');
      expect(unescapeIcs(summary)).toBe(`${title} · 140d`);

      const description = icsValue(ics, 'DESCRIPTION');
      expect(description).toContain('\\n');
      expect(unescapeIcs(description).split('\n')).toEqual(buildCalendarEvent({ ...baseEvent, title }).descriptionLines);
    });
  });
});
