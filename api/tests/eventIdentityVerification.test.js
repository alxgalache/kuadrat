/**
 * Event access with a Google or Microsoft account (change:
 * event-identity-provider-verification).
 *
 * What this pins down:
 *   - the provider replaces the MAILBOX, never the flow: the callback issues no
 *     credential, and the proof it leaves is redeemed through verifyEmailCode,
 *     the same guarded UPDATE as the 6-digit code (capacity included);
 *   - the trust rule: the provider's word counts only for a mailbox it hosts
 *     (@gmail.com or Workspace for Google; Outlook/Hotmail/Live for Microsoft
 *     personal accounts). Anything else goes back to the email code;
 *   - the id_token checks (signature, aud, iss, exp, nonce, tid) and the flow
 *     cookie that binds a callback to the browser that started it;
 *   - nothing secret in a URL, and nothing of it in Sentry.
 *
 * No network: tokens are signed here with a throwaway RSA key and the JWKS is
 * injected with identityProviders.__setFetchForTests().
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID, generateKeyPairSync } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const config = require('../config/env');
const { resolveEventIdentity } = require('../config/env');
const emailService = require('../services/emailService');
const eventService = require('../services/eventService');
const identityProviders = require('../services/identityProviders');
const { createVerifiedAttendee } = require('./helpers/eventAttendees');
const { sha256 } = require('../utils/emailOtp');
const { parseCookies } = require('../utils/cookies');
const { scrubIdentityRequest } = require('../utils/sentryIdentityScrub');

const TID = identityProviders.MICROSOFT_CONSUMERS_TENANT_ID;
const MS_ISSUER = `https://login.microsoftonline.com/${TID}/v2.0`;
const KID = 'test-key-1';

const goodKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rogueKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = {
  keys: [{ ...goodKeys.publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }],
};

let jwksFetches = 0;
function fakeJwksFetch() {
  jwksFetches += 1;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === 'cache-control' ? 'public, max-age=3600' : null) },
    json: async () => JWKS,
  });
}

const stamp = Date.now();
let hostId;

async function createEvent({ accessType = 'free', status = 'scheduled', maxAttendees = null, price = null } = {}) {
  const id = randomUUID();
  const slug = `idp-${id.slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO events
            (id, title, slug, event_datetime, host_user_id, access_type, price,
             category, status, livekit_room_name, provider, max_attendees, format)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'charla', ?, ?, 'livekit', ?, 'live')`,
    args: [id, `Evento ${slug}`, slug, new Date().toISOString(), hostId, accessType, price,
      status, `room-${id}`, maxAttendees],
  });
  return { id, slug };
}

const uniq = () => randomUUID().slice(0, 8);

async function attendeeRows(eventId) {
  const r = await db.execute({ sql: 'SELECT * FROM event_attendees WHERE event_id = ?', args: [eventId] });
  return r.rows;
}

async function rowByEmail(eventId, email) {
  return eventService.getAttendeeByEmail(eventId, email);
}

/** GET start → { state, nonce, flowCookie ('ev_idp_flow=…'), res } */
async function startFlow(eventId, provider = 'google') {
  const res = await request(app).get(`/api/events/${eventId}/identity/${provider}/start`);
  const location = res.headers.location ? new URL(res.headers.location) : null;
  const setCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('ev_idp_flow='));
  return {
    res,
    location,
    state: location?.searchParams.get('state'),
    nonce: location?.searchParams.get('nonce'),
    flowCookie: setCookie ? setCookie.split(';')[0] : null,
    flowCookieHeader: setCookie,
  };
}

function baseClaims(provider, email) {
  return provider === 'google'
    ? {
      iss: 'https://accounts.google.com', aud: config.eventIdentity.google.clientId, sub: '1001',
      email, email_verified: true, given_name: 'Ana', family_name: 'García López', name: 'Ana García López',
      picture: 'https://example.com/foto.jpg',
    }
    : {
      iss: MS_ISSUER, aud: config.eventIdentity.microsoft.clientId, tid: TID, sub: 'ms-1001',
      email, given_name: 'Ana', family_name: 'García López', name: 'Ana García López',
    };
}

