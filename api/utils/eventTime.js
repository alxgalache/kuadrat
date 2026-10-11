/**
 * What instant an event starts and ends (change: event-confirmation-calendar-links).
 *
 * `events.event_datetime` is stored exactly as the admin's
 * <input type="datetime-local"> sends it: a wall-clock time with NO zone
 * marker («2026-10-20T19:00»), meant as Spanish peninsular time, and shown
 * as-is on the event page. The API container runs in UTC, so `new Date()` on
 * that string would read it as 19:00 UTC — one or two hours late, depending on
 * the season. This module is the ONLY place that turns it into an instant;
 * calendar links, the .ics file and the confirmation email all read it here.
 *
 * Daylight-saving edges follow Temporal's `compatible` disambiguation: a wall
 * time that does not exist (the spring-forward gap) moves forward by the size
 * of the gap, and one that happens twice (the autumn fall-back) resolves to
 * its first occurrence, still in summer time.
 */

const EVENT_TIME_ZONE = 'Europe/Madrid';
const DEFAULT_DURATION_MINUTES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EVENT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dateFormatterEs = new Intl.DateTimeFormat('es-ES', {
  timeZone: EVENT_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatterEs = new Intl.DateTimeFormat('es-ES', {
  timeZone: EVENT_TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

/** Offset of EVENT_TIME_ZONE from UTC at the instant `ms`, in ms. */
function zoneOffsetMs(ms) {
  const seconds = Math.floor(ms / 1000) * 1000;
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(seconds))) {
    parts[type] = Number(value);
  }
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - seconds;
}

/**
 * Instant (Date) of a zone-less wall time in EVENT_TIME_ZONE. A value that
 * already carries `Z` or an offset is taken as written. Anything unreadable
 * yields null — never a throw: a confirmation email must not fail over this.
 */
function wallTimeToUtc(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value !== 'string') return null;
  const str = value.trim();

  if (HAS_ZONE.test(str)) {
    const ms = Date.parse(str);
    return Number.isNaN(ms) ? null : new Date(ms);
  }

  const match = WALL_TIME.exec(str);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((n) => Number(n ?? 0));

  // The wall time written as if it were UTC. Rejects 2026-02-30 and 25:00,
  // which Date.UTC would silently roll over.
  const wallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallMs);
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) {
    return null;
  }

  // Madrid never changes offset twice within two days, so the offsets in
  // force a day before and a day after are the only two candidates.
  const offsetBefore = zoneOffsetMs(wallMs - DAY_MS);
  const offsetAfter = zoneOffsetMs(wallMs + DAY_MS);
  const valid = [offsetBefore, offsetAfter]
    .map((offset) => wallMs - offset)
    .filter((candidate) => zoneOffsetMs(candidate) === wallMs - candidate);

  // Two valid readings = the repeated autumn hour: take the earlier one.
  // None = the spring gap: read it with the offset in force before the jump.
  const instant = valid.length > 0 ? Math.min(...valid) : wallMs - offsetBefore;
  return new Date(instant);
}

/** Start of the event as a Date, or null if event_datetime is unreadable. */
function eventStartUtc(event) {
  return wallTimeToUtc(event?.event_datetime);
}

/** Start + duration_minutes (60 when missing or invalid), or null. */
function eventEndUtc(event) {
  const start = eventStartUtc(event);
  if (!start) return null;
  const minutes = Number(event.duration_minutes);
  const duration = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DURATION_MINUTES;
  return new Date(start.getTime() + duration * 60 * 1000);
}

/** «martes, 20 de octubre de 2026, 19:00», in EVENT_TIME_ZONE, or null. */
function formatEventDateTimeEs(event) {
  const start = eventStartUtc(event);
  if (!start) return null;
  return `${dateFormatterEs.format(start)}, ${timeFormatterEs.format(start)}`;
}

module.exports = {
  EVENT_TIME_ZONE,
  wallTimeToUtc,
  eventStartUtc,
  eventEndUtc,
  formatEventDateTimeEs,
};
