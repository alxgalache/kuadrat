/**
 * Keeps the event identity flow out of Sentry (change: event-identity-
 * provider-verification). The API reports with `sendDefaultPii: true`, which
 * attaches the request cookies and body to every event and sampled
 * transaction. On the /identity/ routes that would ship:
 *   - the provider's form_post: an id_token carrying the attendee's name and email;
 *   - the ev_idp_result cookie: a one-time proof that grants event access.
 *
 * Pure function, in its own module, because instrument.js never runs under
 * test (importing @sentry/node there breaks unrelated suites): this is the
 * only way the scrub gets a test. Used as both beforeSend and
 * beforeSendTransaction. Every other URL passes through untouched.
 */

function scrubIdentityRequest(event) {
  const url = event?.request?.url;
  if (typeof url !== 'string' || !url.includes('/identity/')) return event;

  const request = { ...event.request };
  delete request.cookies;
  delete request.data;
  if (request.headers && typeof request.headers === 'object') {
    request.headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) => name.toLowerCase() !== 'cookie'),
    );
  }
  return { ...event, request };
}

module.exports = { scrubIdentityRequest };
