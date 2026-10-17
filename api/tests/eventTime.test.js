/**
 * event_datetime is a zone-less wall time in Europe/Madrid
 * (change: event-confirmation-calendar-links). The container runs in UTC, so
 * reading it with `new Date()` would put every calendar entry one or two
 * hours late. These tests pin the conversion, its DST edges and its
 * independence from the process timezone.
 */

const {
  EVENT_TIME_ZONE,
  wallTimeToUtc,
  eventStartUtc,
  eventEndUtc,
  formatEventDateTimeEs,
  formatEventWhenEs,
} = require('../utils/eventTime');

const iso = (value) => wallTimeToUtc(value)?.toISOString() ?? null;

describe('eventTime', () => {
  it('declares the gallery time zone', () => {
    expect(EVENT_TIME_ZONE).toBe('Europe/Madrid');
  });

  it('reads a winter wall time as UTC+1', () => {
    expect(iso('2026-12-10T19:00')).toBe('2026-12-10T18:00:00.000Z');
  });

  it('reads a summer wall time as UTC+2', () => {
    expect(iso('2026-07-10T19:00')).toBe('2026-07-10T17:00:00.000Z');
  });

  it('accepts seconds and the SQLite space separator', () => {
    expect(iso('2026-07-10T19:00:00')).toBe('2026-07-10T17:00:00.000Z');
    expect(iso('2026-07-10 19:00:00')).toBe('2026-07-10T17:00:00.000Z');
  });

  it('gives the same instant whatever TZ the process runs in', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        expect(iso('2026-07-10T19:00')).toBe('2026-07-10T17:00:00.000Z');
        expect(iso('2026-12-10T19:00')).toBe('2026-12-10T18:00:00.000Z');
        expect(formatEventDateTimeEs({ event_datetime: '2026-10-20T19:00' }))
          .toBe('martes, 20 de octubre de 2026, 19:00');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('moves a wall time inside the spring-forward gap forward by the gap', () => {
    // 02:30 does not exist on 2026-03-29: clocks jump from 02:00 to 03:00.
    expect(iso('2026-03-29T02:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('resolves the repeated autumn hour to its first occurrence', () => {
    // 02:30 happens twice on 2026-10-25: first in CEST, then in CET.
    expect(iso('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(iso('2026-10-25T03:30')).toBe('2026-10-25T02:30:00.000Z');
  });

  it('takes a value with an explicit zone as written', () => {
    expect(iso('2026-07-10T17:00:00Z')).toBe('2026-07-10T17:00:00.000Z');
    expect(iso('2026-07-10T19:00:00+02:00')).toBe('2026-07-10T17:00:00.000Z');
  });

  it('returns null for anything unreadable, never throwing', () => {
    for (const value of [null, undefined, '', 'mañana', '2026-02-30T10:00', '2026-07-10T25:00', 42, {}]) {
      expect(wallTimeToUtc(value)).toBeNull();
    }
    expect(eventStartUtc({ event_datetime: 'nope' })).toBeNull();
    expect(eventEndUtc({ event_datetime: 'nope' })).toBeNull();
    expect(formatEventDateTimeEs({ event_datetime: 'nope' })).toBeNull();
    expect(eventStartUtc(null)).toBeNull();
  });

  it('ends duration_minutes after the start, 60 when missing or invalid', () => {
    const start = '2026-12-10T19:00';
    expect(eventEndUtc({ event_datetime: start, duration_minutes: 90 }).toISOString())
      .toBe('2026-12-10T19:30:00.000Z');
    expect(eventEndUtc({ event_datetime: start }).toISOString()).toBe('2026-12-10T19:00:00.000Z');
    expect(eventEndUtc({ event_datetime: start, duration_minutes: 0 }).toISOString())
      .toBe('2026-12-10T19:00:00.000Z');
  });

  it('formats the start in Spanish, in the event time zone', () => {
    expect(formatEventDateTimeEs({ event_datetime: '2026-10-20T19:00' }))
      .toBe('martes, 20 de octubre de 2026, 19:00');
    expect(formatEventDateTimeEs({ event_datetime: '2026-12-10T09:05' }))
      .toBe('jueves, 10 de diciembre de 2026, 09:05');
  });

  it('phrases the start for a sentence, without the comma Intl puts after the weekday', () => {
    expect(formatEventWhenEs({ event_datetime: '2026-10-22T19:00' }))
      .toBe('el jueves 22 de octubre a las 19:00');
    expect(formatEventWhenEs({ event_datetime: '2026-12-10T09:05' }))
      .toBe('el jueves 10 de diciembre a las 09:05');
    expect(formatEventWhenEs({ event_datetime: 'nope' })).toBeNull();
  });

  it('phrases the start the same whatever TZ the process runs in', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        // 00:30 in Madrid is still the previous day in UTC and Los Angeles.
        expect(formatEventWhenEs({ event_datetime: '2026-07-11T00:30' }))
          .toBe('el sábado 11 de julio a las 00:30');
      }
    } finally {
      process.env.TZ = original;
    }
  });
});
