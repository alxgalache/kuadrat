const crypto = require('crypto');
const express = require('express');
const config = require('../config/env');

const router = express.Router();

// Password gate of the preproduction site (WEB_APP_HIDDEN). Not a security
// boundary — the API stays public there — but it must be revocable
// (live-event-access-hardening): the browser used to keep a bare `'true'` for
// 30 days, so changing TEST_ACCESS_PASSWORD locked out nobody who had already
// entered with the old one.
//
// `verify` now hands out a token that carries a FINGERPRINT of the password in
// force, and `check` recomputes it on every page load. Change the password and
// every outstanding token stops matching at once. The fingerprint is an HMAC
// keyed with JWT_SECRET, so it neither reveals the password nor can be forged
// without the secret; rotating JWT_SECRET also revokes every token.

const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isGateEnabled = () => {
  const flag = config.webAppHidden;
  return flag === 'true' || flag === '1';
};

const hmac = (value) => crypto.createHmac('sha256', config.jwt.secret).update(value).digest();
const passwordFingerprint = (password) => hmac(`test-access:${password}`).toString('hex').slice(0, 32);
const b64url = (value) => Buffer.from(value).toString('base64url');

function issueToken(password) {
  const payload = b64url(JSON.stringify({ fp: passwordFingerprint(password), exp: Date.now() + ACCESS_TTL_MS }));
  return `${payload}.${hmac(payload).toString('base64url')}`;
}

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

function tokenIsValid(token, expectedPassword) {
  if (typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, hmac(payload).toString('base64url'))) return false;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (typeof data?.exp !== 'number' || Date.now() > data.exp) return false;
  return safeEqual(data.fp, passwordFingerprint(expectedPassword));
}

// When WEB_APP_HIDDEN is not enabled these routes behave as if they did not
// exist, to avoid exposing anything in public environments.
router.post('/verify', (req, res) => {
  if (!isGateEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  const expectedPassword = config.testAccessPassword;
  if (!expectedPassword) {
    return res.status(500).json({ success: false, message: 'Test access password not configured' });
  }

  const { password } = req.body || {};

  if (typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  // Compared through their HMACs: same length, constant time
  if (safeEqual(hmac(password).toString('hex'), hmac(expectedPassword).toString('hex'))) {
    return res.json({ success: true, token: issueToken(expectedPassword) });
  }

  return res.status(401).json({ success: false, message: 'Invalid password' });
});

// Still valid for the password configured right now?
router.post('/check', (req, res) => {
  if (!isGateEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  const expectedPassword = config.testAccessPassword;
  if (!expectedPassword) {
    return res.status(500).json({ success: false, message: 'Test access password not configured' });
  }
  if (tokenIsValid(req.body?.token, expectedPassword)) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Invalid or expired access' });
});

module.exports = router;
