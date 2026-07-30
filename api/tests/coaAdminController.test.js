/**
 * Unit tests for the admin endpoints that list and manage NFC tags.
 *
 * The handlers are pure controllers — DB access is mocked. They run on the
 * assumption that authenticate + adminAuth have already accepted the
 * request (those middlewares are exercised separately).
 */

jest.mock('../config/database', () => ({
  db: { execute: jest.fn() },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

const { db } = require('../config/database');
const logger = require('../config/logger');
const {
  listTags,
  getTagDetail,
  updateTagStatus,
} = require('../controllers/coaAdminController');

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return res;
}

beforeEach(() => {
  db.execute.mockReset();
  logger.info.mockClear();
});

describe('listTags', () => {
  it('returns a paginated list with default page/limit', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({
        rows: [
          { uid: 'AA'.repeat(7), serial_label: 'GAL-2026-0001', art_id: 1, status: 'active' },
          { uid: 'BB'.repeat(7), serial_label: 'GAL-2026-0002', art_id: 2, status: 'active' },
          { uid: 'CC'.repeat(7), serial_label: 'GAL-2026-0003', art_id: 3, status: 'revoked' },
        ],
      });

    const req = { query: {} };
    const res = mockRes();
    await listTags(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.tags).toHaveLength(3);
    expect(body.pagination).toEqual({ page: 1, pages: 1, total: 3, limit: 20 });
  });

  it('lists several active copies of the same artwork, each with its number', async () => {
    // A limited edition has one row per physical copy, all sharing art_id.
    db.execute
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({
        rows: [
          { uid: 'A1'.repeat(7), serial_label: 'GAL-2026-0042-1/15', art_id: 42, edition_number: 1, edition_size: 15, status: 'active' },
          { uid: 'A2'.repeat(7), serial_label: 'GAL-2026-0042-2/15', art_id: 42, edition_number: 2, edition_size: 15, status: 'active' },
          { uid: 'A3'.repeat(7), serial_label: 'GAL-2026-0042-3/15', art_id: 42, edition_number: 3, edition_size: 15, status: 'active' },
        ],
      });

    const req = { query: { art_id: '42' } };
    const res = mockRes();
    await listTags(req, res, jest.fn());

    const listSql = db.execute.mock.calls[1][0].sql;
    expect(listSql).toContain('t.edition_number');
    expect(listSql).toContain('a.edition_size');

    const { tags } = res.json.mock.calls[0][0];
    expect(tags).toHaveLength(3);
    expect(tags.map((t) => t.edition_number)).toEqual([1, 2, 3]);
    expect(new Set(tags.map((t) => t.art_id)).size).toBe(1);
  });

  it('applies status and art_id filters in the SQL', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { query: { status: 'active', art_id: '42' } };
    const res = mockRes();
    await listTags(req, res, jest.fn());

    const firstCall = db.execute.mock.calls[0][0];
    expect(firstCall.sql).toContain('t.status = ?');
    expect(firstCall.sql).toContain('t.art_id = ?');
    expect(firstCall.args).toEqual(['active', 42]);
  });

  it('caps the limit at 100 to prevent unbounded queries', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { query: { limit: '5000' } };
    const res = mockRes();
    await listTags(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.pagination.limit).toBe(100);
  });
});

