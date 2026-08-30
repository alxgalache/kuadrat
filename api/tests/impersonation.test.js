/**
 * Admin impersonation by token exchange (Change: admin-user-impersonation).
 *
 * Exercised end to end through the real routers, so `adminAuth`, the JWT
 * strategy and the SQL guards are all in the path. The point of most of these
 * assertions is not that impersonation works — it is that an impersonation
 * token is indistinguishable from a login token everywhere it should be, and
 * distinguishable in exactly the four places it must be.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const { sqlUtcTimestamp } = require('../utils/passwordSecurity');
const { IMPERSONATION_TTL_MINUTES } = require('../controllers/impersonationController');

const stamp = Date.now();
const ADMIN_EMAIL = `imp-admin${stamp}@test.com`;
const OTHER_ADMIN_EMAIL = `imp-admin2${stamp}@test.com`;
const SELLER_EMAIL = `imp-seller${stamp}@test.com`;
const PENDING_EMAIL = `imp-pending${stamp}@test.com`;

let adminId;
let otherAdminId;
let sellerId;
let pendingId;
let adminToken;
let sellerToken;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const decode = (token) => jwt.verify(token, process.env.JWT_SECRET);

/** Start an impersonation and hand back the whole response. */
const startAs = (token, targetId) =>
  request(app)
    .post(`/api/admin/impersonation/${targetId}/start`)
    .set('Authorization', `Bearer ${token}`);

const sessionRow = async (id) => {
  const res = await db.execute({
    sql: 'SELECT * FROM impersonation_sessions WHERE id = ?',
    args: [id],
  });
  return res.rows[0];
};

const userRow = async (id) => {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return res.rows[0];
};

beforeAll(async () => {
  const hash = await bcrypt.hash('OldPassword1', 10);

  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [ADMIN_EMAIL, hash, 'Admin Impersonador'],
  });
  adminId = Number(admin.lastInsertRowid);
  adminToken = tokenFor(adminId, ADMIN_EMAIL, 'admin');

  const otherAdmin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
    args: [OTHER_ADMIN_EMAIL, hash, 'Otro Admin'],
  });
  otherAdminId = Number(otherAdmin.lastInsertRowid);

  const seller = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
    args: [SELLER_EMAIL, hash, 'Artista Activada'],
  });
  sellerId = Number(seller.lastInsertRowid);
  sellerToken = tokenFor(sellerId, SELLER_EMAIL, 'seller');

  const pending = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, '', 'seller', ?)",
    args: [PENDING_EMAIL, 'Artista Pendiente'],
  });
  pendingId = Number(pending.lastInsertRowid);
});

// No row cleanup: the test database is a local file recreated from scratch by
// globalSetup on every run.

