const crypto = require('crypto');
const zlib = require('zlib');
const config = require('../config/env');
const logger = require('../config/logger');
const { generateDump } = require('./dbDumpService');
const { uploadObject } = require('./s3Service');

/**
 * Daily database backup: generate the SQL dump, gzip it, and upload it to the
 * dedicated S3 backup bucket.
 *
 * Two design rules this module must never break:
 *
 *  - It NEVER deletes anything from S3. Retention is a bucket lifecycle rule
 *    (`daily/` expires after 15 days, `monthly/` never does), so the IAM policy
 *    grants only s3:PutObject and no bug here can empty the backup history.
 *  - It is read-only against the database. A failure can produce a bad file in
 *    S3, never damage to the data.
 */

const TIME_ZONE = 'Europe/Madrid';
const DAILY_PREFIX = 'daily/';
const MONTHLY_PREFIX = 'monthly/';
// The day of month whose copy is kept indefinitely under monthly/.
const MONTHLY_DAY = 4;

/**
 * Short label for the environment, used in the file name. Even with one bucket
 * per environment, carrying it in the name means a downloaded .sql.gz still
 * identifies itself once it is sitting in a folder somewhere.
 */
function resolveEnvLabel() {
  return config.nodeEnv === 'production' ? 'pro' : config.nodeEnv;
}

/**
 * Current date in Europe/Madrid, as `YYYY-MM-DD` plus the day of month.
 *
 * The cron schedule uses the same time zone, so "the dump of the 4th" and "the
 * run on the 4th" cannot disagree around midnight — which they would if the
 * date came from the container's UTC clock.
 */
function resolveMadridDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const lookup = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    dayOfMonth: Number(lookup.day),
  };
}

/**
 * Run the dump through gzip, keeping only the compressed output in memory.
 *
 * ~1–2 MB gzipped, so the final Buffer.concat is nothing for a 1 GB container,
 * and having a Buffer (whose length is known) is what lets us use plain
 * PutObject without pulling in @aws-sdk/lib-storage or writing a temp file
 * inside a container running as the `node` user.
 */
async function buildCompressedDump(dumpOptions = {}) {
  const gzip = zlib.createGzip();
  const chunks = [];
  let rawBytes = 0;

  gzip.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    gzip.on('end', resolve);
    gzip.on('error', reject);
  });

  for await (const sql of generateDump(dumpOptions)) {
    rawBytes += Buffer.byteLength(sql);
    if (!gzip.write(sql)) {
      await new Promise(resolve => gzip.once('drain', resolve));
    }
  }
  gzip.end();
  await finished;

  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    rawBytes,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function buildManifest({ envLabel, startedAt, durationMs, stats, rawBytes, buffer, sha256 }) {
  return {
    environment: envLabel,
    startedAt,
    durationMs,
    tables: stats.tables,
    totalRows: stats.totalRows,
    rowCounts: stats.rowCounts,
    bytesUncompressed: rawBytes,
    bytesCompressed: buffer.length,
    sha256,
    // False means the dump was read without a transaction and is therefore not
    // a point-in-time snapshot (see dbDumpService).
    consistentSnapshot: stats.consistentSnapshot === true,
  };
}

/**
 * Generate and upload today's backup.
 *
 * Throws on failure — the caller decides how loud to be. Uploading the monthly
 * copy is part of success: losing it silently would quietly break long-term
 * retention, which is exactly the thing nobody notices for months.
 *
 * @param {object} [options]
 * @param {Date} [options.now] - Override the clock (tests).
 * @param {object} [options.dumpOptions] - Forwarded to generateDump (tests).
 * @returns {Promise<object>} The manifest, plus the keys that were written.
 */