/** An id_token signed with the test key (or another one), claims overridable. */
function idToken(provider, nonce, overrides = {}, { key = goodKeys.privateKey, kid = KID } = {}) {
  const payload = { ...baseClaims(provider, `ana-${uniq()}@gmail.com`), nonce, ...overrides };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  const options = { algorithm: 'RS256', keyid: kid };
  if (!('exp' in payload)) options.expiresIn = '5m';
  return jwt.sign(payload, key, options);
}

function postCallback(provider, form, cookie) {
  let req = request(app).post(`/api/events/identity/${provider}/callback`).type('form').send(form);
  if (cookie) req = req.set('Cookie', cookie);
  return req;
}

function fragment(res) {
  return new URL(res.headers.location).hash.slice(1);
}

function resultCookieOf(res) {
  const c = (res.headers['set-cookie'] || []).find((s) => s.startsWith('ev_idp_result=') && !/Expires=Thu, 01 Jan 1970/.test(s));
  return c ? { header: c, pair: c.split(';')[0] } : null;
}

/** start → callback with a token for `email` (claims overridable). */
async function verifyWith(eventId, provider, email, overrides = {}) {
  const flow = await startFlow(eventId, provider);
  const token = idToken(provider, flow.nonce, { email, ...overrides });
  const res = await postCallback(provider, { id_token: token, state: flow.state }, flow.flowCookie);
  return { res, flow, result: resultCookieOf(res) };
}

function complete(eventId, cookiePair) {
  let req = request(app).post(`/api/events/${eventId}/identity/complete`);
  if (cookiePair) req = req.set('Cookie', cookiePair);
  return req;
}

beforeAll(async () => {
  const hash = await bcrypt.hash('Password1', 10);
  const host = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [`idp-host${stamp}@test.com`, hash, 'Hugo Host'],
  });
  hostId = Number(host.lastInsertRowid);
});

beforeEach(() => {
  emailService.__clearOutbox();
  identityProviders.__setFetchForTests(fakeJwksFetch);
});

afterAll(() => identityProviders.__resetForTests());

// ---------------------------------------------------------------------------

describe('configuration', () => {
  const base = { SITE_API_BASE_URL: 'https://api.pre.140d.art' };

  it('accepts well-formed public ids and defaults the callback base to SITE_API_BASE_URL', () => {
    const cfg = resolveEventIdentity({
      ...base,
      GOOGLE_OIDC_CLIENT_ID: '123-abc.apps.googleusercontent.com',
      MICROSOFT_OIDC_CLIENT_ID: '11111111-2222-4333-8444-555555555555',
    });
    expect(cfg.google.clientId).toBe('123-abc.apps.googleusercontent.com');
    expect(cfg.callbackBaseUrl).toBe('https://api.pre.140d.art');
  });

  it('fails startup on a malformed id, naming the variable', () => {
    expect(() => resolveEventIdentity({ ...base, GOOGLE_OIDC_CLIENT_ID: 'not-a-client-id' }))
      .toThrow(/GOOGLE_OIDC_CLIENT_ID/);
    expect(() => resolveEventIdentity({ ...base, MICROSOFT_OIDC_CLIENT_ID: 'not-a-guid' }))
      .toThrow(/MICROSOFT_OIDC_CLIENT_ID/);
  });

  it('refuses a plain-http callback base outside localhost', () => {
    expect(() => resolveEventIdentity({
      GOOGLE_OIDC_CLIENT_ID: 'x.apps.googleusercontent.com', IDENTITY_CALLBACK_BASE_URL: 'http://api.140d.art',
    })).toThrow(/IDENTITY_CALLBACK_BASE_URL/);
    expect(resolveEventIdentity({
      GOOGLE_OIDC_CLIENT_ID: 'x.apps.googleusercontent.com', IDENTITY_CALLBACK_BASE_URL: 'http://localhost:3001/',
    }).callbackBaseUrl).toBe('http://localhost:3001');
  });

  it('with no ids there is nothing to validate and no provider is enabled', () => {
    const cfg = resolveEventIdentity({ IDENTITY_CALLBACK_BASE_URL: 'http://whatever' });
    expect(cfg.google.clientId).toBe('');
    expect(cfg.microsoft.clientId).toBe('');
  });

  it('GET /identity/providers lists the enabled providers in display order', async () => {
    const both = await request(app).get('/api/events/identity/providers');
    expect(both.status).toBe(200);
    expect(both.body.providers).toEqual(['google', 'microsoft']);

    const saved = config.eventIdentity.microsoft.clientId;
    config.eventIdentity.microsoft.clientId = '';
    try {
      const one = await request(app).get('/api/events/identity/providers');
      expect(one.body.providers).toEqual(['google']);
    } finally {
      config.eventIdentity.microsoft.clientId = saved;
    }
  });
});

