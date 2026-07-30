const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * SQL dump generator for the Turso database.
 *
 * This reproduces what `turso db shell <db> .dump` (i.e. SQLite's `.dump`)
 * writes, using the `@libsql/client` connection the application already has
 * open. Going through the client instead of the Turso CLI keeps a Go binary out
 * of the node:20-alpine image, avoids a second authentication mechanism
 * (TURSO_API_TOKEN is a platform token, distinct from TURSO_AUTH_TOKEN) and
 * needs no child process writing files inside a container that runs as `node`.
 *
 * The output is restorable with the manual procedure already documented in
 * docs/turso-doc.md: `turso db shell <db> < dump.sql`.
 */

// Rows are read in batches so a 37k-row table (postal_codes) never lands in a
// single array, and so no single response bumps into Turso's size limits.
const BATCH_SIZE = 1000;

/**
 * Render a value as a SQLite literal.
 *
 * Strings are NOT escaped beyond doubling single quotes: SQLite accepts
 * multi-line literals, and leaving newlines and control characters untouched is
 * what makes a value come back byte-for-byte identical (artwork descriptions
 * carry HTML).
 */
function serializeValue(value) {
  if (value === null || value === undefined) return 'NULL';

  switch (typeof value) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(`Cannot serialize non-finite number: ${value}`);
      }
      return String(value);
    case 'bigint':
      return String(value);
    case 'boolean':
      return value ? '1' : '0';
    default:
      break;
  }

  if (value instanceof Uint8Array) return blobLiteral(value);
  if (value instanceof ArrayBuffer) return blobLiteral(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    return blobLiteral(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }

  throw new Error(`Cannot serialize value of type ${typeof value} to a SQL literal`);
}

function blobLiteral(bytes) {
  return `X'${Buffer.from(bytes).toString('hex')}'`;
}

// Identifiers are quoted with double quotes; an embedded double quote is
// doubled, same as SQLite does.
function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Read the schema from sqlite_master, split into the groups the dump needs.
 *
 * The `sql` column is emitted verbatim, never rebuilt: it is the definition
 * actually live on the server, which may differ from the text in
 * config/database.js (e.g. `withdrawals`, recreated by the withdrawals_new
 * migration).
 */
async function readSchema(runner) {
  const result = await runner.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE sql IS NOT NULL
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 ELSE 2 END, name`
  );

  const tables = [];
  const postDataObjects = [];

  for (const row of result.rows) {
    // Internal objects (sqlite_sequence, sqlite_autoindex_*, sqlite_stat*) are
    // never recreated by hand. sqlite_sequence is handled separately below —
    // SQLite creates it on its own with the first AUTOINCREMENT table.
    if (row.name.startsWith('sqlite_')) continue;

    if (row.type === 'table') {
      tables.push({ name: row.name, sql: row.sql });
    } else {
      postDataObjects.push({ type: row.type, name: row.name, sql: row.sql });
    }
  }

  return { tables, postDataObjects };
}

/**
 * Does the database have a sqlite_sequence table (i.e. any AUTOINCREMENT)?
 *
 * This matters more than it looks: `orders` is AUTOINCREMENT and starts at
 * 1000. Skipping sqlite_sequence would make a restored database hand out order
 * IDs that already appear on issued invoices.
 */
async function hasSqliteSequence(runner) {
  const result = await runner.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`
  );
  return result.rows.length > 0;
}

function renderInsert(ident, columnList, columns, row) {
  const values = columns.map(col => serializeValue(row[col])).join(',');
  return `INSERT INTO ${ident} (${columnList}) VALUES(${values});\n`;
}

/**
 * Yield `INSERT` statements for one table, reading it in rowid-ordered batches.
 *
 * Unlike SQLite's `.dump`, the column list is written out explicitly. The dump
 * carries its own CREATE TABLE, so it is redundant when restoring into an empty
 * database — but not when restoring into a schema built by
 * `initializeDatabase()`: columns added there through `safeAlter` land at the
 * end of the table, while the same column may sit mid-list in the dumped
 * CREATE TABLE. A positional INSERT would then shift every value one column
 * over, silently. gzip absorbs the repetition.
 */
