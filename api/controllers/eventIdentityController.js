/**
 * Live event access with a Google or Microsoft account (change:
 * event-identity-provider-verification). Four routes:
 *
 *   GET  /api/events/identity/providers           which cards the modal shows
 *   GET  /api/events/:id/identity/:provider/start  → 302 to the provider
 *   POST /api/events/identity/:provider/callback   the provider's form_post → 303 back
 *   POST /api/events/:id/identity/complete         redeems the proof → credential
 *
 * The provider replaces the mailbox, never the flow: the callback issues NO
 * credential. It leaves a one-time proof in the same columns as the email code
 * (eventService.issueProviderProof), and `complete` redeems it through
 * verifyEmailCode — the single place an attendee token is born, with its
 * capacity guard — and then the very same success branch as /verify-email.
 *
 * Two short-lived HttpOnly cookies on the API's own domain carry the state;
 * nothing secret ever travels in a URL (which Sentry Replay, the Meta pixel
 * and the browser history would all record):
 *   ev_idp_flow    signed JWT { state, nonce, event, provider }. SameSite=None
 *                  because the provider's form_post is a cross-site POST.
 *   ev_idp_result  <attendeeId>.<proof>. SameSite=Lax is enough: the client
 *                  (140d.art) and the API (api.140d.art) are the same site.
 *
 * `start` and `callback` are top-level navigations, so they NEVER answer JSON:
 * validation runs here with safeParse (not validate()) and every failure,
 * thrown or not, becomes a redirect to the event page with #acceso-error=<CODE>.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const eventService = require('../services/eventService');
const identityProviders = require('../services/identityProviders');
const { parseCookies } = require('../utils/cookies');
const { normalizeEmail, safeEqual, OTP_TTL_MS } = require('../utils/emailOtp');
const { sendSuccess } = require('../utils/response');
const { identityStartSchema, identityCallbackSchema } = require('../validators/eventSchemas');
const { respondEmailVerified, getClientIp } = require('./eventController');

const FLOW_COOKIE = 'ev_idp_flow';
const RESULT_COOKIE = 'ev_idp_result';
const FLOW_AUDIENCE = 'event-identity-flow';
const FLOW_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);

// Secure always, also locally: Chrome and Firefox accept it on http://localhost
// (Safari does not — local testing is done in Chrome or Firefox).
const FLOW_COOKIE_BASE = { httpOnly: true, secure: true, sameSite: 'none', path: '/api/events/identity' };
const RESULT_COOKIE_BASE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/events' };

const CLOSED_STATUSES = ['finished', 'cancelled'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function clientBase() {
  return config.clientUrl.replace(/\/+$/, '');
}

/** The event page, from the slug in the database: never from the request. */
function eventPageUrl(event, fragment) {
  const url = `${clientBase()}/live/${encodeURIComponent(event.slug)}`;
  return fragment ? `${url}#${fragment}` : url;
}

function redirectWithError(res, event, code) {
  res.set('Cache-Control', 'no-store');
  return res.redirect(303, event ? eventPageUrl(event, `acceso-error=${code}`) : `${clientBase()}/live`);
}

/**
 * The event id written in clear at the front of `state`. Used ONLY to choose
 * where to send an error when the flow cookie is gone; the event of a flow
 * always comes from the signed cookie.
 */
function eventIdFromState(state) {
  if (typeof state !== 'string') return null;
  const dot = state.lastIndexOf('.');
  return dot > 0 ? state.slice(0, dot) : null;
}

async function findEvent(eventId) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 100) return null;
  return eventService.getEventById(eventId);
}

