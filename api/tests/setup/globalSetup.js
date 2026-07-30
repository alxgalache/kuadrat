/**
 * Jest `globalSetup` — runs once, before any worker starts.
 *
 * Builds the local SQLite database the whole suite runs against, from scratch,
 * using `initializeDatabase()` so `api/config/database.js` stays the single
 * source of truth for the schema. Nothing here touches the remote Turso
 * instance; the guard in config/database.js aborts the process if it ever
 * could.
 */

const fs = require('fs');
const path = require('path');

require('./env');

const TEST_DB_FILE = path.resolve(__dirname, '..', '..', '.tmp', 'test.db');

// Remove a database left behind by a previous run (a crash, or KEEP_TEST_DB).
// libsql may also leave -wal / -shm sidecar files.
function removeTestDatabase() {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

module.exports = async () => {
  removeTestDatabase();
  fs.mkdirSync(path.dirname(TEST_DB_FILE), { recursive: true });

  // Required lazily: loading config/database.js runs the anti-remote guard, so
  // it must happen after ./env has been applied.
  const { initializeDatabase, db } = require('../../config/database');
  const { seedTestDatabase } = require('./seed');

  await initializeDatabase();
  await seedTestDatabase(db);

  // Close the connection before the workers start. globalSetup runs in the main
  // Jest process; leaving its SQLite handle open makes the worker processes
  // block on the first write, which looks exactly like a hung test suite.
  if (typeof db.close === 'function') db.close();
};

module.exports.TEST_DB_FILE = TEST_DB_FILE;
module.exports.removeTestDatabase = removeTestDatabase;
