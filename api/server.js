// Process entry point.
//
// The Express + Socket.IO application itself is assembled in `app.js`, which is
// free of side effects. Everything that touches the outside world on startup
// lives here: schema initialization, one-off migrations, email transport
// verification, the listening socket and the background schedulers.
//
// Tests import `app.js` directly so none of this runs during a test run.
// See openspec/changes/test-env-isolation.

const { app, server, io } = require('./app');

// Centralized config and logger
const config = require('./config/env');
const logger = require('./config/logger');
const { setupGracefulShutdown } = require('./config/shutdown');

const { initializeDatabase } = require('./config/database');
const { runWalletSplitMigration } = require('./migrations/2026-04-stripe-connect-wallet-split');
const { verifyTransporter } = require('./services/emailService');

const startAuctionScheduler = require('./scheduler/auctionScheduler');
const startReservationScheduler = require('./scheduler/reservationScheduler');
const startConfirmationScheduler = require('./scheduler/confirmationScheduler');
const startShipmentRetryScheduler = require('./scheduler/shipmentRetryScheduler');
const startEventCreditScheduler = require('./scheduler/eventCreditScheduler');
const startBackupScheduler = require('./scheduler/backupScheduler');

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database schema
    await initializeDatabase();

    // One-off migration (Change #2: stripe-connect-manual-payouts) — dumps any
    // remaining legacy `available_withdrawal` balance into the new standard_vat
    // bucket. Idempotent: no-op when the legacy column is already zero.
    await runWalletSplitMigration();

    // Verify email service (optional)
    await verifyTransporter();

    // Allow large uploads (e.g. event videos up to 500 MB) to complete without
    // Node aborting the request. Defaults in Node 20 are 300s requestTimeout
    // and 60s headersTimeout, which close the socket mid-upload on slow links.
    server.requestTimeout = 30 * 60 * 1000; // 30 min
    server.headersTimeout = 65 * 1000;      // keep small; only for client headers
    server.keepAliveTimeout = 65 * 1000;

    // Start server
    server.listen(config.port, () => {
      logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
      logger.info('Socket.IO ready for real-time communication');

      // Start auction lifecycle scheduler
      startAuctionScheduler(app);

      // Start reservation cleanup scheduler
      startReservationScheduler();

      // Start Sendcloud auto-confirmation scheduler
      startConfirmationScheduler();

      // Start Sendcloud shipment retry scheduler
      startShipmentRetryScheduler();

      // Start paid-event credit scheduler (Change #3: stripe-connect-events-wallet)
      startEventCreditScheduler();

      // Start daily database backup scheduler (change: turso-s3-backups).
      // No-op unless DB_BACKUP_ENABLED and a backup bucket are configured.
      startBackupScheduler();
    });

    // Register graceful shutdown
    setupGracefulShutdown(server, io);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
