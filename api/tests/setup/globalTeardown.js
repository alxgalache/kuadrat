/**
 * Jest `globalTeardown` — runs once, after every worker has finished.
 *
 * Deletes the local SQLite database so a test run leaves nothing behind, pass
 * or fail. Set KEEP_TEST_DB=1 to keep the file and inspect it after a failure.
 */

require('./env');

const { removeTestDatabase, TEST_DB_FILE } = require('./globalSetup');

module.exports = async () => {
  if (process.env.KEEP_TEST_DB === '1') {
    console.log(`[test] KEEP_TEST_DB=1 — test database kept at ${TEST_DB_FILE}`);
    return;
  }

  try {
    const { db } = require('../../config/database');
    if (typeof db.close === 'function') db.close();
  } catch {
    // The client may never have been created in this process; nothing to close.
  }

  removeTestDatabase();
};