describe('GET /:id/identity/:provider/start', () => {
  let event;
  beforeAll(async () => { event = await createEvent(); });

  it('redirects to Google with id_token + form_post and sets the flow cookie', async () => {
    const { res, location, state, nonce, flowCookie, flowCookieHeader } = await startFlow(event.id, 'google');
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('response_type')).toBe('id_token');
    expect(location.searchParams.get('response_mode')).toBe('form_post');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('prompt')).toBe('select_account');
    expect(location.searchParams.get('client_id')).toBe(config.eventIdentity.google.clientId);
    expect(location.searchParams.get('redirect_uri'))
      .toBe('http://localhost:3001/api/events/identity/google/callback');
    expect(state.startsWith(`${event.id}.`)).toBe(true);

    expect(flowCookieHeader).toMatch(/HttpOnly/i);
    expect(flowCookieHeader).toMatch(/Secure/i);
    expect(flowCookieHeader).toMatch(/SameSite=None/i);
    expect(flowCookieHeader).toMatch(/Path=\/api\/events\/identity/);

    const flow = jwt.decode(decodeURIComponent(flowCookie.split('=')[1]));
    expect(flow.nn).toBe(nonce);
    expect(flow.st).toBe(state);
    expect(flow.ev).toBe(event.id);
  });

  it('sends Microsoft to the personal-accounts authority', async () => {
    const { res, location } = await startFlow(event.id, 'microsoft');
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname)
      .toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
  });

  it('a finished event answers EVENT_CLOSED without a cookie', async () => {
    const closed = await createEvent({ status: 'finished' });
    const { res, flowCookie } = await startFlow(closed.id, 'google');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`http://localhost:3000/live/${closed.slug}#acceso-error=EVENT_CLOSED`);
    expect(flowCookie).toBeNull();
  });

  it('an unknown event goes to /live', async () => {
    const { res } = await startFlow(randomUUID(), 'google');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('http://localhost:3000/live');
  });

  it('a disabled provider answers IDENTITY_FAILED without a cookie', async () => {
    const saved = config.eventIdentity.microsoft.clientId;
    config.eventIdentity.microsoft.clientId = '';
    try {
      const { res, flowCookie } = await startFlow(event.id, 'microsoft');
      expect(fragment(res)).toBe('acceso-error=IDENTITY_FAILED');
      expect(flowCookie).toBeNull();
    } finally {
      config.eventIdentity.microsoft.clientId = saved;
    }
  });
});

