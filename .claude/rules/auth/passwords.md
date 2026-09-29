---
paths:
  - "api/controllers/{authController,usersController}.js"
  - "api/routes/{authRoutes,sellerRoutes}.js"
  - "api/routes/admin/authorRoutes.js"
  - "api/config/passport.js"
  - "api/utils/{passwordSecurity,redactUrl}.js"
  - "api/app.js"
  - "api/tests/passwordChangeInvalidation.test.js"
  - "client/app/{restablecer-password,user-activation}/**"
  - "client/app/admin/authors/**"
---

## Passwords: two token flows that must never merge

There are **two** independent link-based password flows on `users`, and collapsing them reopens the hole the second one was built to close.

* **Activation** (`password_setup_token`, plaintext, 48 h) → `/user-activation/[token]`. Its three entry points (`authController.validateSetupToken`, `authController.setPassword`, `authorRoutes` `/:id/resend-invitation`) all refuse an account whose `password_hash` is non-empty. **That refusal is the feature**: it is what stops a leaked invitation from reopening a live account, and `is_activated` in the admin panel derives from the same signal.
* **Admin-initiated reset** (`password_reset_token_hash`, **SHA-256**, 24 h) → `/restablecer-password/[token]`. Built for exactly the accounts activation refuses. Only the hash is stored — a database dump (and one goes to S3 daily) must not be usable to take an artist's account. SHA-256 and not bcrypt because the token is already 256 bits of CSPRNG output: no dictionary to attack, no derivation cost to pay. Same criterion as `event_attendees.access_token_hash`.

**Reset expiry is compared in SQL** (`datetime(password_reset_token_expires) > datetime('now')`), never in JavaScript. `sqlUtcTimestamp()` in `api/utils/passwordSecurity.js` writes it in the exact zone-less UTC shape `CURRENT_TIMESTAMP` produces; `new Date().toISOString()` would look equivalent and sort wrong — on the same calendar day `'…T10:00:00.000Z'` ranks **above** `'… 12:00:00'` because `'T'` (0x54) outranks `' '` (0x20), so an expired link would read as live. A miss then cannot distinguish "expired" from "never existed", so a second query runs **only when the first finds nothing** — the artist needs to know whether to ask the admin for a new link (410) or that the link is spent (404).

The consuming `UPDATE` is a single statement guarded by the token hash, so two concurrent requests with the same link cannot both set a password; the loser sees `rowsAffected = 0` and gets a 404, never a 500. **It returns no JWT** — unlike activation, the account already exists and may be in dispute, so mailbox access must not be enough to hand out a session.

Errors carry a machine code in `title` (`RESET_TOKEN_INVALID` | `RESET_TOKEN_EXPIRED` | `RESET_PASSWORD_WEAK`), same pattern as `SHIPPING_ADDRESS_REQUIRED`; the es-ES copy lives in `PASSWORD_RESET_ERRORS` in `client/lib/constants.js`. The validation response returns **only `full_name`** — returning the email would turn a stolen link into confirmation of which account it opens.

Bulk send (`POST /api/admin/authors/send-password-reset-all`) is **sequential, never `Promise.all`**: the provider rate-limits, a partial failure must be legible artist by artist, and `Promise.all` would abort on the first rejection leaving half the roster with a fresh token and no email — their old link dead too. It must stay declared **above** the `/:id` routes or Express reads it as an id. Re-running it invalidates every outstanding link (one live link per account), which the confirmation dialog says out loud.

### `password_changed_at` — every password write, or the mechanism has holes

`users.password_changed_at` is written **in the same SQL statement as `password_hash`**, in all three paths that touch it (reset, `PUT /api/seller/profile/password`, activation). `api/config/passport.js` rejects any JWT whose `iat` predates it, which is what actually signs out sessions opened with the old password — without it a changed password leaves old JWTs valid for `JWT_EXPIRES_IN` (7 days), the exact exposure the migration exists to close. Invalidating only on reset would leave the self-service change as a back door.

* Compared in **whole seconds** (`iat` is seconds) and **strictly** (`<`), so signing in during the same second as the change survives.
* `parseSqlUtcDate()` appends the missing `Z` before constructing the `Date`: SQLite stores `CURRENT_TIMESTAMP` in UTC with no zone marker and Node would read it as **local** — two hours off under `TZ=Europe/Madrid`. Has a test that sweeps four timezones.
* `NULL` invalidates nothing. That is what lets this deploy without signing everybody out.
* No extra query: the strategy already loads the full `users` row.
* `api/tests/passwordChangeInvalidation.test.js` greps `controllers/`, `routes/` and `services/` and fails if any statement assigns `password_hash` without `password_changed_at` — same role as `editionInventory.test.js`.

**Credentials in the URL are redacted before logging.** `pino-http` logs `req.url` on every request and several routes carry a bearer credential as a path segment — the activation link, the reset link, the public order token (`/orders/public/token/:token`) and the signed `?vtoken=`. `api/utils/redactUrl.js` strips them in the `req` serializer of `api/app.js`. Adding a new route with a secret in the path means adding its prefix there.
