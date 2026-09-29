---
paths:
  - "api/services/{dbDumpService,dbBackupService,s3Service}.js"
  - "api/scheduler/backupScheduler.js"
  - "api/scripts/runBackup.js"
  - "api/tests/dbDump.test.js"
  - "api/server.js"
  - "docs/{backups-s3,backup-bd,turso-doc}.md"
---

## Database Backups (production only)

Daily dump of the Turso database to a dedicated S3 bucket, at 04:00 `Europe/Madrid`. Full operational guide in `docs/backups-s3.md`.

* **No Turso CLI.** `api/services/dbDumpService.js` reproduces SQLite's `.dump` over the `@libsql/client` connection the app already has: read `sqlite_master`, page rows by `rowid`, emit indexes last. The file restores with the existing manual procedure in `docs/turso-doc.md`. No Go binary in the image, no platform token, no child process.
* **`sqlite_sequence` is load-bearing.** It is an internal `sqlite_%` table, so the obvious filter would drop it — and a restored database would then reissue `orders` ids that already appear on invoices. The dump emits `DELETE FROM sqlite_sequence;` plus its rows (never its `CREATE TABLE`). `api/tests/dbDump.test.js` asserts the round trip.
* **`INSERT`s carry an explicit column list**, unlike a real `.dump`. Columns added through `safeAlter` land at the end of the table while sitting mid-list in the dumped `CREATE TABLE`; a positional insert would silently shift every value one column over when restoring into a schema built by `initializeDatabase()`.
* **The process never deletes.** Dailies go to `daily/`, and the 4th of each month is uploaded *additionally* to `monthly/` (same buffer, second `PutObject`). An S3 lifecycle rule expires `daily/` after 15 days; `monthly/` has no rule. The IAM policy grants **only `s3:PutObject`** on the backup bucket — no `GetObject`, no `DeleteObject` — so the api can write a copy but never read one back or destroy the history.
* **Credentials:** none in any `.env`. `s3Service.js` builds the client without credentials and the EC2 instance role supplies them through the SDK's default chain.
* **Activation is by configuration present** (`DB_BACKUP_ENABLED` + `AWS_S3_BACKUP_BUCKET`), never by a `NODE_ENV === 'production'` check — same criterion as `config.useS3`. Forced off under `NODE_ENV=test`, and started from `server.js` only, which tests never import. `.env.test` sets `DB_BACKUP_ENABLED=true` **on purpose**, so the isolation assertion is meaningful.
* **Failure is loud on three channels** (log + Sentry + email to `BUSINESS_EMAIL`) and never escapes the cron callback. Sentry is required lazily and skipped under test — importing `@sentry/node` in Jest breaks unrelated suites.
* **Manual run:** `docker compose exec api npm run backup:now`. Ignores `DB_BACKUP_ENABLED` (deliberate operator action), still needs the bucket.
* **Known blind spot:** a container down at 04:00 produces no copy *and no alert* — the alerting lives inside the process that never ran. Checking that the day's object exists in `daily/` is part of the operational procedure.
* **Staging is out of scope** by decision: self-hosted, no IMDS, no AWS credentials, non-critical data. Backed up by hand.