describe('callback: rejections create or change nothing', () => {
  let event;
  beforeAll(async () => { event = await createEvent(); });

  async function expectRejected(promise, code) {
    const before = (await attendeeRows(event.id)).length;
    const res = await promise;
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`http://localhost:3000/live/${event.slug}#acceso-error=${code}`);
    expect(resultCookieOf(res)).toBeNull();
    expect((await attendeeRows(event.id)).length).toBe(before);
    return res;
  }

  it('without the flow cookie → IDENTITY_SESSION_LOST, routed by the event in state', async () => {
    const flow = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('google', { id_token: idToken('google', flow.nonce), state: flow.state }),
      'IDENTITY_SESSION_LOST',
    );
  });

  it('a state that is not the cookie\'s → IDENTITY_SESSION_LOST', async () => {
    const a = await startFlow(event.id, 'google');
    const b = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('google', { id_token: idToken('google', a.nonce), state: b.state }, a.flowCookie),
      'IDENTITY_SESSION_LOST',
    );
  });

  it('a state pointing at another event cannot redirect the flow there', async () => {
    const other = await createEvent();
    const a = await startFlow(event.id, 'google');
    const forged = `${other.id}.${a.state.split('.')[1]}`;
    const res = await postCallback('google', { id_token: idToken('google', a.nonce), state: forged }, a.flowCookie);
    expect(fragment(res)).toBe('acceso-error=IDENTITY_SESSION_LOST');
    expect(res.headers.location).toContain(`/live/${event.slug}#`);
    expect(await attendeeRows(other.id)).toHaveLength(0);
  });

  it('clears the flow cookie whatever the outcome', async () => {
    const flow = await startFlow(event.id, 'google');
    const res = await postCallback('google', { error: 'access_denied', state: flow.state }, flow.flowCookie);
    const cleared = (res.headers['set-cookie'] || []).find((c) => c.startsWith('ev_idp_flow='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('the attendee cancelling at the provider → IDENTITY_CANCELLED', async () => {
    const flow = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('google', { error: 'access_denied', state: flow.state }, flow.flowCookie),
      'IDENTITY_CANCELLED',
    );
  });

  it('any other provider error → IDENTITY_FAILED', async () => {
    const flow = await startFlow(event.id, 'microsoft');
    await expectRejected(
      postCallback('microsoft', { error: 'server_error', state: flow.state }, flow.flowCookie),
      'IDENTITY_FAILED',
    );
  });

  const tokenCases = [
    ['signed with another key', (p, n) => idToken(p, n, {}, { key: rogueKeys.privateKey })],
    ['for another application (aud)', (p, n) => idToken(p, n, { aud: 'someone-else.apps.googleusercontent.com' })],
    ['from another issuer', (p, n) => idToken(p, n, { iss: 'https://evil.example.com' })],
    ['expired', (p, n) => idToken(p, n, { exp: Math.floor(Date.now() / 1000) - 600 })],
    ['with another nonce', (p) => idToken(p, 'not-the-nonce')],
    ['with an unknown kid', (p, n) => idToken(p, n, {}, { kid: 'unknown-kid' })],
  ];
  it.each(tokenCases)('a Google token %s → IDENTITY_FAILED', async (_label, makeToken) => {
    const flow = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('google', { id_token: makeToken('google', flow.nonce), state: flow.state }, flow.flowCookie),
      'IDENTITY_FAILED',
    );
  });

  it('a Microsoft token from a work or school tenant → IDENTITY_FAILED', async () => {
    const flow = await startFlow(event.id, 'microsoft');
    const token = idToken('microsoft', flow.nonce, { email: 'ana@outlook.es', tid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    await expectRejected(
      postCallback('microsoft', { id_token: token, state: flow.state }, flow.flowCookie),
      'IDENTITY_FAILED',
    );
  });

  it('a Google token presented to the Microsoft callback → IDENTITY_SESSION_LOST', async () => {
    const flow = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('microsoft', { id_token: idToken('google', flow.nonce), state: flow.state }, flow.flowCookie),
      'IDENTITY_SESSION_LOST',
    );
  });

  const untrusted = [
    ['google', 'Google account on a Yahoo address, no hd', { email: 'ana@yahoo.es', email_verified: true }],
    ['google', 'Gmail not verified', { email: 'ana@gmail.com', email_verified: false }],
    ['microsoft', 'personal Microsoft account on a Gmail address', { email: 'ana@gmail.com' }],
    ['microsoft', 'Microsoft account without email (phone sign-up)', { email: undefined }],
  ];
  it.each(untrusted)('%s: %s → IDENTITY_EMAIL_UNTRUSTED', async (provider, _label, overrides) => {
    const flow = await startFlow(event.id, provider);
    const token = idToken(provider, flow.nonce, overrides);
    await expectRejected(
      postCallback(provider, { id_token: token, state: flow.state }, flow.flowCookie),
      'IDENTITY_EMAIL_UNTRUSTED',
    );
  });

  it('a full event → EVENT_FULL before any row is created', async () => {
    const full = await createEvent({ maxAttendees: 1 });
    await createVerifiedAttendee(full.id, { first_name: 'Primera', last_name: 'Plaza', email: `full-${uniq()}@test.com` });
    const before = (await attendeeRows(full.id)).length;
    const { res } = await verifyWith(full.id, 'google', `nueva-${uniq()}@gmail.com`);
    expect(res.headers.location).toBe(`http://localhost:3000/live/${full.slug}#acceso-error=EVENT_FULL`);
    expect((await attendeeRows(full.id)).length).toBe(before);
  });

  it('with the default transport (no network under test) → IDENTITY_FAILED', async () => {
    identityProviders.__resetForTests(); // drops the injected JWKS and the cache
    const flow = await startFlow(event.id, 'google');
    await expectRejected(
      postCallback('google', { id_token: idToken('google', flow.nonce), state: flow.state }, flow.flowCookie),
      'IDENTITY_FAILED',
    );
  });
});

describe('callback: success leaves a proof, never a credential', () => {
  let event;
  beforeAll(async () => { event = await createEvent(); });

  it.each([
    ['google', 'a Gmail address', (u) => ({ email: `ana-${u}@gmail.com` })],
    ['google', 'a Workspace account (hd)', (u) => ({ email: `ana-${u}@estudio.es`, hd: 'estudio.es' })],
    ['microsoft', 'an Outlook personal account', (u) => ({ email: `ana-${u}@outlook.es` })],
  ])('%s with %s', async (provider, _label, claims) => {
    const { email, ...rest } = claims(uniq());
    const { res, result } = await verifyWith(event.id, provider, email, rest);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`http://localhost:3000/live/${event.slug}#acceso`);

    const row = await rowByEmail(event.id, email);
    expect(row.first_name).toBe('Ana');
    expect(row.last_name).toBe('García López');
    expect(Number(row.email_verified)).toBe(0);
    expect(row.access_token_hash).toBeNull();
    expect(row.ip_address).toBeTruthy();

    // The cookie holds <attendeeId>.<proof>; only its hash is stored.
    const [attendeeId, proof] = decodeURIComponent(result.pair.split('=')[1]).split('.');
    expect(attendeeId).toBe(row.id);
    expect(row.verification_code_hash).toBe(sha256(proof));
    expect(result.header).toMatch(/HttpOnly/i);
    expect(result.header).toMatch(/Secure/i);
    expect(result.header).toMatch(/SameSite=Lax/i);
    expect(result.header).toMatch(/Path=\/api\/events(;|$)/);

    // Nothing secret in the URL.
    expect(res.headers.location).not.toContain(proof);
  });

  it('an unverified row someone else created takes the provider\'s names', async () => {
    const email = `squat-${uniq()}@gmail.com`;
    const { attendee } = await eventService.registerAttendee(event.id, { first_name: 'Pepe', last_name: 'Falso', email });
    await verifyWith(event.id, 'google', email);
    const row = await rowByEmail(event.id, email);
    expect(row.id).toBe(attendee.id);
    expect(row.first_name).toBe('Ana');
    expect(row.last_name).toBe('García López');
  });

  it('a verified row keeps its own names and its seat', async () => {
    const email = `vera-${uniq()}@gmail.com`;
    await createVerifiedAttendee(event.id, { first_name: 'Vera', last_name: 'Verificada', email });
    const { res } = await verifyWith(event.id, 'google', email, { given_name: 'Otra', family_name: 'Persona', name: 'Otra Persona' });
    expect(fragment(res)).toBe('acceso');
    const row = await rowByEmail(event.id, email);
    expect(row.first_name).toBe('Vera');
    expect(row.last_name).toBe('Verificada');
    expect(Number(row.email_verified)).toBe(1);
  });

  it('an account with no surname is stored with an empty last name', async () => {
    const email = `solo-${uniq()}@gmail.com`;
    await verifyWith(event.id, 'google', email, { given_name: 'Ana', family_name: undefined, name: 'Ana' });
    const row = await rowByEmail(event.id, email);
    expect(row.first_name).toBe('Ana');
    expect(row.last_name).toBe('');
  });
});

