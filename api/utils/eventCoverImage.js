const config = require('../config/env');

/**
 * Public, absolute URL of an event's cover image (`events.cover_image_url`).
 *
 * An absolute URL is taken as written. A relative one hangs from the CDN when
 * CDN_BASE_URL is configured (production) and from the API otherwise.
 *
 * Lives here, rather than in each email, because the event announcement and
 * the 48 h reminder (event-reminder-email) must show the same image: two
 * copies of this rule would drift the day the CDN changes.
 *
 * @param {{ cover_image_url?: string|null }} event
 * @returns {string|null} null when the event has no cover
 */
function eventCoverImageUrl(event) {
  const value = event?.cover_image_url;
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = config.cdnBaseUrl || config.siteApiBaseUrl;
  return `${base}/${String(value).replace(/^\/+/, '')}`;
}

module.exports = { eventCoverImageUrl };
