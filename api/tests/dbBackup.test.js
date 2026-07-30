/**
 * Tests for the backup orchestration: object keys, the day-4 monthly copy, the
 * failure alert, and the guarantee that a test run can never schedule a backup.
 *
 * S3 is mocked throughout — no request ever leaves the process.
 */

jest.mock('../services/s3Service', () => ({
  uploadObject: jest.fn().mockResolvedValue('ok'),
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  listFiles: jest.fn(),
}));

const zlib = require('zlib');
const config = require('../config/env');
const { uploadObject } = require('../services/s3Service');
const emailService = require('../services/emailService');
const {
  runBackup,
  runBackupSafely,
  resolveEnvLabel,
  resolveMadridDate,
} = require('../services/dbBackupService');

// The bucket is empty in .env.test (backups are off); set it for the duration
// of these tests so runBackup gets past its configuration check.
const ORIGINAL_BUCKET = config.backup.bucket;

beforeEach(() => {
  config.backup.bucket = 'test-backup-bucket';
  uploadObject.mockClear();
  uploadObject.mockResolvedValue('ok');
  emailService.__clearOutbox();
});

afterAll(() => {
  config.backup.bucket = ORIGINAL_BUCKET;
});

// Keys uploaded in the current test, in order.
const uploadedKeys = () => uploadObject.mock.calls.map(([args]) => args.key);
const uploadCallFor = suffix =>
  uploadObject.mock.calls.map(([args]) => args).find(args => args.key.endsWith(suffix));

describe('date and environment helpers', () => {
  it('derives the file label from NODE_ENV', () => {
    // The suite runs as NODE_ENV=test, so the label is the env name itself;
    // production is the case that matters in the file name.
    expect(resolveEnvLabel()).toBe('test');
  });

  it('resolves the date in Europe/Madrid, not UTC', () => {
    // 23:30 UTC on 3 September is already the 4th in Madrid (CEST, UTC+2).
    // Getting this wrong would put the monthly copy on the wrong day.
    const { date, dayOfMonth } = resolveMadridDate(new Date('2026-09-03T23:30:00Z'));
    expect(date).toBe('2026-09-04');
    expect(dayOfMonth).toBe(4);
  });

  it('resolves a winter date correctly (CET, UTC+1)', () => {
    const { date, dayOfMonth } = resolveMadridDate(new Date('2026-01-03T23:30:00Z'));
    expect(date).toBe('2026-01-04');
    expect(dayOfMonth).toBe(4);
  });
});