describe('POST /:id/identity/complete', () => {
  it('free event: the credential is born, with the password and one confirmation email', async () => {
    const event = await createEvent();
    const email = `free-${uniq()}@gmail.com`;
    const { result } = await verifyWith(event.id, 'google', email);

    const res = await complete(event.id, result.pair);
    expect(res.status).toBe(200);
    expect(res.body.paymentRequired).toBe(false);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.accessPassword).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body).toMatchObject({ firstName: 'Ana', lastName: 'García López', email });

    const row = await rowByEmail(event.id, email);
    expect(Number(row.email_verified)).toBe(1);
    expect(row.access_token_hash).toBe(sha256(res.body.accessToken));
    expect(row.verification_code_hash).toBeNull();

    expect(emailService.__getOutbox().filter((m) => m.to === email)).toHaveLength(1);
    const cleared = (res.headers['set-cookie'] || []).find((c) => c.startsWith('ev_idp_result='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('paid event: token in hand, payment pending, no password yet', async () => {
    const event = await createEvent({ accessType: 'paid', price: 10 });
    const { result } = await verifyWith(event.id, 'microsoft', `paga-${uniq()}@hotmail.com`);
    const res = await complete(event.id, result.pair);
    expect(res.status).toBe(200);
    expect(res.body.paymentRequired).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.accessPassword).toBeUndefined();
  });

  it('a proof works once', async () => {
    const event = await createEvent();
    const { result } = await verifyWith(event.id, 'google', `once-${uniq()}@gmail.com`);
    expect((await complete(event.id, result.pair)).status).toBe(200);
    const again = await complete(event.id, result.pair);
    expect(again.status).toBe(400);
    expect(again.body.title).toBe('IDENTITY_PROOF_INVALID');
  });

  it('without the cookie → IDENTITY_PROOF_INVALID', async () => {
    const event = await createEvent();
    const res = await complete(event.id);
    expect(res.status).toBe(400);
    expect(res.body.title).toBe('IDENTITY_PROOF_INVALID');
  });

  it('the event filling up between callback and redeem → 409 EVENT_FULL, row stays unverified', async () => {
    const event = await createEvent({ maxAttendees: 1 });
    const email = `late-${uniq()}@gmail.com`;
    const { result } = await verifyWith(event.id, 'google', email);
    await createVerifiedAttendee(event.id, { first_name: 'Rápida', last_name: 'Plaza', email: `fast-${uniq()}@test.com` });

    const res = await complete(event.id, result.pair);
    expect(res.status).toBe(409);
    expect(res.body.title).toBe('EVENT_FULL');
    const row = await rowByEmail(event.id, email);
    expect(Number(row.email_verified)).toBe(0);
    expect(row.access_token_hash).toBeNull();
  });

  it('a returning attendee gets a new token and the same password', async () => {
    const event = await createEvent();
    const email = `back-${uniq()}@gmail.com`;
    const first = await complete(event.id, (await verifyWith(event.id, 'google', email)).result.pair);
    const second = await complete(event.id, (await verifyWith(event.id, 'google', email)).result.pair);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).not.toBe(first.body.accessToken);
    expect(second.body.accessPassword).toBe(first.body.accessPassword);
  });

  it('the proof cannot be redeemed as a 6-digit code through /verify-email', async () => {
    const event = await createEvent();
    const email = `code-${uniq()}@gmail.com`;
    const { result } = await verifyWith(event.id, 'google', email);
    const [attendeeId, proof] = decodeURIComponent(result.pair.split('=')[1]).split('.');
    const res = await request(app).post(`/api/events/${event.id}/verify-email`).send({ attendeeId, code: proof });
    expect(res.status).toBe(400);
    expect(Number((await rowByEmail(event.id, email)).email_verified)).toBe(0);
  });
});

