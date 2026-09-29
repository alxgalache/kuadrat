/**
 * The video sources of a pre-recorded event (change: event-video-cdn-delivery):
 * what kind of URL each one is, whether an admin may save it, and how long a
 * signed URL for it must live.
 *
 * `events.video_url` is the H.264 MP4 and is what playback always falls back
 * to; `events.video_url_av1` is an optional AV1 copy of the same video. Either
 * may be:
 *
 *   uploaded   `uploaded:<file>` — the legacy «Subir archivo» mode, served by
 *              the api itself with its own vtoken. Only valid in video_url.
 *   protected  on the configured CDN origin under /eventos-video/: served by
 *              the CloudFront behavior that requires a signed URL.
 *   external   any other https URL, handed out as is (not protected).
 *   invalid    anything else.
 *
 * The prefix IS the protection marker, mirrored by the `eventos-video/*`
 * behavior in CloudFront (docs/eventos-video/03-configurar-aws.md). Without
 * signing configured, a URL under the prefix is still classified `protected`:
 * the safe reading, since handing it out unsigned would fail in front of the
 * audience (CloudFront answers 403), and saving it would defer that failure to
 * the day of the event.
 */

const signer = require('./cloudfrontSigner');

const EVENT_VIDEO_CDN_PREFIX = '/eventos-video/';
const UPLOADED_PREFIX = 'uploaded:';

// Signed URL lifetime. CloudFront checks the signature on EVERY new request,
// and a progressive MP4 makes one per seek, per drift correction and after
// each stall, so the signature must outlive the whole pass. A short one would
// not prevent downloading either: a download started before expiry finishes.
const PASS_MARGIN_MS = 30 * 60 * 1000;
const MIN_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 6 * 60 * 60 * 1000;

const VIDEO_FIELDS = ['video_url', 'video_url_av1'];

const normalize = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * @param {string|null|undefined} value
 * @returns {'uploaded'|'protected'|'external'|'invalid'|null} null when empty
 */
function classifyVideoUrl(value) {
  const v = normalize(value);
  if (!v) return null;
  if (v.startsWith(UPLOADED_PREFIX)) return 'uploaded';
  let url;
  try {
    url = new URL(v);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:') return 'invalid';
  if (url.pathname.startsWith(EVENT_VIDEO_CDN_PREFIX)) {
    if (!signer.isConfigured()) return 'protected';
    return url.origin === signer.configuredOrigin() ? 'protected' : 'external';
  }
  return 'external';
}

/** True for an https URL on the configured protected CDN origin. */
function isOnProtectedOrigin(value) {
  const origin = signer.configuredOrigin();
  if (!origin) return false;
  try {
    return new URL(normalize(value)).origin === origin;
  } catch {
    return false;
  }
}

const reject = (code, message) => ({ code, message });

/**
 * Validates the video fields an admin create/update carries. Only fields that
 * are present AND differ from the stored value are checked: the edit form
 * re-sends the whole event, and an old event with a legacy URL must stay
 * editable. The AV1/MP4 pairing is checked on the merged result.
 *
 * @param {object} current   The stored event (or {} on create).
 * @param {object} incoming  The request body.
 * @returns {{code: string, message: string}|null}
 */
function validateVideoUrls(current, incoming) {
  for (const field of VIDEO_FIELDS) {
    const next = normalize(incoming[field]);
    if (next === undefined || next === null) continue;
    if (next === normalize(current[field] ?? null)) continue;

    const kind = classifyVideoUrl(next);
    if (kind === 'uploaded') {
      // Only the upload endpoint writes `uploaded:` values; a request that
      // names a file itself would be pointing the event at an arbitrary one.
      return reject('EVENT_VIDEO_URL_INVALID', field === 'video_url_av1'
        ? 'La versión AV1 tiene que ser una URL https'
        : 'Para usar un archivo subido, súbelo con «Subir archivo»');
    }
    if (kind === 'invalid') {
      return reject('EVENT_VIDEO_URL_INVALID', 'La URL del vídeo tiene que ser una dirección https válida');
    }
    if (kind === 'protected' && !signer.isConfigured()) {
      return reject('EVENT_VIDEO_SIGNING_UNAVAILABLE',
        'Este servidor no tiene configurada la firma de URLs del CDN, así que no puede servir vídeos de eventos-video/');
    }
    if (kind === 'external' && isOnProtectedOrigin(next)) {
      return reject('EVENT_VIDEO_URL_UNPROTECTED',
        `El vídeo no estaría protegido: súbelo a la carpeta ${EVENT_VIDEO_CDN_PREFIX.slice(1)} del CDN`);
    }
  }

  const pick = (field) => {
    const next = normalize(incoming[field]);
    return next === undefined ? normalize(current[field] ?? null) : next;
  };
  const mp4 = pick('video_url');
  const av1 = pick('video_url_av1');
  if (av1 && !mp4) {
    return reject('EVENT_VIDEO_AV1_REQUIRES_MP4', 'La versión AV1 necesita también la URL del MP4, que es la que se usa como alternativa');
  }
  if (av1 && classifyVideoUrl(mp4) === 'uploaded') {
    return reject('EVENT_VIDEO_AV1_REQUIRES_MP4', 'La versión AV1 solo se admite con «URL del vídeo», no con un archivo subido');
  }
  return null;
}

function parseStart(value) {
  if (!value) return null;
  const s = String(value);
  const iso = /[TZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * When a signed URL issued now must expire:
 * min(now + 6 h, max(now + 15 min, video_started_at + duration_minutes + 30 min)).
 * @returns {number} epoch milliseconds
 */
function videoTokenExpiry(event, now = Date.now()) {
  const start = parseStart(event.video_started_at) ?? now;
  const durationMs = (Number(event.duration_minutes) || 60) * 60 * 1000;
  const plannedEnd = start + durationMs + PASS_MARGIN_MS;
  return Math.min(now + MAX_TTL_MS, Math.max(now + MIN_TTL_MS, plannedEnd));
}

module.exports = {
  EVENT_VIDEO_CDN_PREFIX,
  UPLOADED_PREFIX,
  classifyVideoUrl,
  isOnProtectedOrigin,
  validateVideoUrls,
  videoTokenExpiry,
};
