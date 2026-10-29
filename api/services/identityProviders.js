/**
 * Google and Microsoft as a stand-in for the email code when an attendee joins
 * a live event (change: event-identity-provider-verification).
 *
 * The provider never replaces the FLOW, only the mailbox: a verified id_token
 * leads to a one-time proof that is redeemed through eventService.verifyEmailCode,
 * the single place an attendee credential is born. This module only answers
 * "who is this, and is the provider the owner of that mailbox?":
 *
 *   buildAuthorizeUrl   the full-page redirect (OpenID Connect, `id_token` +
 *                       `form_post`: no SDK, no client secret, nothing in a URL)
 *   verifyIdToken       RS256 against the provider's JWKS, aud, iss, exp, nonce
 *                       and, for Microsoft, the personal-accounts tenant
 *   isAuthoritativeEmail  the trust rule (see below)
 *   namesFromClaims     first and last name, the only data kept besides the email
 *
 * No dependency beyond `jsonwebtoken`: the JWK becomes a KeyObject with
 * crypto.createPublicKey. Under NODE_ENV=test the network transport throws;
 * tests sign their own tokens and inject the JWKS with __setFetchForTests().
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const emailOtp = require('../utils/emailOtp');

// The tenant every personal Microsoft account (Outlook, Hotmail, Live) belongs to.
const MICROSOFT_CONSUMERS_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  // Personal accounts only: the `consumers` authority. A work or school
  // account gets Microsoft's own "use a personal account" screen and never
  // reaches the callback; the `tid` check below does not rely on that.
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    issuers: [`https://login.microsoftonline.com/${MICROSOFT_CONSUMERS_TENANT_ID}/v2.0`],
    jwksUri: 'https://login.microsoftonline.com/consumers/discovery/v2.0/keys',
  },
};

// Fixed order: the order of the cards in the modal.
const PROVIDER_ORDER = ['google', 'microsoft'];

// Mailboxes Microsoft itself hosts. A personal account can be created with any
// address (a Gmail, a company one): Microsoft verified it once, at sign-up, and
// does not vouch for who controls it today. Only for these domains is Microsoft
// the owner of the mailbox. A domain missing here falls back to the email code,
// which is safe, so the list only needs to grow when attendees ask.
const MICROSOFT_CONSUMER_DOMAINS = new Set([
  'outlook.com', 'outlook.es', 'outlook.fr', 'outlook.it', 'outlook.de',
  'hotmail.com', 'hotmail.es', 'hotmail.fr', 'hotmail.it', 'hotmail.de', 'hotmail.co.uk',
  'live.com', 'live.es', 'live.fr', 'live.it', 'live.co.uk', 'live.com.mx', 'live.com.ar',
  'msn.com',
]);

const NAME_MAX_LENGTH = 120; // same cap as registerAttendeeSchema
const JWKS_TIMEOUT_MS = 5000;
const JWKS_MIN_TTL_MS = 5 * 60 * 1000;
const JWKS_MAX_TTL_MS = 24 * 60 * 60 * 1000;
const JWKS_DEFAULT_TTL_MS = 60 * 60 * 1000;
const JWKS_UNKNOWN_KID_REFETCH_MS = 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 60;

/** Thrown by verifyIdToken; `reason` goes to the log, never to the browser. */
class IdentityTokenError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.name = 'IdentityTokenError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function isKnownProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

function clientIdFor(provider) {
  return config.eventIdentity?.[provider]?.clientId || '';
}

function isEnabled(provider) {
  return isKnownProvider(provider) && !!clientIdFor(provider);
}

/** The enabled providers, in the order the modal shows them. */
function enabledProviders() {
  return PROVIDER_ORDER.filter(isEnabled);
}

/** The redirect URI registered, character for character, in each console. */
function callbackUrl(provider) {
  return `${config.eventIdentity.callbackBaseUrl}/api/events/identity/${provider}/callback`;
}