describe('POST /verify-email shares the same response', () => {
  it('also returns firstName, lastName and email', async () => {
    const event = await createEvent();
    const email = `otp-${uniq()}@test.com`;
    const reg = await request(app).post(`/api/events/${event.id}/register`)
      .send({ first_name: 'Olga', last_name: 'Código', email });
    const { attendeeId } = reg.body;
    await request(app).post(`/api/events/${event.id}/send-verification`).send({ attendeeId });
    const message = emailService.__getOutbox().filter((m) => m.to === email).pop();
    const code = message.html.match(/>(\d{6})<\/p>/)[1];

    const res = await request(app).post(`/api/events/${event.id}/verify-email`).send({ attendeeId, code });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Olga', lastName: 'Código', email, paymentRequired: false });
  });
});

describe('trust rule and names (unit)', () => {
  const g = (claims) => identityProviders.isAuthoritativeEmail('google', claims);
  const m = (claims) => identityProviders.isAuthoritativeEmail('microsoft', claims);

  it('Google is the owner only of Gmail and Workspace mailboxes', () => {
    expect(g({ email: 'Ana@Gmail.com', email_verified: true })).toBe(true);
    expect(g({ email: 'ana@estudio.es', email_verified: true, hd: 'estudio.es' })).toBe(true);
    expect(g({ email: 'ana@yahoo.es', email_verified: true })).toBe(false);
    expect(g({ email: 'ana@gmail.com', email_verified: false })).toBe(false);
    expect(g({ email: 'ana@estudio.es', email_verified: false, hd: 'estudio.es' })).toBe(false);
    expect(g({ email_verified: true })).toBe(false);
  });

  it('Microsoft is the owner only of its consumer domains, for personal accounts', () => {
    expect(m({ email: 'ana@outlook.es', tid: TID })).toBe(true);
    expect(m({ email: 'ana@hotmail.com', tid: TID })).toBe(true);
    expect(m({ email: 'ana@live.com', tid: TID })).toBe(true);
    expect(m({ email: 'ana@gmail.com', tid: TID })).toBe(false);
    expect(m({ email: 'ana@outlook.es', tid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })).toBe(false);
    expect(m({ tid: TID })).toBe(false);
  });

  it('names come from the claims, with fallbacks and the 120-character cap', () => {
    const n = identityProviders.namesFromClaims;
    expect(n({ given_name: 'Ana', family_name: 'García', name: 'Ana García' })).toEqual({ first_name: 'Ana', last_name: 'García' });
    expect(n({ given_name: 'Ana María', name: 'Ana María López' })).toEqual({ first_name: 'Ana María', last_name: 'López' });
    expect(n({ name: 'Luis Pérez Gil' })).toEqual({ first_name: 'Luis', last_name: 'Pérez Gil' });
    expect(n({ given_name: 'Ana', name: 'Ana' })).toEqual({ first_name: 'Ana', last_name: '' });
    expect(n({ email: 'solo.email@gmail.com' })).toEqual({ first_name: 'solo.email', last_name: '' });
    expect(n({ given_name: 'x'.repeat(200), family_name: 'y'.repeat(200) }).first_name).toHaveLength(120);
  });
});

