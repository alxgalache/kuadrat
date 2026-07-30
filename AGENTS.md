## Testing

Local development points at the **preproduction** Turso database and at the real email provider. Tests must never reach either.

* Run the backend suite with `npm test` from `api/` (or `docker compose exec api npm test`). It uses a local SQLite file (`api/.env.test` → `file:./.tmp/test.db`), recreated and deleted on every run.
* `api/config/database.js` aborts the process if `NODE_ENV=test` and the database URL is not `file:`. If you hit that error, fix the environment — never work around the guard.
* Email is inert under test: `sendMail()` records to an in-memory outbox instead of calling Resend or SMTP. Assert with `emailService.__getOutbox()`.
* Import `api/app.js` (via `tests/helpers/app.js`) in tests, never `api/server.js` — the latter opens a port and starts the five production schedulers.
* `api/.env.test` is versioned and holds dummy values only. Never put a real credential in it.

Full rationale in `CLAUDE.md` § Testing.

## Database backups

Daily dump of the production Turso database to S3 at 04:00 `Europe/Madrid`. Guide: `docs/backups-s3.md`.

* The dump is generated in Node over `@libsql/client` (`api/services/dbDumpService.js`) — **not** with the Turso CLI. It restores with the manual procedure in `docs/turso-doc.md`.
* `sqlite_sequence` MUST stay in the dump: without it a restored database reissues `orders` ids that already appear on invoices. Guarded by `api/tests/dbDump.test.js`.
* The backup **never deletes anything**. Retention is an S3 lifecycle rule (`daily/` expires at 15 days, `monthly/` never), and the IAM policy grants only `s3:PutObject`. Do not add delete calls or delete permissions.
* Production only. Off by default, forced off under `NODE_ENV=test`, started from `server.js` alone. `.env.test` sets `DB_BACKUP_ENABLED=true` on purpose — never remove it to "fix" a test.

Full rationale in `CLAUDE.md` § Database Backups.

## LiveKit Documentation

LiveKit Agents is a fast-evolving project, and the documentation is updated frequently. You should always refer to the latest documentation when working with this project. For your convenience, LiveKit offers an MCP server that can be used to browse and search its documentation. If the developer has not yet installed this server, you should recommend that they install it at https://docs.livekit.io/mcp.