async function* dumpTableRows(runner, table, onRowCount) {
  const ident = quoteIdent(table);
  let lastRowId = 0;
  let total = 0;

  for (;;) {
    let result;
    try {
      result = await runner.execute({
        sql: `SELECT rowid AS __rowid, * FROM ${ident} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        args: [lastRowId, BATCH_SIZE],
      });
    } catch (err) {
      // WITHOUT ROWID tables have no rowid to paginate by. None exist in this
      // schema today, but one appearing later must not take the whole backup
      // down: read it in a single pass instead.
      logger.warn(
        { err, table },
        'DB backup: rowid pagination unavailable, falling back to a single read',
      );
      yield* dumpTableUnpaginated(runner, table, onRowCount);
      return;
    }

    if (result.rows.length === 0) break;

    const columns = result.columns.filter(c => c !== '__rowid');
    const columnList = columns.map(quoteIdent).join(', ');

    let chunk = '';
    for (const row of result.rows) {
      lastRowId = Number(row.__rowid);
      chunk += renderInsert(ident, columnList, columns, row);
    }
    total += result.rows.length;
    yield chunk;

    if (result.rows.length < BATCH_SIZE) break;
  }

  onRowCount(total);
}

async function* dumpTableUnpaginated(runner, table, onRowCount) {
  const ident = quoteIdent(table);
  const result = await runner.execute(`SELECT * FROM ${ident}`);
  const columnList = result.columns.map(quoteIdent).join(', ');

  let chunk = '';
  for (const row of result.rows) {
    chunk += renderInsert(ident, columnList, result.columns, row);
  }
  onRowCount(result.rows.length);
  if (chunk) yield chunk;
}

/**
 * Emit `sqlite_sequence` the way `.dump` does: no CREATE TABLE (SQLite owns
 * it), a DELETE to clear whatever the restore already created, then one INSERT
 * per counter.
 */
async function* dumpSqliteSequence(runner, onRowCount) {
  const result = await runner.execute('SELECT name, seq FROM sqlite_sequence ORDER BY name');
  if (result.rows.length === 0) {
    onRowCount(0);
    return;
  }

  let chunk = 'DELETE FROM sqlite_sequence;\n';
  for (const row of result.rows) {
    chunk += `INSERT INTO sqlite_sequence VALUES(${serializeValue(row.name)},${serializeValue(row.seq)});\n`;
  }
  onRowCount(result.rows.length);
  yield chunk;
}

/**
 * Generate the complete dump as a stream of SQL text chunks.
 *
 * Order matters: schema, then data, then indexes/views/triggers. Building the
 * indexes after the inserts means the restore does not reindex row by row.
 *
 * @param {object} [options]
 * @param {object} [options.client] - libsql client to read from (defaults to the shared `db`).
 * @param {object} [options.stats] - object the generator fills in as it goes:
 *   `{ tables, rowCounts, totalRows, consistentSnapshot }`.
 */
async function* generateDump(options = {}) {
  const client = options.client || db;
  const stats = options.stats || {};
  stats.rowCounts = {};
  stats.totalRows = 0;
  stats.tables = 0;

  // A dump spread over hundreds of HTTP requests is not point-in-time. A read
  // transaction gives a coherent snapshot and avoids a backup with broken
  // referential integrity (an order without its items). Turso caps how long an
  // interactive transaction may live, so if it is refused or expires we fall
  // back to reading without one: at 04:00 write traffic is nil, and a slightly
  // inconsistent backup beats no backup by an infinite margin.
  let tx = null;
  try {
    tx = await client.transaction('read');
    stats.consistentSnapshot = true;
  } catch (err) {
    stats.consistentSnapshot = false;
    logger.warn(
      { err },
      'DB backup: could not open a read transaction; dump will not be point-in-time',
    );
  }

  const runner = tx || client;

  try {
    const { tables, postDataObjects } = await readSchema(runner);
    stats.tables = tables.length;

    yield 'PRAGMA foreign_keys=OFF;\n';
    yield 'BEGIN TRANSACTION;\n';

    for (const table of tables) {
      yield `${table.sql};\n`;
    }

    if (await hasSqliteSequence(runner)) {
      yield* dumpSqliteSequence(runner, count => {
        stats.rowCounts.sqlite_sequence = count;
      });
    }

    for (const table of tables) {
      yield* dumpTableRows(runner, table.name, count => {
        stats.rowCounts[table.name] = count;
        stats.totalRows += count;
      });
    }

    for (const object of postDataObjects) {
      yield `${object.sql};\n`;
    }

    yield 'COMMIT;\n';
  } finally {
    if (tx) {
      // Read-only: nothing to commit, and closing releases the snapshot.
      try {
        tx.close();
      } catch (err) {
        logger.warn({ err }, 'DB backup: failed to close the read transaction');
      }
    }
  }
}

module.exports = {
  generateDump,
  serializeValue,
  BATCH_SIZE,
};
