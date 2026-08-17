/**
 * Admin-initiated password reset
 * (Change: admin-password-reset-and-event-access).
 *
 * Exercised end to end through the real routers, so the admin gate, the
 * rate-limited public endpoints and the SQL guards are all in the path. Email
 * never leaves the process: under NODE_ENV=test the transport is `noop` and
 * every message lands in the in-memory outbox.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const emailService = require('../services/emailService');
const { hashResetToken, sqlUtcTimestamp } = require('../utils/passwordSecurity');
const { redactUrl, REDACTED } = require('../utils/redactUrl');

const stamp = Date.now();
const ACTIVATED_EMAIL = `reset-activated${stamp}@test.com`;
const PENDING_EMAIL = `reset-pending${stamp}@test.com`;
const ADMIN_EMAIL = `reset-admin${stamp}@test.com`;

let activatedId;
let pendingId;
let adminToken;
let sellerToken;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Pull the reset link out of the last message the outbox received. */
const lastResetTokenFor = (email) => {
  const message = emailService.__getOutbox().filter((m) => m.to === email).pop();
  if (!message) return null;
  const match = /\/restablecer-password\/([a-f0-9]{64})/.exec(message.html || '');
  return match ? match[1] : null;
};

const storedHashFor = async (id) => {
  const res = await db.execute({
    sql: 'SELECT password_reset_token_hash, password_reset_token_expires, password_hash FROM users WHERE id = ?',
    args: [id],
  });
  return res.rows[0];
};

beforeAll(async () => {
  const hash = await bcrypt.hash('OldPassword1', 10);

  const activated = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [ACTIVATED_EMAIL, hash, 'Artista Activada'],
  });
  activatedId = Number(activated.lastInsertRowid);

  const pending = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, '', 'seller', ?)",
    args: [PENDING_EMAIL, 'Artista Pendiente'],
  });
  pendingId = Number(pending.lastInsertRowid);

  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [ADMIN_EMAIL, hash, 'Admin'],
  });
  adminToken = tokenFor(Number(admin.lastInsertRowid), ADMIN_EMAIL, 'admin');
  sellerToken = tokenFor(activatedId, ACTIVATED_EMAIL, 'seller');
});

// No row cleanup: the test database is a local file recreated from scratch by
// globalSetup on every run, and a root-level afterAll would land after the one
// in setup/afterEnv.js that closes the libsql client.

beforeEach(() => emailService.__clearOutbox());