async function runBackup(options = {}) {
  const bucket = config.backup.bucket;
  if (!bucket) {
    throw new Error('Database backup is not configured (AWS_S3_BACKUP_BUCKET missing)');
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const envLabel = resolveEnvLabel();
  const { date, dayOfMonth } = resolveMadridDate(options.now);
  const basename = `kuadrat-${envLabel}-${date}`;
  const dailyKey = `${DAILY_PREFIX}${basename}.sql.gz`;

  const stats = {};
  const { buffer, rawBytes, sha256 } = await buildCompressedDump({
    ...(options.dumpOptions || {}),
    stats,
  });

  const manifest = buildManifest({
    envLabel,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    stats,
    rawBytes,
    buffer,
    sha256,
  });
  const manifestBody = JSON.stringify(manifest, null, 2);

  const keys = [dailyKey];
  await uploadDumpAndManifest({ bucket, prefix: DAILY_PREFIX, basename, buffer, manifestBody });

  // Day 4: the very same buffer goes to monthly/ as well. The dump is generated
  // once; this is a second PutObject, not a second read of the database.
  if (dayOfMonth === MONTHLY_DAY) {
    const monthlyKey = `${MONTHLY_PREFIX}${basename}.sql.gz`;
    await uploadDumpAndManifest({ bucket, prefix: MONTHLY_PREFIX, basename, buffer, manifestBody });
    keys.push(monthlyKey);
  }

  logger.info(
    {
      keys,
      bucket,
      bytesCompressed: buffer.length,
      bytesUncompressed: rawBytes,
      tables: manifest.tables,
      totalRows: manifest.totalRows,
      durationMs: manifest.durationMs,
      consistentSnapshot: manifest.consistentSnapshot,
    },
    'Database backup uploaded',
  );

  return { ...manifest, keys, bucket };
}

async function uploadDumpAndManifest({ bucket, prefix, basename, buffer, manifestBody }) {
  const region = config.backup.region;
  await uploadObject({
    bucket,
    region,
    key: `${prefix}${basename}.sql.gz`,
    body: buffer,
    contentType: 'application/gzip',
  });
  await uploadObject({
    bucket,
    region,
    key: `${prefix}${basename}.meta.json`,
    body: manifestBody,
    contentType: 'application/json',
  });
}

/**
 * runBackup() wrapped so a failure is loud on three channels and escapes
 * nowhere: a rejected promise inside a node-cron callback would otherwise
 * vanish without a trace.
 *
 * @returns {Promise<boolean>} true when the backup succeeded.
 */
async function runBackupSafely(options = {}) {
  const envLabel = resolveEnvLabel();
  const { date } = resolveMadridDate(options.now);

  try {
    await runBackup(options);
    return true;
  } catch (err) {
    logger.error(
      { err, env: envLabel, date, bucket: config.backup.bucket },
      'Database backup FAILED',
    );

    // Sentry is loaded lazily AND never under test: merely requiring
    // @sentry/node installs global require-hook instrumentation that survives
    // Jest's per-file module registry and breaks unrelated suites (same reason
    // app.js guards instrument.js). In production it is already initialized, so
    // this resolves from the module cache.
    if (config.nodeEnv !== 'test') {
      try {
        const Sentry = require('../instrument.js');
        Sentry.captureException(err, {
          tags: { job: 'db_backup', env: envLabel },
          extra: { date, bucket: config.backup.bucket },
        });
      } catch (sentryErr) {
        logger.warn({ err: sentryErr }, 'Could not report backup failure to Sentry');
      }
    }

    try {
      const emailService = require('./emailService');
      await emailService.sendBackupFailureEmail({
        env: envLabel,
        dateKey: date,
        key: `${DAILY_PREFIX}kuadrat-${envLabel}-${date}.sql.gz`,
        error: err,
      });
    } catch (mailErr) {
      logger.error({ err: mailErr }, 'Could not send backup failure alert email');
    }

    return false;
  }
}

module.exports = {
  runBackup,
  runBackupSafely,
  resolveEnvLabel,
  resolveMadridDate,
  DAILY_PREFIX,
  MONTHLY_PREFIX,
  MONTHLY_DAY,
};