describe('getTagDetail', () => {
  it('returns 404 ApiError when the UID is unknown', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] });

    const req = { params: { uid: 'AA'.repeat(7) }, query: {} };
    const res = mockRes();
    const next = jest.fn();
    await getTagDetail(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns the tag with up to events_limit recent events', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'AA'.repeat(7),
          serial_label: 'GAL-2026-0001',
          art_id: 1,
          art_name: 'X',
          art_slug: 'x',
          art_basename: 'x.jpg',
          status: 'active',
          last_counter: 3,
          is_permanently_locked: 0,
          personalized_at: '2026-05-01 10:00:00',
          personalized_by: 'op',
          locked_at: null,
          notes: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 3, uid: 'AA'.repeat(7), counter: 3, status: 'ok', ip_hash: 'a', user_agent: 'ua', occurred_at: '2026-05-10' },
          { id: 2, uid: 'AA'.repeat(7), counter: 2, status: 'ok', ip_hash: 'a', user_agent: 'ua', occurred_at: '2026-05-09' },
        ],
      });

    const req = { params: { uid: 'aa'.repeat(7) }, query: { events_limit: '2' } };
    const res = mockRes();
    await getTagDetail(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.tag.uid).toBe('AA'.repeat(7));
    expect(body.events).toHaveLength(2);
    // events_limit must have been clamped/passed in the SQL args
    const eventsCall = db.execute.mock.calls[1][0];
    expect(eventsCall.args[1]).toBe(2);
  });

  it('selects and returns the copy number and the edition size', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [{
          uid: 'AB'.repeat(7),
          serial_label: 'GAL-2026-0042-3/15',
          art_id: 42,
          edition_number: 3,
          art_name: 'Iluminados por la misma luz',
          art_slug: 'iluminados-por-la-misma-luz',
          edition_size: 15,
          art_basename: 'iluminados.jpg',
          status: 'active',
          last_counter: 3,
          is_permanently_locked: 1,
          personalized_at: '2026-07-01 10:00:00',
          personalized_by: 'op',
          locked_at: null,
          notes: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = { params: { uid: 'ab'.repeat(7) }, query: {} };
    const res = mockRes();
    await getTagDetail(req, res, jest.fn());

    const detailSql = db.execute.mock.calls[0][0].sql;
    expect(detailSql).toContain('t.edition_number');
    expect(detailSql).toContain('a.edition_size');

    const { tag } = res.json.mock.calls[0][0];
    expect(tag.edition_number).toBe(3);
    expect(tag.edition_size).toBe(15);
  });
});

describe('updateTagStatus', () => {
  it('returns 404 ApiError when the UID is unknown', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] });

    const req = {
      params: { uid: 'AA'.repeat(7) },
      body: { status: 'lost' },
      user: { id: 7 },
    };
    const res = mockRes();
    const next = jest.fn();
    await updateTagStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('is idempotent: setting the same status without notes does not UPDATE', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [{ uid: 'AA'.repeat(7), status: 'active', notes: null }] })
      .mockResolvedValueOnce({ rows: [{ uid: 'AA'.repeat(7), status: 'active', notes: null }] });

    const req = {
      params: { uid: 'AA'.repeat(7) },
      body: { status: 'active' },
      user: { id: 7 },
    };
    const res = mockRes();
    await updateTagStatus(req, res, jest.fn());

    // First call: SELECT current. Second call: SELECT updated row. NO UPDATE.
    const updates = db.execute.mock.calls.filter((c) =>
      typeof c[0] === 'object' && c[0].sql && c[0].sql.startsWith('UPDATE nfc_tags'),
    );
    expect(updates).toHaveLength(0);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('updates status and appends timestamped notes when both change', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [{ uid: 'AA'.repeat(7), status: 'active', notes: null }] })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({
        rows: [{ uid: 'AA'.repeat(7), status: 'lost', notes: '[2026-05-17 10:00:00] Reported stolen' }],
      });

    const req = {
      params: { uid: 'AA'.repeat(7) },
      body: { status: 'lost', notes: 'Reported stolen' },
      user: { id: 99 },
    };
    const res = mockRes();
    await updateTagStatus(req, res, jest.fn());

    const updateCall = db.execute.mock.calls.find((c) =>
      typeof c[0] === 'object' && c[0].sql && c[0].sql.startsWith('UPDATE nfc_tags'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[0].args[0]).toBe('lost');
    // Notes column updated with a timestamped entry
    expect(updateCall[0].args[1]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] Reported stolen$/);
    // Status transition logged with admin id
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 99, fromStatus: 'active', toStatus: 'lost' }),
      expect.any(String),
    );
  });

  it('appends a new timestamped line to existing notes (not replaces)', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [{ uid: 'AA'.repeat(7), status: 'active', notes: 'prior note' }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rows: [{ uid: 'AA'.repeat(7), status: 'revoked' }] });

    const req = {
      params: { uid: 'AA'.repeat(7) },
      body: { status: 'revoked', notes: 'forensics' },
      user: { id: 1 },
    };
    const res = mockRes();
    await updateTagStatus(req, res, jest.fn());

    const updateCall = db.execute.mock.calls.find((c) =>
      typeof c[0] === 'object' && c[0].sql && c[0].sql.startsWith('UPDATE nfc_tags'),
    );
    expect(updateCall[0].args[1]).toMatch(/^prior note\n\[.+\] forensics$/);
  });
});