describe('POST /api/admin/authors/:id/send-password-reset', () => {
  it('issues a link to an activated artist and stores only its hash', async () => {
    const res = await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);

    const token = lastResetTokenFor(ACTIVATED_EMAIL);
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const row = await storedHashFor(activatedId);
    expect(row.password_reset_token_hash).toBe(hashResetToken(token));
    // The plaintext must exist nowhere but the email.
    expect(row.password_reset_token_hash).not.toBe(token);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('sets the expiry roughly 24 hours out', async () => {
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    const row = await storedHashFor(activatedId);
    const expiresMs = new Date(`${row.password_reset_token_expires.replace(' ', 'T')}Z`).getTime();
    const hoursAway = (expiresMs - Date.now()) / 3_600_000;
    expect(hoursAway).toBeGreaterThan(23.9);
    expect(hoursAway).toBeLessThan(24.1);
  });

  it('refuses an artist who never activated', async () => {
    const res = await request(app)
      .post(`/api/admin/authors/${pendingId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
    expect((await storedHashFor(pendingId)).password_reset_token_hash).toBeNull();
    expect(emailService.__getOutbox()).toHaveLength(0);
  });

  it('returns 404 for an unknown author', async () => {
    const res = await request(app)
      .post('/api/admin/authors/99999999/send-password-reset')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(404);
  });

  it('refuses a non-admin', async () => {
    const res = await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.statusCode).toBe(401);
    expect(emailService.__getOutbox()).toHaveLength(0);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).post(`/api/admin/authors/${activatedId}/send-password-reset`);
    expect(res.statusCode).toBe(401);
  });

  it('a second send invalidates the first link', async () => {
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    const first = lastResetTokenFor(ACTIVATED_EMAIL);

    emailService.__clearOutbox();
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    const second = lastResetTokenFor(ACTIVATED_EMAIL);

    expect(second).not.toBe(first);
    expect((await request(app).get(`/api/auth/validate-reset-token/${first}`)).statusCode).toBe(404);
    expect((await request(app).get(`/api/auth/validate-reset-token/${second}`)).statusCode).toBe(200);
  });
});

describe('POST /api/admin/authors/send-password-reset-all', () => {
  it('reaches activated artists only, and is not swallowed by the /:id route', async () => {
    const res = await request(app)
      .post('/api/admin/authors/send-password-reset-all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);
    expect(res.body.failed).toBe(0);
    expect(res.body.total).toBe(res.body.sent);

    const recipients = emailService.__getOutbox().map((m) => m.to);
    expect(recipients).toContain(ACTIVATED_EMAIL);
    expect(recipients).not.toContain(PENDING_EMAIL);
    expect((await storedHashFor(pendingId)).password_reset_token_hash).toBeNull();
  });

  it('refuses a non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/authors/send-password-reset-all')
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/auth/validate-reset-token/:token', () => {
  let token;

  beforeEach(async () => {
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    token = lastResetTokenFor(ACTIVATED_EMAIL);
  });

  it('accepts a live token and returns only the name', async () => {
    const res = await request(app).get(`/api/auth/validate-reset-token/${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({ full_name: 'Artista Activada' });
    // A stolen link must not confirm which account it opens.
    expect(JSON.stringify(res.body)).not.toContain(ACTIVATED_EMAIL);
  });

  it('answers 404 RESET_TOKEN_INVALID for an unknown token', async () => {
    const res = await request(app).get(`/api/auth/validate-reset-token/${'0'.repeat(64)}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.title).toBe('RESET_TOKEN_INVALID');
  });

  it('answers 410 RESET_TOKEN_EXPIRED for a token past its expiry', async () => {
    await db.execute({
      sql: 'UPDATE users SET password_reset_token_expires = ? WHERE id = ?',
      args: [sqlUtcTimestamp(new Date(Date.now() - 60_000)), activatedId],
    });

    const res = await request(app).get(`/api/auth/validate-reset-token/${token}`);
    expect(res.statusCode).toBe(410);
    expect(res.body.title).toBe('RESET_TOKEN_EXPIRED');
  });

  it('treats an expiry later the same day as live, not as sorted-above', async () => {
    // Guards the ISO-vs-CURRENT_TIMESTAMP sorting trap from the other side:
    // an expiry only minutes away must still read as valid.
    await db.execute({
      sql: 'UPDATE users SET password_reset_token_expires = ? WHERE id = ?',
      args: [sqlUtcTimestamp(new Date(Date.now() + 120_000)), activatedId],
    });

    const res = await request(app).get(`/api/auth/validate-reset-token/${token}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  let token;

  beforeEach(async () => {
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, password_changed_at = NULL WHERE id = ?',
      args: [await bcrypt.hash('OldPassword1', 10), activatedId],
    });
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    token = lastResetTokenFor(ACTIVATED_EMAIL);
    emailService.__clearOutbox();
  });

  const submit = (body) => request(app).post('/api/auth/reset-password').send(body);

  it('sets the new password, burns the token and stamps the cut-off', async () => {
    const res = await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });

    expect(res.statusCode).toBe(200);
    // No session handed out — the artist signs in with the new password.
    expect(res.body.token).toBeUndefined();

    const row = await storedHashFor(activatedId);
    expect(await bcrypt.compare('NuevaClave1', row.password_hash)).toBe(true);
    expect(row.password_reset_token_hash).toBeNull();
    expect(row.password_reset_token_expires).toBeNull();

    const changed = await db.execute({
      sql: 'SELECT password_changed_at FROM users WHERE id = ?',
      args: [activatedId],
    });
    expect(changed.rows[0].password_changed_at).toBeTruthy();
  });

  it('lets the artist log in with the new password afterwards', async () => {
    await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ACTIVATED_EMAIL, password: 'NuevaClave1' });

    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  it('invalidates a session opened before the reset', async () => {
    const before = jwt.sign(
      { id: activatedId, email: ACTIVATED_EMAIL, role: 'seller', iat: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET
    );
    expect(
      (await request(app).get('/api/seller/profile').set('Authorization', `Bearer ${before}`)).statusCode
    ).toBe(200);

    await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });

    expect(
      (await request(app).get('/api/seller/profile').set('Authorization', `Bearer ${before}`)).statusCode
    ).toBe(401);
  });

  it('notifies the artist that the password changed', async () => {
    await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });
    // Fired without blocking the response.
    await new Promise((resolve) => setImmediate(resolve));

    const notice = emailService.__getOutbox().find((m) => m.to === ACTIVATED_EMAIL);
    expect(notice).toBeDefined();
    expect(notice.subject).toMatch(/contraseña/i);
  });

  it('refuses a reused token with 404 and leaves the first password in place', async () => {
    await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });

    const second = await submit({ token, password: 'OtraClave2', confirmPassword: 'OtraClave2' });
    expect(second.statusCode).toBe(404);
    expect(second.body.title).toBe('RESET_TOKEN_INVALID');

    const row = await storedHashFor(activatedId);
    expect(await bcrypt.compare('NuevaClave1', row.password_hash)).toBe(true);
  });

  it('lets exactly one of two concurrent requests through', async () => {
    const results = await Promise.all([
      submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' }),
      submit({ token, password: 'OtraClave2', confirmPassword: 'OtraClave2' }),
    ]);

    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 404]);
    // Never a 500 — the loser must lose cleanly.
    expect(codes).not.toContain(500);
  });

  it('rejects mismatched passwords and keeps the token usable', async () => {
    const res = await submit({ token, password: 'NuevaClave1', confirmPassword: 'DistintaClave2' });
    expect(res.statusCode).toBe(400);

    expect((await request(app).get(`/api/auth/validate-reset-token/${token}`)).statusCode).toBe(200);
  });

  it('rejects a weak password with RESET_PASSWORD_WEAK and keeps the token usable', async () => {
    const res = await submit({ token, password: 'debil', confirmPassword: 'debil' });
    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('RESET_PASSWORD_WEAK');

    expect((await request(app).get(`/api/auth/validate-reset-token/${token}`)).statusCode).toBe(200);
  });

  it('rejects an expired token with 410 and leaves the password untouched', async () => {
    await db.execute({
      sql: 'UPDATE users SET password_reset_token_expires = ? WHERE id = ?',
      args: [sqlUtcTimestamp(new Date(Date.now() - 60_000)), activatedId],
    });

    const res = await submit({ token, password: 'NuevaClave1', confirmPassword: 'NuevaClave1' });
    expect(res.statusCode).toBe(410);
    expect(res.body.title).toBe('RESET_TOKEN_EXPIRED');

    const row = await storedHashFor(activatedId);
    expect(await bcrypt.compare('OldPassword1', row.password_hash)).toBe(true);
  });
});

