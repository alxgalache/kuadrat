/**
 * Tests for the database backup (openspec change: turso-s3-backups).
 *
 * The dump generator is the risky part: it hand-rolls what SQLite's `.dump`
 * does, and a subtle mistake would only show up the day someone tries to
 * restore. So the core test is a real round trip — dump the test database,
 * import the result into a fresh SQLite file through the same libsql client,
 * and compare. The test environment already points at a local `file:` database
 * with the production schema, which makes that possible without touching
 * anything remote.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@libsql/client');

const { db } = require('../config/database');
const { generateDump, serializeValue } = require('../services/dbDumpService');

// Collect the async generator into one string.
async function collectDump(options = {}) {
  let sql = '';
  for await (const chunk of generateDump(options)) sql += chunk;
  return sql;
}

// Import a dump into a brand-new SQLite file and hand back its client.
async function restoreInto(sql) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuadrat-restore-'));
  const file = path.join(dir, 'restored.db');
  const client = createClient({ url: `file:${file}` });

  // Statement-per-line splitting would break on the multi-line CREATE TABLEs and
  // on any value containing a semicolon, so split on the terminator that only
  // ever ends a statement in our dump: ";\n".
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  return { client, cleanup: () => { client.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

async function tableNames(client) {
  const result = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  return result.rows.map(r => r.name);
}

async function countRows(client, table) {
  const result = await client.execute(`SELECT COUNT(*) AS c FROM "${table}"`);
  return Number(result.rows[0].c);
}

describe('dbDumpService.serializeValue', () => {
  it('renders NULL and undefined as the NULL keyword, unquoted', () => {
    expect(serializeValue(null)).toBe('NULL');
    expect(serializeValue(undefined)).toBe('NULL');
  });

  it('doubles single quotes inside strings', () => {
    expect(serializeValue("O'Keeffe")).toBe("'O''Keeffe'");
    expect(serializeValue("''")).toBe("''''''");
  });

  it('leaves newlines and HTML untouched inside the literal', () => {
    const value = '<p>Línea 1</p>\n<p>Línea 2</p>';
    expect(serializeValue(value)).toBe(`'${value}'`);
  });

  it('renders numbers and bigints without quotes', () => {
    expect(serializeValue(42)).toBe('42');
    expect(serializeValue(1234.56)).toBe('1234.56');
    expect(serializeValue(-0.5)).toBe('-0.5');
    expect(serializeValue(9007199254740993n)).toBe('9007199254740993');
  });

  it('renders booleans as 1/0', () => {
    expect(serializeValue(true)).toBe('1');
    expect(serializeValue(false)).toBe('0');
  });

  it('renders binary values as hex blob literals', () => {
    expect(serializeValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("X'deadbeef'");
  });

  it('refuses values it cannot represent', () => {
    expect(() => serializeValue({ a: 1 })).toThrow(/Cannot serialize/);
    expect(() => serializeValue(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });
});

describe('dbDumpService.generateDump', () => {
  let dump;

  beforeAll(async () => {
    dump = await collectDump();
  }, 60000);

  it('wraps the dump in the pragma and a transaction', () => {
    expect(dump.startsWith('PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n')).toBe(true);
    expect(dump.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('creates every table before the first INSERT', () => {
    const firstInsert = dump.indexOf('INSERT INTO');
    expect(firstInsert).toBeGreaterThan(0);

    // SQLite strips the `IF NOT EXISTS` clause when it stores the statement in
    // sqlite_master, and the dump emits that stored text verbatim.
    const schemaSection = dump.slice(0, firstInsert);
    expect(schemaSection).toMatch(/CREATE TABLE orders/);
    expect(schemaSection).toMatch(/CREATE TABLE art/);
    expect(schemaSection).toMatch(/CREATE TABLE users/);
  });

  it('creates indexes after the last INSERT so the restore does not reindex row by row', () => {
    const lastInsert = dump.lastIndexOf('INSERT INTO');
    const firstIndex = dump.indexOf('CREATE INDEX');
    expect(firstIndex).toBeGreaterThan(lastInsert);
  });

  it('reports per-table row counts through the stats object', async () => {
    const stats = {};
    await collectDump({ stats });

    expect(stats.tables).toBeGreaterThan(20);
    expect(stats.rowCounts.postal_codes).toBe(await countRows(db, 'postal_codes'));
    expect(stats.totalRows).toBeGreaterThanOrEqual(stats.rowCounts.postal_codes);
    expect(typeof stats.consistentSnapshot).toBe('boolean');
  }, 60000);
});

describe('dbDumpService round trip', () => {
  it('restores into an empty database with identical row counts', async () => {
    const sql = await collectDump();
    const { client, cleanup } = await restoreInto(sql);

    try {
      const originalTables = await tableNames(db);
      const restoredTables = await tableNames(client);
      expect(restoredTables).toEqual(originalTables);

      for (const table of originalTables) {
        expect({ table, count: await countRows(client, table) })
          .toEqual({ table, count: await countRows(db, table) });
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('brings text, NULL, numeric and blob values back byte-for-byte', async () => {
    const tricky = {
      name: "Retrato de O'Keeffe",
      description: '<p>Línea 1 — con "comillas"</p>\n<p>Línea 2 \\ barra</p>',
      price: 1234.56,
      blob: new Uint8Array([0x00, 0x01, 0xfe, 0xff]),
    };

    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS dump_fixture (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT, description TEXT, price REAL, note TEXT, payload BLOB)`,
    });
    await db.execute({
      sql: 'INSERT INTO dump_fixture (name, description, price, note, payload) VALUES (?, ?, ?, NULL, ?)',
      args: [tricky.name, tricky.description, tricky.price, tricky.blob],
    });

    try {
      const sql = await collectDump();
      const { client, cleanup } = await restoreInto(sql);

      try {
        const restored = await client.execute('SELECT * FROM dump_fixture ORDER BY id DESC LIMIT 1');
        const row = restored.rows[0];

        expect(row.name).toBe(tricky.name);
        expect(row.description).toBe(tricky.description);
        expect(row.price).toBe(tricky.price);
        expect(row.note).toBeNull();
        expect(Buffer.from(row.payload)).toEqual(Buffer.from(tricky.blob));
      } finally {
        cleanup();
      }
    } finally {
      await db.execute('DROP TABLE IF EXISTS dump_fixture');
    }
  }, 60000);

  it('preserves sqlite_sequence so restored AUTOINCREMENT ids do not restart', async () => {
    // orders is AUTOINCREMENT and starts at 1000: reusing ids after a restore
    // would mean issuing an invoice number that already exists.
    await db.execute({
      sql: `INSERT INTO orders (email, total_price, status, token) VALUES ('dump@test.local', 10, 'pending', 'dump-token-seed')`,
    });
    const seeded = await db.execute('SELECT MAX(id) AS max_id FROM orders');
    const maxOrderId = Number(seeded.rows[0].max_id);

    const sql = await collectDump();

    expect(sql).toMatch(/DELETE FROM sqlite_sequence;/);
    expect(sql).toMatch(/INSERT INTO sqlite_sequence VALUES\('orders',/);
    // The counter is emitted, never the CREATE TABLE for the internal table.
    expect(sql).not.toMatch(/CREATE TABLE\s+(IF NOT EXISTS\s+)?["']?sqlite_sequence/);

    const { client, cleanup } = await restoreInto(sql);
    try {
      await client.execute({
        sql: `INSERT INTO orders (email, total_price, status, token) VALUES ('dump@test.local', 20, 'pending', 'dump-token-restored')`,
      });
      const next = await client.execute('SELECT MAX(id) AS max_id FROM orders');
      expect(Number(next.rows[0].max_id)).toBe(maxOrderId + 1);
    } finally {
      cleanup();
    }
  }, 60000);
});
