/**
 * Loads the Express app for supertest AND guarantees its handles are released.
 *
 * `api/app.js` builds an http.Server and a Socket.IO server at module load.
 * Neither listens, but Socket.IO installs timers and engine.io state that keep
 * the Jest worker alive ("Jest did not exit one second after the test run"),
 * and a worker that never exits cleanly takes the whole run down with it.
 *
 * Requiring this helper from a test file registers the cleanup automatically:
 * the `afterAll` below runs while the test file is being evaluated, so it is
 * scoped to that file.
 *
 *   const { app } = require('./helpers/app');
 *
 * The cleanup is deliberately synchronous and un-awaited: `io.close(cb)` also
 * closes the http.Server it is attached to, and that server never listened here,
 * so the callback is not reliably invoked and awaiting it hangs the run.
 * Dropping the handles is all we need.
 */

const { app, server, io } = require('../../app');

afterAll(() => {
  io.disconnectSockets(true);
  io.close();
  if (server.listening) server.close();
});

module.exports = { app, server, io };
