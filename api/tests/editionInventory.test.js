/**
 * Tests for limited-edition inventory (Change: art-limited-editions).
 *
 * Three angles:
 *  1. SQL semantics of the guarded increment/decrement, run against a real
 *     in-memory libsql database (the exact statements used in production).
 *  2. The single-release claim guard in releaseOrderInventory, with the db
 *     module mocked (double release must never decrement twice).
 *  3. A source invariant: any `UPDATE art SET` that writes is_sold must also
 *     write editions_sold in the same statement (is_sold means "sold out" and
 *     is never written on its own).
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// The exact statements used by placeOrder / releaseOrderInventory /
// billParticipation / auctionScheduler.
const RESERVE_SQL = `UPDATE art
         SET editions_sold = editions_sold + 1,
             is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
         WHERE id = ? AND editions_sold < edition_size`;
const RELEASE_SQL =
  'UPDATE art SET editions_sold = MAX(editions_sold - 1, 0), is_sold = 0 WHERE id = ? AND editions_sold > 0';

describe('guarded edition SQL semantics (in-memory libsql)', () => {
  let client;

  const getArt = async (id) => {
    const res = await client.execute({
      sql: 'SELECT edition_size, editions_sold, is_sold FROM art WHERE id = ?',
      args: [id],
    });
    return res.rows[0];
  };

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await client.execute(`
      CREATE TABLE art (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_sold INTEGER NOT NULL DEFAULT 0,
        edition_size INTEGER NOT NULL DEFAULT 1,
        editions_sold INTEGER NOT NULL DEFAULT 0
      )
    `);
    // id=1: unique work; id=2: edition of 3
    await client.execute('INSERT INTO art (edition_size) VALUES (1)');
    await client.execute('INSERT INTO art (edition_size) VALUES (3)');
  });

  afterEach(() => client.close());

  it('reserving a unique work sets is_sold = 1 in the same statement', async () => {
    const r = await client.execute({ sql: RESERVE_SQL, args: [1] });
    expect(r.rowsAffected).toBe(1);
    expect(await getArt(1)).toMatchObject({ editions_sold: 1, is_sold: 1 });
  });

  it('rejects reserving a sold-out unique work (rowsAffected = 0)', async () => {
    await client.execute({ sql: RESERVE_SQL, args: [1] });
    const r = await client.execute({ sql: RESERVE_SQL, args: [1] });
    expect(r.rowsAffected).toBe(0);
    expect(await getArt(1)).toMatchObject({ editions_sold: 1, is_sold: 1 });
  });

  it('keeps is_sold = 0 while an edition has remaining copies', async () => {
    await client.execute({ sql: RESERVE_SQL, args: [2] });
    await client.execute({ sql: RESERVE_SQL, args: [2] });
    expect(await getArt(2)).toMatchObject({ editions_sold: 2, is_sold: 0 });
  });

  it('sets is_sold = 1 exactly when the last copy is consumed', async () => {
    for (let i = 0; i < 3; i++) await client.execute({ sql: RESERVE_SQL, args: [2] });
    expect(await getArt(2)).toMatchObject({ editions_sold: 3, is_sold: 1 });
    const r = await client.execute({ sql: RESERVE_SQL, args: [2] });
    expect(r.rowsAffected).toBe(0);
  });

  it('release decrements and always resets is_sold', async () => {
    for (let i = 0; i < 3; i++) await client.execute({ sql: RESERVE_SQL, args: [2] });
    const r = await client.execute({ sql: RELEASE_SQL, args: [2] });
    expect(r.rowsAffected).toBe(1);
    expect(await getArt(2)).toMatchObject({ editions_sold: 2, is_sold: 0 });
  });

  it('release refuses to go below zero (rowsAffected = 0)', async () => {
    const r = await client.execute({ sql: RELEASE_SQL, args: [2] });
    expect(r.rowsAffected).toBe(0);
    expect(await getArt(2)).toMatchObject({ editions_sold: 0, is_sold: 0 });
  });

  it('reserve after release works again (release → resale cycle)', async () => {
    await client.execute({ sql: RESERVE_SQL, args: [1] });
    await client.execute({ sql: RELEASE_SQL, args: [1] });
    const r = await client.execute({ sql: RESERVE_SQL, args: [1] });
    expect(r.rowsAffected).toBe(1);
    expect(await getArt(1)).toMatchObject({ editions_sold: 1, is_sold: 1 });
  });
});

describe('releaseOrderInventory claim guard (mocked db)', () => {
  let db;
  let releaseOrderInventory;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../config/database', () => ({
      db: { execute: jest.fn(), batch: jest.fn().mockResolvedValue([]) },
    }));
    jest.doMock('../config/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));
    ({ db } = require('../config/database'));
    ({ releaseOrderInventory } = require('../services/inventoryService'));
  });

  afterEach(() => {
    jest.dontMock('../config/database');
    jest.dontMock('../config/logger');
  });

  it('skips entirely when the order was already released', async () => {
    // Claim UPDATE affects 0 rows → inventory_released_at was already set.
    db.execute.mockResolvedValueOnce({ rowsAffected: 0, rows: [] });

    const result = await releaseOrderInventory(42, 'payment_failed');

    expect(result).toEqual({ artReleased: 0, variantsReleased: 0 });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[0][0].sql).toContain('inventory_released_at IS NULL');
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('claims first, then releases art with the guarded decrement', async () => {
    db.execute
      .mockResolvedValueOnce({ rowsAffected: 1, rows: [] }) // claim succeeds
      .mockResolvedValueOnce({ rows: [{ art_id: 7 }] }) // art items
      .mockResolvedValueOnce({ rows: [] }); // other items

    const result = await releaseOrderInventory(42, 'reservation_expired');

    expect(result.artReleased).toBe(1);
    const batchStatements = db.batch.mock.calls[0][0];
    const artStatement = batchStatements.find((s) => s.sql.includes('UPDATE art'));
    expect(artStatement.sql).toContain('editions_sold = MAX(editions_sold - 1, 0)');
    expect(artStatement.sql).toContain('editions_sold > 0');
    expect(artStatement.args).toEqual([7]);
  });
});

describe('source invariant: art is_sold is never written without editions_sold', () => {
  const roots = [
    path.join(__dirname, '..', 'controllers'),
    path.join(__dirname, '..', 'services'),
    path.join(__dirname, '..', 'scheduler'),
  ];

  const collectJsFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsFiles(full);
      return entry.name.endsWith('.js') ? [full] : [];
    });

  it('every UPDATE art statement touching is_sold also touches editions_sold', () => {
    const offenders = [];
    for (const root of roots) {
      for (const file of collectJsFiles(root)) {
        const source = fs.readFileSync(file, 'utf8');
        // Match each SQL string that updates art (template or quoted literals).
        const updates = source.match(/UPDATE\s+art\s+SET[\s\S]{0,400}?WHERE[^`'"]*/gi) || [];
        for (const stmt of updates) {
          if (/is_sold/i.test(stmt) && !/editions_sold/i.test(stmt)) {
            offenders.push(`${path.relative(process.cwd(), file)}: ${stmt.slice(0, 120)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
