/**
 * Timetable of a pre-recorded video pass (change: live-event-access-hardening).
 * The ONLY source of these instants: the public payload, the closing
 * scheduler, the authenticated room and /video-token all read them here, so
 * every participant and the server agree on the same second.
 *
 *   start        video_started_at («Iniciar»)
 *   pass end     start + the video's measured duration
 *                (video_duration_seconds), or duration_minutes if unknown
 *   chat closes  pass end + CHAT_GRACE_MS: the chat stays open for comments,
 *                then the event is finished for everyone
 */

const CHAT_GRACE_MS = 5 * 60 * 1000;

/** Epoch ms from an ISO string or a zone-less SQLite UTC timestamp. */
function parseInstant(value) {
  if (!value) return null;
  const s = String(value);
  const iso = /[TZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function passDurationMs(event) {
  const measured = Number(event.video_duration_seconds);
  if (measured > 0) return measured * 1000;
  return (Number(event.duration_minutes) || 60) * 60 * 1000;
}

/** When the video ends (epoch ms), or null before «Iniciar». */
function passEndsAt(event) {
  const start = parseInstant(event.video_started_at);
  return start === null ? null : start + passDurationMs(event);
}

/** When the chat closes and the event finishes (epoch ms), or null. */
function chatClosesAt(event) {
  const end = passEndsAt(event);
  return end === null ? null : end + CHAT_GRACE_MS;
}

function isPassClosed(event, now = Date.now()) {
  const closes = chatClosesAt(event);
  return closes !== null && now >= closes;
}

module.exports = {
  CHAT_GRACE_MS,
  parseInstant,
  passDurationMs,
  passEndsAt,
  chatClosesAt,
  isPassClosed,
};
