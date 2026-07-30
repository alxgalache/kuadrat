const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../config/logger');
const { runBackupSafely, resolveEnvLabel } = require('../services/dbBackupService');

/**
 * Database backup scheduler.
 *
 * Dumps the Turso database once a day at 04:00 Europe/Madrid and uploads it to
 * the dedicated S3 backup bucket. Started from server.js only — app.js stays
 * free of side effects so a test run can never trigger a backup.
 */

// Guards against two dumps running at once. A dump takes seconds, so this is
// unlikely, but concurrent runs would double the memory and the load on Turso.
let running = false;

module.exports = function startBackupScheduler() {
  if (!config.backup.enabled) {
    logger.info('Database backup scheduler disabled (DB_BACKUP_ENABLED not set)');
    return null;
  }

  if (!config.backup.bucket) {
    // Half-configured must be visible, not silent — but it must not stop the
    // shop from starting either.
    logger.error(
      'Database backup is enabled but AWS_S3_BACKUP_BUCKET is empty; scheduler NOT started',
    );
    return null;
  }

  // The time zone is explicit because the server clock is UTC: without it the
  // job would drift to 05:00 or 06:00 local depending on the season.
  const task = cron.schedule(config.backup.cron, async () => {
    if (running) {
      logger.warn('Database backup skipped: a previous run is still in progress');
      return;
    }
    running = true;
    try {
      await runBackupSafely();
    } finally {
      running = false;
    }
  }, { timezone: 'Europe/Madrid' });

  logger.info(
    {
      cron: config.backup.cron,
      timezone: 'Europe/Madrid',
      bucket: config.backup.bucket,
      region: config.backup.region,
      env: resolveEnvLabel(),
    },
    'Database backup scheduler started',
  );

  return task;
};