describe('JWKS cache', () => {
  it('downloads the keys once for several callbacks', async () => {
    identityProviders.__resetForTests();
    identityProviders.__setFetchForTests(fakeJwksFetch);
    jwksFetches = 0;
    const event = await createEvent();
    await verifyWith(event.id, 'google', `c1-${uniq()}@gmail.com`);
    await verifyWith(event.id, 'google', `c2-${uniq()}@gmail.com`);
    expect(jwksFetches).toBe(1);
  });
});

describe('Sentry never receives the flow\'s cookies or body', () => {
  it('scrubs cookies, body and the cookie header on /identity/ URLs only', () => {
    const event = {
      request: {
        url: 'https://api.140d.art/api/events/identity/google/callback',
        cookies: { ev_idp_flow: 'x' },
        data: { id_token: 'secret' },
        headers: { Cookie: 'ev_idp_result=abc', 'user-agent': 'UA' },
      },
    };
    const scrubbed = scrubIdentityRequest(event);
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.headers).toEqual({ 'user-agent': 'UA' });
    expect(scrubbed.request.url).toBe(event.request.url);

    const other = { request: { url: 'https://api.140d.art/api/events', data: { a: 1 }, cookies: { b: '2' } } };
    expect(scrubIdentityRequest(other)).toBe(other);
    expect(scrubIdentityRequest({ message: 'no request' })).toEqual({ message: 'no request' });
  });

  it('parseCookies reads the pairs and survives garbage', () => {
    expect(parseCookies('a=1; ev_idp_result=x.y; bad; =z; c=%E0%A4%A')).toEqual({ a: '1', ev_idp_result: 'x.y', c: '%E0%A4%A' });
    expect(parseCookies(undefined)).toEqual({});
  });
});
