const logger = require('./logger');

/**
 * Registers graceful shutdown handlers for SIGTERM and SIGINT signals.
 * Closes HTTP server, Socket.IO connections, and any cleanup callbacks.
 * @param {import('http').Server} server - The HTTP server instance
 * @param {import('socket.io').Server} io - The Socket.IO server instance
 */
function setupGracefulShutdown(server, io) {
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed');
      }
    });

    // Close all Socket.IO connections
    if (io) {
      io.close(() => {
        logger.info('Socket.IO connections closed');
      });
    }

    // Allow 10 seconds for in-flight requests to complete
    const forceTimeout = setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    forceTimeout.unref();

    // Wait briefly for server.close callback
    setTimeout(() => {
      logger.info('Shutdown complete');
      process.exit(0);
    }, 1000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

module.exports = { setupGracefulShutdown };