describe('POST /api/admin/impersonation/:userId/start', () => {
  it('mints a token for the target carrying the admin as actor', async () => {
    const res = await startAs(adminToken, sellerId);

    expect(res.statusCode).toBe(200);

    const payload = decode(res.body.token);
    expect(payload.id).toBe(sellerId);
    expect(payload.email).toBe(SELLER_EMAIL);
    expect(payload.role).toBe('seller');
    expect(payload.act).toMatchObject({ id: adminId, email: ADMIN_EMAIL });
    expect(typeof payload.act.sid).toBe('number');

    expect(res.body.user).toEqual({
      id: sellerId,
      email: SELLER_EMAIL,
      role: 'seller',
      full_name: 'Artista Activada',
    });
  });

  it('expires 60 minutes out, not after JWT_EXPIRES_IN', async () => {
    const res = await startAs(adminToken, sellerId);
    const payload = decode(res.body.token);

    const minutesAway = (payload.exp - Math.floor(Date.now() / 1000)) / 60;
    expect(minutesAway).toBeGreaterThan(IMPERSONATION_TTL_MINUTES - 1);
    expect(minutesAway).toBeLessThanOrEqual(IMPERSONATION_TTL_MINUTES);
  });

  it('opens an audit row and leaves the target user untouched', async () => {
    const before = await userRow(sellerId);

    const res = await startAs(adminToken, sellerId);
    const row = await sessionRow(decode(res.body.token).act.sid);

    expect(Number(row.admin_user_id)).toBe(adminId);
    expect(Number(row.target_user_id)).toBe(sellerId);
    expect(row.ended_at).toBeNull();
    expect(row.ended_reason).toBeNull();
    expect(row.expires_at).toBeTruthy();

    // The IP is hashed, never stored raw. supertest connects from ::ffff:127.0.0.1.
    expect(row.ip_address).not.toContain('127.0.0.1');
    expect(row.ip_address).toMatch(/^[a-f0-9]+$/);

    expect(await userRow(sellerId)).toEqual(before);
  });

  it('never leaks a credential column into the response', async () => {
    const res = await startAs(adminToken, sellerId);
    const body = JSON.stringify(res.body);

    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('password_setup_token');
    expect(body).not.toContain('password_reset_token_hash');
    expect(body).not.toContain('$2b$');
  });

  it('refuses another admin as target', async () => {
    const res = await startAs(adminToken, otherAdminId);

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_TARGET_FORBIDDEN');
  });

  it('refuses the admin naming themselves', async () => {
    const res = await startAs(adminToken, adminId);

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_TARGET_FORBIDDEN');
  });

  it('refuses a target who never activated', async () => {
    const res = await startAs(adminToken, pendingId);

    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('IMPERSONATION_TARGET_NOT_ACTIVATED');
  });

  it('404s on a target that does not exist', async () => {
    const res = await startAs(adminToken, 99999999);
    expect(res.statusCode).toBe(404);
  });

  it('refuses a seller and writes no audit row', async () => {
    const before = await db.execute('SELECT COUNT(*) AS c FROM impersonation_sessions');

    const res = await startAs(sellerToken, sellerId);
    expect(res.statusCode).toBe(401);

    const after = await db.execute('SELECT COUNT(*) AS c FROM impersonation_sessions');
    expect(Number(after.rows[0].c)).toBe(Number(before.rows[0].c));
  });

  it('refuses an unauthenticated request', async () => {
    const res = await request(app).post(`/api/admin/impersonation/${sellerId}/start`);
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/impersonation/stop', () => {
  const stopWith = (token) =>
    request(app).post('/api/auth/impersonation/stop').set('Authorization', `Bearer ${token}`);

  it('hands back an admin session and closes the audit row', async () => {
    const started = await startAs(adminToken, sellerId);
    const sid = decode(started.body.token).act.sid;

    const res = await stopWith(started.body.token);
    expect(res.statusCode).toBe(200);

    const payload = decode(res.body.token);
    expect(payload.id).toBe(adminId);
    expect(payload.role).toBe('admin');
    expect(payload.act).toBeUndefined();

    const row = await sessionRow(sid);
    expect(row.ended_at).toBeTruthy();
    expect(row.ended_reason).toBe('manual');
  });

  it('does not rewrite the end time on a second stop', async () => {
    const started = await startAs(adminToken, sellerId);
    const sid = decode(started.body.token).act.sid;

    await stopWith(started.body.token);
    const firstEnd = (await sessionRow(sid)).ended_at;

    await stopWith(started.body.token);
    expect((await sessionRow(sid)).ended_at).toBe(firstEnd);
  });

  it('refuses an ordinary token with IMPERSONATION_NOT_ACTIVE', async () => {
    const res = await stopWith(sellerToken);

    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('IMPERSONATION_NOT_ACTIVE');
  });

  it('refuses when the actor is no longer an admin', async () => {
    const demotedEmail = `imp-demoted${stamp}@test.com`;
    const hash = await bcrypt.hash('OldPassword1', 10);
    const inserted = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
      args: [demotedEmail, hash, 'Admin a Degradar'],
    });
    const demotedId = Number(inserted.lastInsertRowid);

    const started = await startAs(tokenFor(demotedId, demotedEmail, 'admin'), sellerId);
    expect(started.statusCode).toBe(200);

    await db.execute({ sql: "UPDATE users SET role = 'seller' WHERE id = ?", args: [demotedId] });

    const res = await stopWith(started.body.token);
    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_ACTOR_INVALID');
  });

  it('refuses when the actor no longer exists', async () => {
    // The state is built by signing the claim directly rather than by deleting
    // the admin: `impersonation_sessions.admin_user_id` is a foreign key, so
    // an admin with impersonation history CANNOT be deleted — the audit trail
    // is not erasable by removing the account, which is the property an audit
    // table is for. (Nothing in the API deletes users anyway; `grep "DELETE
    // FROM users"` over api/ outside tests returns nothing.) The controller's
    // `!admin` branch stays as the defence that makes that guarantee not the
    // only thing standing between a stale claim and an admin token.
    const orphaned = jwt.sign(
      {
        id: sellerId,
        email: SELLER_EMAIL,
        role: 'seller',
        act: { id: 99999999, email: 'gone@test.com', iat: Math.floor(Date.now() / 1000), sid: 1 },
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await stopWith(orphaned);
    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_ACTOR_INVALID');
  });

  it("refuses when the actor's password changed after the session started", async () => {
    const started = await startAs(adminToken, sellerId);

    // An admin whose password is reset is signed out everywhere. Being inside
    // an impersonation must not be the one place that survives it.
    await db.execute({
      sql: 'UPDATE users SET password_changed_at = ? WHERE id = ?',
      args: [sqlUtcTimestamp(new Date(Date.now() + 60_000)), adminId],
    });

    const res = await stopWith(started.body.token);
    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_ACTOR_INVALID');

    await db.execute({
      sql: 'UPDATE users SET password_changed_at = NULL WHERE id = ?',
      args: [adminId],
    });
  });

  it('rejects an expired impersonation token before reaching the handler', async () => {
    const expired = jwt.sign(
      {
        id: sellerId,
        email: SELLER_EMAIL,
        role: 'seller',
        act: { id: adminId, email: ADMIN_EMAIL, iat: Math.floor(Date.now() / 1000) - 7200, sid: 1 },
      },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await stopWith(expired);
    expect(res.statusCode).toBe(401);
  });
});

describe('an impersonation token is an ordinary user token', () => {
  it('resolves seller endpoints exactly as the seller own token does', async () => {
    const started = await startAs(adminToken, sellerId);

    const asSeller = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${sellerToken}`);
    const asImpersonator = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${started.body.token}`);

    expect(asImpersonator.statusCode).toBe(asSeller.statusCode);
    expect(asImpersonator.statusCode).toBe(200);
    expect(asImpersonator.body).toEqual(asSeller.body);
  });

  it('cannot reach an admin route, so nested impersonation is impossible', async () => {
    const started = await startAs(adminToken, sellerId);

    const res = await request(app)
      .get('/api/admin/authors')
      .set('Authorization', `Bearer ${started.body.token}`);
    expect(res.statusCode).toBe(401);

    const nested = await startAs(started.body.token, sellerId);
    expect(nested.statusCode).toBe(401);
  });

  it('is rejected once the target password changes, like any stale token', async () => {
    const victimEmail = `imp-victim${stamp}@test.com`;
    const hash = await bcrypt.hash('OldPassword1', 10);
    const inserted = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
      args: [victimEmail, hash, 'Artista Victima'],
    });
    const victimId = Number(inserted.lastInsertRowid);

    const started = await startAs(adminToken, victimId);
    expect(started.statusCode).toBe(200);

    await db.execute({
      sql: 'UPDATE users SET password_changed_at = ? WHERE id = ?',
      args: [sqlUtcTimestamp(new Date(Date.now() + 60_000)), victimId],
    });

    const res = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${started.body.token}`);
    expect(res.statusCode).toBe(401);
  });

  it('leaves req.impersonator undefined for a token minted by the login route', async () => {
    // Proven through the guard, which is the only observable consequence of
    // req.impersonator: an ordinary seller token must pass straight through it.
    const res = await request(app)
      .put('/api/seller/profile/password')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ currentPassword: 'WrongPassword1', newPassword: 'NewPassword1', confirmPassword: 'NewPassword1' });

    // 401 from the wrong current password — it got PAST the impersonation
    // guard, which would have answered 403 with a different title.
    expect(res.statusCode).not.toBe(403);
    expect(res.body.title).not.toBe('IMPERSONATION_ACTION_BLOCKED');
  });
});

describe('blockWhileImpersonating on PUT /api/seller/profile/password', () => {
  it('refuses the password change and writes nothing', async () => {
    const started = await startAs(adminToken, sellerId);
    const before = await userRow(sellerId);

    const res = await request(app)
      .put('/api/seller/profile/password')
      .set('Authorization', `Bearer ${started.body.token}`)
      .send({ currentPassword: 'OldPassword1', newPassword: 'NewPassword1', confirmPassword: 'NewPassword1' });

    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('IMPERSONATION_ACTION_BLOCKED');

    const after = await userRow(sellerId);
    expect(after.password_hash).toBe(before.password_hash);
    expect(after.password_changed_at).toBe(before.password_changed_at);
  });

  it('lets the artist change their own password normally', async () => {
    const ownerEmail = `imp-owner${stamp}@test.com`;
    const hash = await bcrypt.hash('OldPassword1', 10);
    const inserted = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
      args: [ownerEmail, hash, 'Artista Propietaria'],
    });
    const ownerId = Number(inserted.lastInsertRowid);

    const res = await request(app)
      .put('/api/seller/profile/password')
      .set('Authorization', `Bearer ${tokenFor(ownerId, ownerEmail, 'seller')}`)
      .send({ currentPassword: 'OldPassword1', newPassword: 'NewPassword1', confirmPassword: 'NewPassword1' });

    expect(res.statusCode).toBe(200);

    const after = await userRow(ownerId);
    expect(after.password_hash).not.toBe(hash);
    expect(after.password_changed_at).toBeTruthy();
  });
});
