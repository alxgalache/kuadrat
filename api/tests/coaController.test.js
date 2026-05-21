/**
 * Integration tests for the public CoA verification controller.
 *
 * We mock the cryptography service and the database client. The controller's
 * job is to orchestrate them correctly — verify result → DB lookup → status
 * check → anti-replay → atomic update → audit log — and produce the right
 * response in every branch. The crypto itself is covered by
 * ntag424Service.test.js.
 */

jest.mock('../config/env', () => ({
  ipHashSalt: 'sample-salt-for-controller-tests-padding',
}));

jest.mock('../config/database', () => ({
  db: { execute: jest.fn() },
}));

jest.mock('../services/ntag424Service', () => ({
  verifySunParams: jest.fn(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

const { db } = require('../config/database');
const { verifySunParams } = require('../services/ntag424Service');
const { verifyCoa } = require('../controllers/coaController');

function mockReqRes({ picc = 'a'.repeat(32), cmac = 'b'.repeat(16), ip = '203.0.113.10' } = {}) {
  const req = {
    query: { picc, cmac },
    ip,
    get: jest.fn().mockReturnValue('test-user-agent/1.0'),
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

function expectEventInserted(status, uidHex = null, counter = null) {
  const calls = db.execute.mock.calls.map((c) => c[0]);
  const event = calls.find(
    (c) => typeof c === 'object' && c.sql && c.sql.includes('INSERT INTO verification_events'),
  );
  expect(event).toBeDefined();
  expect(event.args[0]).toBe(uidHex);
  expect(event.args[1]).toBe(counter);
  expect(event.args[2]).toBe(status);
  // ip_hash present (truthy 32-hex string)
  expect(typeof event.args[3] === 'string' && event.args[3].length === 32).toBe(true);
  // user_agent passed through
  expect(event.args[4]).toBe('test-user-agent/1.0');
}

beforeEach(() => {
  db.execute.mockReset();
  verifySunParams.mockReset();
});

describe('verifyCoa controller', () => {
  it('returns malformed and audits the event when verifySunParams rejects format', async () => {
    verifySunParams.mockReturnValue({ ok: false, reason: 'MALFORMED' });
    db.execute.mockResolvedValueOnce({ rowsAffected: 1 }); // for the audit insert

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'malformed' });
    expectEventInserted('malformed');
    // No further DB lookup happened
    expect(db.execute.mock.calls.length).toBe(1);
  });

  it('returns invalid_cmac with the recovered UID for audit', async () => {
    verifySunParams.mockReturnValue({
      ok: false,
      reason: 'INVALID_CMAC',
      uidHex: '04A1B2C3D4E5F6',
      counter: 12,
    });
    db.execute.mockResolvedValueOnce({ rowsAffected: 1 });

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'invalid_cmac' });
    expectEventInserted('invalid_cmac', '04A1B2C3D4E5F6', 12);
  });

  it('returns unknown_tag when the UID is not in nfc_tags', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'AB'.repeat(7), counter: 5 });
    db.execute
      .mockResolvedValueOnce({ rows: [] })          // JOIN lookup → no tag
      .mockResolvedValueOnce({ rowsAffected: 1 });  // audit insert

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'unknown_tag' });
    expectEventInserted('unknown_tag', 'AB'.repeat(7), 5);
  });

  it('returns revoked when tag.status is in the terminal set', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'CC'.repeat(7), counter: 9 });
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'CC'.repeat(7),
          tag_status: 'lost',
          last_counter: 8,
          is_permanently_locked: 0,
          art_id: 1,
          art_name: 'Test',
          art_slug: 't',
          art_description: null,
          art_basename: 'x.jpg',
          art_type: 'Físico',
          art_dimensions: null,
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1 });

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'revoked' });
    expectEventInserted('revoked', 'CC'.repeat(7), 9);
  });

  it('returns replay when counter <= last_counter', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'DD'.repeat(7), counter: 5 });
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'DD'.repeat(7),
          tag_status: 'active',
          last_counter: 5,
          is_permanently_locked: 0,
          art_id: 1, art_name: 'T', art_slug: 't',
          art_description: null, art_basename: 'x.jpg',
          art_type: 'Físico', art_dimensions: null,
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1 });

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'replay' });
    expectEventInserted('replay', 'DD'.repeat(7), 5);
  });

  it('returns replay when the atomic UPDATE matches zero rows (race lost)', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'EE'.repeat(7), counter: 10 });
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'EE'.repeat(7),
          tag_status: 'active',
          last_counter: 5,
          is_permanently_locked: 0,
          art_id: 1, art_name: 'T', art_slug: 't',
          art_description: null, art_basename: 'x.jpg',
          art_type: 'Físico', art_dimensions: null,
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: 0 })   // someone else beat us
      .mockResolvedValueOnce({ rowsAffected: 1 });  // audit insert

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, status: 'replay' });
    expectEventInserted('replay', 'EE'.repeat(7), 10);
  });

  it('returns ok with the projected artwork on the happy path', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'FF'.repeat(7), counter: 11 });
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'FF'.repeat(7),
          tag_status: 'active',
          last_counter: 10,
          is_permanently_locked: 1,
          art_id: 42,
          art_name: 'Untitled #7',
          art_slug: 'untitled-7',
          art_description: 'A painting.',
          art_basename: 'untitled7.jpg',
          art_type: 'Físico',
          art_dimensions: '30x40 cm',
        }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1 })   // counter UPDATE
      .mockResolvedValueOnce({ rowsAffected: 1 });  // audit insert

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      status: 'ok',
      counter: 11,
      art: {
        id: 42,
        name: 'Untitled #7',
        slug: 'untitled-7',
        description: 'A painting.',
        basename: 'untitled7.jpg',
        type: 'Físico',
        dimensions: '30x40 cm',
      },
    });
    expectEventInserted('ok', 'FF'.repeat(7), 11);

    // The art projection MUST NOT leak seller-only fields.
    const responseArt = res.json.mock.calls[0][0].art;
    expect(responseArt).not.toHaveProperty('seller_id');
    expect(responseArt).not.toHaveProperty('price');
    expect(responseArt).not.toHaveProperty('visible');
    expect(responseArt).not.toHaveProperty('is_sold');
  });

  it('forwards unexpected DB errors via next() as an ApiError', async () => {
    verifySunParams.mockReturnValue({ ok: true, uidHex: 'AA'.repeat(7), counter: 1 });
    db.execute.mockRejectedValueOnce(new Error('boom'));

    const { req, res, next } = mockReqRes();
    await verifyCoa(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      message: expect.stringMatching(/verificar el certificado/i),
    }));
    expect(res.json).not.toHaveBeenCalled();
  });
});
