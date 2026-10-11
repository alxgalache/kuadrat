/**
 * «Add to calendar» for a /live event (change: event-confirmation-calendar-links).
 *
 * One calendar entry, three destinations: a Google Calendar link, an Outlook
 * on the web link and an RFC 5545 .ics file. All three are built from
 * buildCalendarEvent(), so they cannot disagree on title, times or link.
 *
 * Why these exact forms (verified 2026-10-11):
 *   - Google: `calendar/render?action=TEMPLATE`, linked DIRECTLY from the
 *     email. The Google Calendar apps claim that path on Android (assetlinks)
 *     and iOS (apple-app-site-association), so the OS opens the app with the
 *     form filled when it is installed. A redirect of ours in between makes
 *     iOS open Safari instead. `eventedit` opens the app without the form.
 *   - Outlook: `outlook.live.com/calendar/deeplink/compose`, times in UTC
 *     with `Z`. A `+02:00` offset reaches Outlook as a space and the times
 *     are dropped. The Outlook apps claim no calendar paths, so this always
 *     lands on the web form.
 *   - .ics: served by GET /api/events/:id/calendar.ics, generated per request.
 *
 * The access password NEVER goes into a calendar entry: Google and Microsoft
 * see the link URLs, and calendars get shared and synced. The description
 * points to the confirmation email instead. Nor does anything from
 * toPublicEvent's hidden fields (video_url, recording_enabled…).
 */

const config = require('../config/env');
const { eventStartUtc, eventEndUtc } = require('./eventTime');

const GOOGLE_CALENDAR_BASE = 'https://calendar.google.com/calendar/render';
const OUTLOOK_COMPOSE_BASE = 'https://outlook.live.com/calendar/deeplink/compose';
const ICS_ALARM_MINUTES = 15;
const ICS_MAX_LINE_OCTETS = 75;

/** Public page of the event: the email button and every calendar entry. */
function eventPageUrl(event) {
  return `${config.clientUrl}/live/${encodeURIComponent(event.slug)}`;
}

/**
 * The calendar entry shared by the three destinations, or null when the
 * event's start cannot be read (the email then omits the calendar row).
 */
function buildCalendarEvent(event) {
  const start = eventStartUtc(event);
  const end = eventEndUtc(event);
  if (!start || !end) return null;

  const pageUrl = eventPageUrl(event);
  return {
    title: `${event.title} · 140d`,
    start,
    end,
    pageUrl,
    descriptionLines: [
      `Accede al evento: ${pageUrl}`,
      'Si entras desde otro dispositivo o navegador, pulsa «Acceder con contraseña» en la página del evento '
        + `e introduce tu email y la contraseña del email «Registro confirmado - ${event.title}».`,
    ],
  };
}

/** Query string with every value percent-encoded (spaces as %20, never «+»). */
function toQuery(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * HTML escaping for Outlook's `body`. Only the four characters that can break
 * text or a double-quoted attribute: escapeHtml (the email templates' escaper)
 * also entity-encodes «/» and «=», valid HTML but needlessly opaque in a URL
 * that Outlook's compose sanitizer has to accept.
 */
function escapeOutlookHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 2026-07-10T17:00:00Z */
const isoUtcSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** 20260710T170000Z, the compact UTC form of Google `dates` and of .ics. */
const compactUtc = (date) => isoUtcSeconds(date).replace(/[-:]/g, '');

function googleCalendarUrl(event) {
  const entry = buildCalendarEvent(event);
  if (!entry) return null;
  return `${GOOGLE_CALENDAR_BASE}?${toQuery({
    action: 'TEMPLATE',
    text: entry.title,
    dates: `${compactUtc(entry.start)}/${compactUtc(entry.end)}`,
    details: entry.descriptionLines.join('\n'),
    location: entry.pageUrl,
  })}`;
}

function outlookCalendarUrl(event) {
  const entry = buildCalendarEvent(event);
  if (!entry) return null;
  // Outlook renders `body` as HTML: line breaks need <br>, and the first line
  // (the access link) is rebuilt with an <a> instead of the bare URL.
  const link = escapeOutlookHtml(entry.pageUrl);
  const body = [
    `Accede al evento: <a href="${link}">${link}</a>`,
    ...entry.descriptionLines.slice(1).map(escapeOutlookHtml),
  ].join('<br>');
  return `${OUTLOOK_COMPOSE_BASE}?${toQuery({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: entry.title,
    startdt: isoUtcSeconds(entry.start),
    enddt: isoUtcSeconds(entry.end),
    body,
    location: entry.pageUrl,
  })}`;
}

/** Where the email's «Apple» button points: the API serves the .ics. */
function icsUrl(event) {
  return `${config.siteApiBaseUrl}/api/events/${encodeURIComponent(event.id)}/calendar.ics`;
}

/** RFC 5545 TEXT escaping. */
function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 line folding: at most 75 octets per line, continuation lines start
 * with one space. Splits between code points, so neither a multi-byte UTF-8
 * character nor an emoji's surrogate pair is ever cut in half.
 */
function foldIcsLine(line) {
  const lines = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (octets + size > ICS_MAX_LINE_OCTETS) {
      lines.push(current);
      current = ` ${char}`;
      octets = 1 + size;
    } else {
      current += char;
      octets += size;
    }
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** The .ics file of the event, or null when its start cannot be read. */
function buildIcs(event, { now = new Date() } = {}) {
  const entry = buildCalendarEvent(event);
  if (!entry) return null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//140d Galería de Arte//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@140d.art`,
    `DTSTAMP:${compactUtc(now)}`,
    `DTSTART:${compactUtc(entry.start)}`,
    `DTEND:${compactUtc(entry.end)}`,
    `SUMMARY:${escapeIcsText(entry.title)}`,
    `DESCRIPTION:${escapeIcsText(entry.descriptionLines.join('\n'))}`,
    `LOCATION:${escapeIcsText(entry.pageUrl)}`,
    `URL:${entry.pageUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(entry.title)}`,
    `TRIGGER:-PT${ICS_ALARM_MINUTES}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

module.exports = {
  eventPageUrl,
  buildCalendarEvent,
  googleCalendarUrl,
  outlookCalendarUrl,
  icsUrl,
  buildIcs,
};