describe('runBackup', () => {
  it('uploads the dump and its manifest under daily/ on an ordinary day', async () => {
    const result = await runBackup({ now: new Date('2026-08-12T02:00:00Z') });

    expect(uploadedKeys()).toEqual([
      'daily/kuadrat-test-2026-08-12.sql.gz',
      'daily/kuadrat-test-2026-08-12.meta.json',
    ]);
    expect(result.keys).toEqual(['daily/kuadrat-test-2026-08-12.sql.gz']);
  }, 60000);

  it('sends gzip content type and no content encoding', async () => {
    await runBackup({ now: new Date('2026-08-12T02:00:00Z') });

    const dumpUpload = uploadCallFor('.sql.gz');
    expect(dumpUpload.contentType).toBe('application/gzip');
    // Declaring ContentEncoding would make some clients inflate on download and
    // the bytes would stop matching the manifest checksum.
    expect(dumpUpload.contentEncoding).toBeUndefined();
    expect(Buffer.isBuffer(dumpUpload.body)).toBe(true);
  }, 60000);

  it('uploads a body that gunzips back into the SQL dump', async () => {
    await runBackup({ now: new Date('2026-08-12T02:00:00Z') });

    const sql = zlib.gunzipSync(uploadCallFor('.sql.gz').body).toString('utf8');
    expect(sql).toMatch(/^PRAGMA foreign_keys=OFF;/);
    expect(sql).toMatch(/CREATE TABLE orders/);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  }, 60000);

  it('writes a manifest with row counts and a checksum of the uploaded bytes', async () => {
    const crypto = require('crypto');
    const result = await runBackup({ now: new Date('2026-08-12T02:00:00Z') });

    const manifest = JSON.parse(uploadCallFor('.meta.json').body);
    const uploadedBuffer = uploadCallFor('.sql.gz').body;
    const actualSha = crypto.createHash('sha256').update(uploadedBuffer).digest('hex');

    expect(manifest.sha256).toBe(actualSha);
    expect(manifest.bytesCompressed).toBe(uploadedBuffer.length);
    expect(manifest.bytesUncompressed).toBeGreaterThan(manifest.bytesCompressed);
    expect(manifest.tables).toBeGreaterThan(20);
    expect(manifest.rowCounts.postal_codes).toBeGreaterThan(0);
    expect(result.sha256).toBe(actualSha);
  }, 60000);

  it('also writes to monthly/ on the 4th, reusing the same bytes', async () => {
    await runBackup({ now: new Date('2026-09-04T02:00:00Z') });

    expect(uploadedKeys()).toEqual([
      'daily/kuadrat-test-2026-09-04.sql.gz',
      'daily/kuadrat-test-2026-09-04.meta.json',
      'monthly/kuadrat-test-2026-09-04.sql.gz',
      'monthly/kuadrat-test-2026-09-04.meta.json',
    ]);

    const daily = uploadObject.mock.calls.find(([a]) => a.key === 'daily/kuadrat-test-2026-09-04.sql.gz')[0];
    const monthly = uploadObject.mock.calls.find(([a]) => a.key === 'monthly/kuadrat-test-2026-09-04.sql.gz')[0];
    // Same buffer object: the dump is generated once, uploaded twice.
    expect(monthly.body).toBe(daily.body);
  }, 60000);

  it('never issues a delete against the backup bucket', async () => {
    const s3Service = require('../services/s3Service');
    await runBackup({ now: new Date('2026-09-04T02:00:00Z') });

    // Retention belongs to the bucket lifecycle rule; the IAM policy grants
    // PutObject only, so a delete here would fail in production anyway.
    expect(s3Service.deleteFile).not.toHaveBeenCalled();
  }, 60000);

  it('fails loudly when no bucket is configured', async () => {
    config.backup.bucket = '';
    await expect(runBackup()).rejects.toThrow(/AWS_S3_BACKUP_BUCKET/);
    expect(uploadObject).not.toHaveBeenCalled();
  });
});

describe('runBackupSafely', () => {
  it('swallows the error, reports false and emails the alert', async () => {
    uploadObject.mockRejectedValue(new Error('AccessDenied: not allowed'));

    const ok = await runBackupSafely({ now: new Date('2026-08-12T02:00:00Z') });

    expect(ok).toBe(false);

    const outbox = emailService.__getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(config.business.email);
    expect(outbox[0].subject).toMatch(/copia de seguridad/i);
    expect(outbox[0].html).toMatch(/AccessDenied: not allowed/);
  }, 60000);

  it('reports true and sends nothing on success', async () => {
    const ok = await runBackupSafely({ now: new Date('2026-08-12T02:00:00Z') });

    expect(ok).toBe(true);
    expect(emailService.__getOutbox()).toHaveLength(0);
  }, 60000);
});

describe('backup scheduler isolation', () => {
  it('is disabled under NODE_ENV=test even when DB_BACKUP_ENABLED is true', () => {
    // .env.test sets DB_BACKUP_ENABLED=true precisely so this assertion is
    // meaningful: the env file asks for backups and the code still refuses.
    expect(process.env.DB_BACKUP_ENABLED).toBe('true');
    expect(config.nodeEnv).toBe('test');
    expect(config.backup.enabled).toBe(false);
  });

  it('does not schedule anything when disabled', () => {
    const cron = require('node-cron');
    const scheduleSpy = jest.spyOn(cron, 'schedule');
    const startBackupScheduler = require('../scheduler/backupScheduler');

    expect(startBackupScheduler()).toBeNull();
    expect(scheduleSpy).not.toHaveBeenCalled();

    scheduleSpy.mockRestore();
  });
});
