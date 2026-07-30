/**
 * Jest `setupFilesAfterEnv` — runs in every worker once the test framework is
 * installed, so `afterAll` is available here.
 *
 * Closes the libsql client at the end of every test file. Left open, the local
 * SQLite handle keeps the worker alive and Jest reports open handles.
 */

afterAll(() => {
  // Required lazily so a suite that never touches the database does not create
  // a client just to close it.
  const dbModulePath = require.resolve('../../config/database');
  if (!require.cache[dbModulePath]) return;

  const { db } = require('../../config/database');
  if (typeof db.close === 'function') db.close();
});