function buildAuthorizeUrl(provider, { state, nonce }) {
  const url = new URL(PROVIDERS[provider].authorizeUrl);
  url.search = new URLSearchParams({
    client_id: clientIdFor(provider),
    redirect_uri: callbackUrl(provider),
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

// ---------------------------------------------------------------------------
// JWKS (in-memory cache per provider)
// ---------------------------------------------------------------------------

const defaultFetch = (...args) => {
  if (config.nodeEnv === 'test') {
    throw new Error('identityProviders: network transport disabled under NODE_ENV=test');
  }
  return fetch(...args);
};
let fetchImpl = defaultFetch;

// provider → { keys: Map<kid, KeyObject>, expiresAt, fetchedAt }
const jwksCache = new Map();
// provider → Promise, so concurrent callbacks share one download
const jwksInFlight = new Map();

function ttlFromCacheControl(header) {
  const match = /max-age=(\d+)/i.exec(header || '');
  if (!match) return JWKS_DEFAULT_TTL_MS;
  const ms = Number(match[1]) * 1000;
  return Math.min(JWKS_MAX_TTL_MS, Math.max(JWKS_MIN_TTL_MS, ms));
}

async function downloadJwks(provider) {
  const res = await fetchImpl(PROVIDERS[provider].jwksUri, {
    signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new IdentityTokenError('JWKS_UNAVAILABLE', `JWKS answered ${res.status}`);
  }
  const body = await res.json();
  const keys = new Map();
  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (jwk.kty !== 'RSA' || !jwk.kid || !jwk.n || !jwk.e) continue;
    if (jwk.use && jwk.use !== 'sig') continue;
    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
    } catch {
      // A key we cannot parse is a key we cannot verify with: skip it.
    }
  }
  const now = Date.now();
  const entry = { keys, fetchedAt: now, expiresAt: now + ttlFromCacheControl(res.headers?.get?.('cache-control')) };
  jwksCache.set(provider, entry);
  return entry;
}

function refreshJwks(provider) {
  if (!jwksInFlight.has(provider)) {
    const pending = downloadJwks(provider)
      .catch((err) => {
        logger.warn({ provider, err: err.message }, 'Identity provider JWKS download failed');
        throw err instanceof IdentityTokenError ? err : new IdentityTokenError('JWKS_UNAVAILABLE', err.message);
      })
      .finally(() => jwksInFlight.delete(provider));
    jwksInFlight.set(provider, pending);
  }
  return jwksInFlight.get(provider);
}

/**
 * The verification key with this `kid`. A fresh cache answers from memory; an
 * unknown kid (the provider rotated its keys) forces a download, at most once
 * a minute per provider, so a stream of forged kids cannot hammer the JWKS.
 */
async function getSigningKey(provider, kid) {
  let entry = jwksCache.get(provider);
  const now = Date.now();
  if (!entry || now >= entry.expiresAt) {
    entry = await refreshJwks(provider);
  } else if (!entry.keys.has(kid) && now - entry.fetchedAt >= JWKS_UNKNOWN_KID_REFETCH_MS) {
    entry = await refreshJwks(provider);
  }
  return entry.keys.get(kid) || null;
}

// ---------------------------------------------------------------------------
// id_token verification
// ---------------------------------------------------------------------------

/**
 * Verify an id_token from the `form_post` and return its claims.
 * Throws IdentityTokenError for anything that is not a valid token for THIS
 * client, issued by THIS provider for THIS flow (nonce).
 */
async function verifyIdToken(provider, idToken, expectedNonce) {
  if (!isEnabled(provider)) throw new IdentityTokenError('PROVIDER_DISABLED');
  if (typeof idToken !== 'string' || !idToken) throw new IdentityTokenError('TOKEN_MISSING');

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || decoded.header?.alg !== 'RS256' || !decoded.header?.kid) {
    throw new IdentityTokenError('TOKEN_MALFORMED');
  }

  const key = await getSigningKey(provider, decoded.header.kid);
  if (!key) throw new IdentityTokenError('UNKNOWN_KID');

  let claims;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      audience: clientIdFor(provider),
      issuer: PROVIDERS[provider].issuers,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
  } catch (err) {
    throw new IdentityTokenError('TOKEN_REJECTED', err.message);
  }

  if (!emailOtp.safeEqual(String(claims.nonce || ''), String(expectedNonce || '')) || !expectedNonce) {
    throw new IdentityTokenError('NONCE_MISMATCH');
  }
  if (provider === 'microsoft' && claims.tid !== MICROSOFT_CONSUMERS_TENANT_ID) {
    throw new IdentityTokenError('NOT_A_PERSONAL_ACCOUNT');
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Trust rule and names
// ---------------------------------------------------------------------------

function emailDomain(email) {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1) : '';
}

/**
 * Does the provider OWN this mailbox, so that its word can replace the email
 * code? Accepting a wrong email is not just a seat: verifying an existing
 * attendee's email issues a new token (ending their session) and hands back
 * their password, and in a paid event the access they paid for.
 *
 *   google     email_verified AND (an @gmail.com address OR a Workspace account,
 *              signalled by `hd`). Google's own rule: for any other address
 *              "Google is not authoritative", email_verified only says it was
 *              verified once, and "ownership … may have since changed".
 *   microsoft  a personal account (tid) whose address is on a domain Microsoft
 *              hosts. Microsoft issues no email_verified at all.
 *
 * Anything else falls back to the email code, which proves control TODAY.
 */
function isAuthoritativeEmail(provider, claims) {
  const email = emailOtp.normalizeEmail(claims?.email || '');
  const domain = emailDomain(email);
  if (!domain) return false;

  if (provider === 'google') {
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const workspace = typeof claims.hd === 'string' && claims.hd.trim() !== '';
    return verified && (domain === 'gmail.com' || workspace);
  }
  if (provider === 'microsoft') {
    return claims.tid === MICROSOFT_CONSUMERS_TENANT_ID && MICROSOFT_CONSUMER_DOMAINS.has(domain);
  }
  return false;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * First and last name from the claims, capped like the email form.
 *   first: given_name → first word of `name` → local part of the email
 *   last:  family_name → the rest of `name` → '' (last_name is NOT NULL, not
 *          non-empty; some Google accounts carry no surname)
 */
function namesFromClaims(claims) {
  const name = clean(claims?.name);
  const given = clean(claims?.given_name);
  const family = clean(claims?.family_name);
  const email = emailOtp.normalizeEmail(claims?.email || '');

  const firstName = given || name.split(' ')[0] || email.split('@')[0] || '';

  let lastName = family;
  if (!lastName && name) {
    const lowerName = name.toLowerCase();
    const lowerFirst = firstName.toLowerCase();
    if (lowerName === lowerFirst) lastName = '';
    else if (lowerName.startsWith(`${lowerFirst} `)) lastName = name.slice(firstName.length).trim();
    else lastName = name.split(' ').slice(1).join(' ');
  }

  return {
    first_name: firstName.slice(0, NAME_MAX_LENGTH),
    last_name: lastName.slice(0, NAME_MAX_LENGTH),
  };
}

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

function __setFetchForTests(fn) {
  if (config.nodeEnv !== 'test') {
    throw new Error('__setFetchForTests is only available under NODE_ENV=test');
  }
  fetchImpl = fn || defaultFetch;
}

function __resetForTests() {
  if (config.nodeEnv !== 'test') {
    throw new Error('__resetForTests is only available under NODE_ENV=test');
  }
  jwksCache.clear();
  jwksInFlight.clear();
  fetchImpl = defaultFetch;
}

module.exports = {
  MICROSOFT_CONSUMERS_TENANT_ID,
  IdentityTokenError,
  isKnownProvider,
  isEnabled,
  enabledProviders,
  callbackUrl,
  buildAuthorizeUrl,
  verifyIdToken,
  isAuthoritativeEmail,
  namesFromClaims,
  __setFetchForTests,
  __resetForTests,
};