function readFlowCookie(req) {
  const token = parseCookies(req.headers.cookie)[FLOW_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'], audience: FLOW_AUDIENCE });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/events/identity/providers
// ---------------------------------------------------------------------------

const listProviders = (req, res) => {
  sendSuccess(res, { providers: identityProviders.enabledProviders() });
};

// ---------------------------------------------------------------------------
// GET /api/events/:id/identity/:provider/start
// ---------------------------------------------------------------------------

const start = async (req, res) => {
  let event = null;
  try {
    event = await findEvent(req.params.id);
    if (!event) return redirectWithError(res, null);

    const parsed = identityStartSchema.safeParse({ params: req.params });
    if (!parsed.success) return redirectWithError(res, event, 'IDENTITY_FAILED');
    const { provider } = parsed.data.params;

    if (!identityProviders.isEnabled(provider)) return redirectWithError(res, event, 'IDENTITY_FAILED');
    if (CLOSED_STATUSES.includes(event.status)) return redirectWithError(res, event, 'EVENT_CLOSED');

    const state = `${event.id}.${randomToken()}`;
    const nonce = randomToken();
    const flow = jwt.sign(
      { st: state, nn: nonce, ev: event.id, pv: provider },
      config.jwt.secret,
      { algorithm: 'HS256', audience: FLOW_AUDIENCE, expiresIn: FLOW_TTL_SECONDS },
    );

    res.cookie(FLOW_COOKIE, flow, { ...FLOW_COOKIE_BASE, maxAge: OTP_TTL_MS });
    res.set('Cache-Control', 'no-store');
    logger.info({ eventId: event.id, provider, outcome: 'started' }, 'Event identity flow');
    return res.redirect(302, identityProviders.buildAuthorizeUrl(provider, { state, nonce }));
  } catch (err) {
    logger.error({ err, eventId: event?.id }, 'Event identity start failed');
    return redirectWithError(res, event, 'IDENTITY_FAILED');
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/identity/:provider/callback
// ---------------------------------------------------------------------------

const callback = async (req, res) => {
  let event = null;
  let provider = req.params.provider;
  const fail = (code, reason) => {
    const level = code === 'IDENTITY_FAILED' ? 'warn' : 'info';
    logger[level]({ eventId: event?.id, provider, outcome: code, reason }, 'Event identity callback');
    return redirectWithError(res, event, code);
  };

  try {
    // The flow cookie is read once and cleared whatever happens next.
    const flow = readFlowCookie(req);
    res.clearCookie(FLOW_COOKIE, FLOW_COOKIE_BASE);

    const parsed = identityCallbackSchema.safeParse({ params: req.params, body: req.body || {} });
    const body = parsed.success ? parsed.data.body : {};
    event = await findEvent(flow?.ev || eventIdFromState(body.state || req.body?.state));

    if (!parsed.success) return fail('IDENTITY_FAILED', 'invalid_request');
    provider = parsed.data.params.provider;

    if (body.error) {
      return fail(body.error === 'access_denied' ? 'IDENTITY_CANCELLED' : 'IDENTITY_FAILED', `provider:${body.error}`);
    }
    if (!flow || flow.pv !== provider || !body.state || !safeEqual(body.state, flow.st)) {
      return fail('IDENTITY_SESSION_LOST', flow ? 'state_mismatch' : 'no_flow_cookie');
    }
    if (!event) return fail('IDENTITY_FAILED', 'event_not_found');

    let claims;
    try {
      claims = await identityProviders.verifyIdToken(provider, body.id_token, flow.nn);
    } catch (err) {
      return fail('IDENTITY_FAILED', err.reason || err.message);
    }

    if (!identityProviders.isAuthoritativeEmail(provider, claims)) {
      return fail('IDENTITY_EMAIL_UNTRUSTED', claims.email ? 'not_authoritative' : 'no_email');
    }
    if (CLOSED_STATUSES.includes(event.status)) return fail('EVENT_CLOSED');

    // Early capacity check, the same as /register: tell a newcomer now. The
    // authoritative one is the guarded UPDATE that redeems the proof.
    const email = normalizeEmail(claims.email);
    const existing = await eventService.getAttendeeByEmail(event.id, email);
    const holdsSeat = existing && Number(existing.email_verified) === 1;
    if (event.max_attendees && !holdsSeat) {
      const count = await eventService.getAttendeeCount(event.id);
      if (count >= event.max_attendees) return fail('EVENT_FULL');
    }

    const names = identityProviders.namesFromClaims(claims);
    const { attendee, isExisting } = await eventService.registerAttendee(event.id, { ...names, email });
    // IP only on a row this request created, as /register does.
    if (!isExisting) {
      await eventService.updateAttendeeIp(attendee.id, getClientIp(req));
    }

    const proof = await eventService.issueProviderProof(event.id, attendee.id, names);
    if (!proof) return fail('IDENTITY_FAILED', 'proof_not_written');

    res.cookie(RESULT_COOKIE, `${attendee.id}.${proof}`, { ...RESULT_COOKIE_BASE, maxAge: OTP_TTL_MS });
    res.set('Cache-Control', 'no-store');
    logger.info({ eventId: event.id, attendeeId: attendee.id, provider, outcome: 'verified' }, 'Event identity callback');
    return res.redirect(303, eventPageUrl(event, 'acceso'));
  } catch (err) {
    logger.error({ err, eventId: event?.id, provider }, 'Event identity callback failed');
    return redirectWithError(res, event, 'IDENTITY_FAILED');
  }
};

// ---------------------------------------------------------------------------
// POST /api/events/:id/identity/complete
// ---------------------------------------------------------------------------

const PROOF_INVALID_MESSAGE = 'La verificación ha caducado o ya se usó';

const complete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const raw = parseCookies(req.headers.cookie)[RESULT_COOKIE] || '';
    res.clearCookie(RESULT_COOKIE, RESULT_COOKIE_BASE);

    const event = await eventService.getEventById(id);
    if (!event) throw new ApiError(404, 'Evento no encontrado', 'Evento no encontrado');

    const dot = raw.indexOf('.');
    const attendeeId = dot > 0 ? raw.slice(0, dot) : '';
    const proof = dot > 0 ? raw.slice(dot + 1) : '';
    if (!attendeeId || !proof) {
      logger.info({ eventId: id, outcome: 'IDENTITY_PROOF_INVALID', reason: 'no_result_cookie' }, 'Event identity complete');
      throw new ApiError(400, PROOF_INVALID_MESSAGE, 'IDENTITY_PROOF_INVALID');
    }

    const result = await eventService.verifyEmailCode(id, attendeeId, proof);
    if (!result.valid) {
      logger.info({ eventId: id, attendeeId, outcome: result.reason }, 'Event identity complete');
      if (result.reason === 'EVENT_FULL') throw new ApiError(409, 'Aforo completo', 'EVENT_FULL');
      throw new ApiError(400, PROOF_INVALID_MESSAGE, 'IDENTITY_PROOF_INVALID');
    }

    logger.info({ eventId: id, attendeeId, outcome: 'completed' }, 'Event identity complete');
    await respondEmailVerified(req, res, event, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProviders,
  start,
  callback,
  complete,
  // exported for the tests
  FLOW_COOKIE,
  RESULT_COOKIE,
};