describe('the activation flow stays closed for activated accounts', () => {
  it('a reset token does not reopen validate-setup-token / set-password', async () => {
    // Give the artist BOTH an activation token and a reset token at once —
    // the state an admin could produce by clicking the two buttons. The
    // activation endpoints must still refuse, because password_hash is set.
    await db.execute({
      sql: `UPDATE users
            SET password_setup_token = 'legacy-setup-token', password_setup_token_expires = ?
            WHERE id = ?`,
      args: [new Date(Date.now() + 86_400_000).toISOString(), activatedId],
    });
    await request(app)
      .post(`/api/admin/authors/${activatedId}/send-password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    const validate = await request(app).get('/api/auth/validate-setup-token/legacy-setup-token');
    expect(validate.statusCode).toBe(400);

    const set = await request(app).post('/api/auth/set-password').send({
      token: 'legacy-setup-token',
      password: 'Colada1234',
      confirmPassword: 'Colada1234',
    });
    expect(set.statusCode).toBe(400);

    await db.execute({
      sql: 'UPDATE users SET password_setup_token = NULL, password_setup_token_expires = NULL WHERE id = ?',
      args: [activatedId],
    });
  });
});

describe('reset links never reach the logs', () => {
  it('redacts the credential segment of every token-bearing URL', () => {
    const token = 'a'.repeat(64);
    expect(redactUrl(`/api/auth/validate-reset-token/${token}`)).toBe(
      `/api/auth/validate-reset-token/${REDACTED}`
    );
    expect(redactUrl(`/api/auth/validate-setup-token/${token}`)).toBe(
      `/api/auth/validate-setup-token/${REDACTED}`
    );
    expect(redactUrl(`/api/orders/public/token/${token}/contact`)).toBe(
      `/api/orders/public/token/${REDACTED}/contact`
    );
    expect(redactUrl(`/api/events/7/video/clip.mp4?vtoken=${token}&x=1`)).toBe(
      `/api/events/7/video/clip.mp4?vtoken=${REDACTED}&x=1`
    );
  });

  it('leaves ordinary URLs alone', () => {
    expect(redactUrl('/api/art?page=2')).toBe('/api/art?page=2');
    expect(redactUrl('/api/admin/authors/12')).toBe('/api/admin/authors/12');
    expect(redactUrl('/health')).toBe('/health');
  });
});
