/**
 * Session invalidation on password change
 * (Change: admin-password-reset-and-event-access).
 *
 * Three angles:
 *  1. The pure decision function, including the timezone trap that motivates
 *     it and the same-second boundary.
 *  2. The JWT strategy end to end through a real authenticated route.
 *  3. A source invariant: no statement may write password_hash without
 *     writing password_changed_at alongside it.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const {
  isJwtIssuedBeforePasswordChange,
  parseSqlUtcDate,
  sqlUtcTimestamp,
} = require('../utils/passwordSecurity');

describe('isJwtIssuedBeforePasswordChange', () => {
  // 2026-08-16 10:00:00 UTC
  const CHANGED_AT = '2026-08-16 10:00:00';
  const CHANGED_AT_SEC = Math.floor(Date.UTC(2026, 7, 16, 10, 0, 0) / 1000);

  it('accepts every token when the column is NULL', () => {
    expect(isJwtIssuedBeforePasswordChange(0, null)).toBe(false);
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC - 99999, undefined)).toBe(false);
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC - 99999, '')).toBe(false);
  });

  it('rejects a token issued before the change', () => {
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC - 1, CHANGED_AT)).toBe(true);
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC - 86400, CHANGED_AT)).toBe(true);
  });

  it('accepts a token issued after the change', () => {
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC + 1, CHANGED_AT)).toBe(false);
  });

  it('accepts a token issued within the same second as the change', () => {
    // Strict `<`: resetting a password and signing in immediately must not
    // hand out a token the very next request throws away.
    expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC, CHANGED_AT)).toBe(false);
  });

  it('rejects a token with no usable iat once the column is set', () => {
    expect(isJwtIssuedBeforePasswordChange(undefined, CHANGED_AT)).toBe(true);
    expect(isJwtIssuedBeforePasswordChange(NaN, CHANGED_AT)).toBe(true);
  });

  it('reads a zone-less SQLite timestamp as UTC, whatever TZ the process runs in', () => {
    // SQLite writes CURRENT_TIMESTAMP in UTC with no zone marker. Node's Date
    // would read it as LOCAL time — two hours off under Europe/Madrid in
    // summer, enough to invalidate the wrong sessions in either direction.
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        expect(parseSqlUtcDate(CHANGED_AT).getTime()).toBe(CHANGED_AT_SEC * 1000);
        expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC - 1, CHANGED_AT)).toBe(true);
        expect(isJwtIssuedBeforePasswordChange(CHANGED_AT_SEC, CHANGED_AT)).toBe(false);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('also understands a value that already carries a zone', () => {
    expect(parseSqlUtcDate('2026-08-16T10:00:00.000Z').getTime()).toBe(CHANGED_AT_SEC * 1000);
    expect(parseSqlUtcDate(new Date(CHANGED_AT_SEC * 1000)).getTime()).toBe(CHANGED_AT_SEC * 1000);
  });

  it('sqlUtcTimestamp emits the exact shape CURRENT_TIMESTAMP does', () => {
    expect(sqlUtcTimestamp(new Date(CHANGED_AT_SEC * 1000))).toBe(CHANGED_AT);
    expect(sqlUtcTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('sorts against CURRENT_TIMESTAMP the way an ISO string would not', async () => {
    // The reason sqlUtcTimestamp exists: on the same calendar day,
    // '...T10:00:00.000Z' sorts ABOVE '... 12:00:00' because 'T' > ' '.
    const iso = new Date(Date.UTC(2026, 7, 16, 10, 0, 0)).toISOString();
    const now = '2026-08-16 12:00:00';
    expect(iso > now).toBe(true); // wrong: an expired token would read as live
    expect(sqlUtcTimestamp(new Date(Date.UTC(2026, 7, 16, 10, 0, 0))) > now).toBe(false);
  });
});

describe('JWT strategy rejects tokens predating the password change', () => {
  const email = `invalidation${Date.now()}@test.com`;
  let userId;

  const tokenIssuedAt = (iat) =>
    jwt.sign({ id: userId, email, role: 'seller', iat }, process.env.JWT_SECRET);

  beforeAll(async () => {
    const hash = await bcrypt.hash('Password1', 10);
    const res = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'seller', ?)",
      args: [email, hash, 'Invalidation Tester'],
    });
    userId = Number(res.lastInsertRowid);
  });

  afterAll(async () => {
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
  });

  const setChangedAt = (value) =>
    db.execute({
      sql: 'UPDATE users SET password_changed_at = ? WHERE id = ?',
      args: [value, userId],
    });

  const callProtectedRoute = (token) =>
    request(app).get('/api/seller/profile').set('Authorization', `Bearer ${token}`);

  it('accepts any token while password_changed_at is NULL', async () => {
    await setChangedAt(null);
    const res = await callProtectedRoute(tokenIssuedAt(Math.floor(Date.now() / 1000) - 86400));
    expect(res.statusCode).toBe(200);
  });

  it('rejects a token issued before the change', async () => {
    const now = Math.floor(Date.now() / 1000);
    await setChangedAt(sqlUtcTimestamp(new Date(now * 1000)));
    const res = await callProtectedRoute(tokenIssuedAt(now - 60));
    expect(res.statusCode).toBe(401);
  });

  it('accepts a token issued after the change', async () => {
    const now = Math.floor(Date.now() / 1000);
    await setChangedAt(sqlUtcTimestamp(new Date((now - 60) * 1000)));
    const res = await callProtectedRoute(tokenIssuedAt(now));
    expect(res.statusCode).toBe(200);
  });

  it('accepts a token issued in the same second as the change', async () => {
    const now = Math.floor(Date.now() / 1000);
    await setChangedAt(sqlUtcTimestamp(new Date(now * 1000)));
    const res = await callProtectedRoute(tokenIssuedAt(now));
    expect(res.statusCode).toBe(200);
  });

  it('honours a timestamp written by SQLite itself', async () => {
    await db.execute({
      sql: 'UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [userId],
    });
    const res = await callProtectedRoute(tokenIssuedAt(Math.floor(Date.now() / 1000) - 3600));
    expect(res.statusCode).toBe(401);
  });
});

describe('source invariant: password_hash is never written without password_changed_at', () => {
  const roots = ['controllers', 'routes', 'services'].map((d) => path.join(__dirname, '..', d));

  const collectJsFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsFiles(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });

  it('every UPDATE users statement assigning password_hash also assigns password_changed_at', () => {
    const offenders = [];
    for (const root of roots) {
      for (const file of collectJsFiles(root)) {
        const source = fs.readFileSync(file, 'utf8');
        const updates = source.match(/UPDATE\s+users[\s\S]{0,500}?WHERE[^`'"]*/gi) || [];
        for (const stmt of updates) {
          // `password_hash = ?` — an assignment, not a `SELECT password_hash`
          // or a `WHERE password_hash != ''` read.
          if (/\bpassword_hash\s*=\s*\?/i.test(stmt) && !/password_changed_at/i.test(stmt)) {
            offenders.push(`${path.relative(process.cwd(), file)}: ${stmt.slice(0, 140)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
