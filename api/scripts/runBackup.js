#!/usr/bin/env node
/**
 * On-demand database backup.
 *
 *   docker compose exec api npm run backup:now
 *
 * Two reasons this exists. First, there is no staging environment doing backups
 * any more, so the very first real run would otherwise happen at 04:00 against
 * production with nobody watching; this makes the debut a deliberate, observed
 * act. Second, it stays useful afterwards: take a copy before a risky deploy or
 * a schema migration.
 *
 * It deliberately ignores DB_BACKUP_ENABLED — that switch governs the
 * scheduler, while running this is an explicit decision by the operator. A
 * bucket is still required.
 *
 * Safe to run against production: read-only on the database, write-only on S3.
 * The worst it can do is overwrite today's copy with another copy of today.
 */
const config = require('../config/env');
const logger = require('../config/logger');
const { runBackup } = require('../services/dbBackupService');

async function main() {
  if (!config.backup.bucket) {
    logger.error(
      'Cannot run backup: AWS_S3_BACKUP_BUCKET is not set. See docs/backups-s3.md.',
    );
    process.exitCode = 1;
    return;
  }

  logger.info(
    { bucket: config.backup.bucket, region: config.backup.region, env: config.nodeEnv },
    'Running on-demand database backup',
  );

  const result = await runBackup();

  logger.info(
    {
      keys: result.keys,
      bucket: result.bucket,
      sha256: result.sha256,
      bytesCompressed: result.bytesCompressed,
      totalRows: result.totalRows,
      tables: result.tables,
      durationMs: result.durationMs,
      consistentSnapshot: result.consistentSnapshot,
    },
    'On-demand database backup finished',
  );
}

main()
  .catch(err => {
    logger.error({ err }, 'On-demand database backup FAILED');
    process.exitCode = 1;
  })
  // The libsql client keeps a connection open; nothing else should hold the
  // event loop, but exit explicitly so the command always returns to the shell.
  .finally(() => process.exit(process.exitCode || 0));
