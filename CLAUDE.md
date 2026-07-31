# Monorepo Project: "Kuadrat" - A Minimalist Online Art Gallery

## Project Overview

Kuadrat is a minimalist online marketplace for art, functioning as a virtual art gallery. Artists (Sellers) list their work and art enthusiasts (Buyers) purchase it. The dealer takes a commission on each sale. The project includes a RESTful API backend, NextJS frontend, real-time auctions, and live events/streaming, all managed within a dockerized monorepo.

## Technology Stack

* **Backend:** Express.js on Node.js 20
* **Database:** Turso (libsql/client, SQLite-compatible)
* **Frontend:** Next.js 16, React 19, JavaScript (no TypeScript), TailwindCSS, App Router
* **Auth:** Passport.js (passport-local + passport-jwt), JWT tokens
* **Payments:** Stripe (primary), Revolut (legacy support)
* **Real-time:** Socket.IO for auctions and event notifications (plus the authenticated per-event room used by Agora events)
* **Streaming:** LiveKit + Agora, selectable per event (`events.provider`, default `livekit`); Agora adds an `interaction_mode` (`broadcast` = LiveKit parity | `meeting` = Meet-style camera grid, max 16 attendees) and client-side virtual backgrounds (see below)
* **Email:** Nodemailer with SMTP
* **Logging:** Pino (structured JSON in production, pretty in development)
* **Validation:** Zod schemas for API request validation
* **Containerization:** Docker and Docker Compose
* **Monitoring:** Sentry (client + server)

## Design Philosophy

* **Extreme Minimalism:** TailwindCSS components and UI Blocks, no modifications
* **Focus on Art:** Only images are the artworks themselves
* **Light Theme Only:** No dark mode
* **All Spanish UI text** (es-ES locale)

## Architecture

### Backend (`api/`)

```
api/
├── config/
│   ├── database.js      — DB schema (single source of truth, idempotent)
│   ├── env.js           — Centralized env config with validation
│   ├── logger.js        — Pino logger (JSON prod, pretty dev)
│   ├── passport.js      — JWT + Local auth strategies
│   └── shutdown.js      — Graceful shutdown handler
├── controllers/
│   ├── ordersController.js    — Order CRUD (largest controller)
│   ├── orders/index.js        — Re-export for future splitting
│   ├── paymentsController.js  — Revolut payment flow
│   ├── stripePaymentsController.js — Stripe payment flow
│   ├── artController.js       — Art product CRUD
│   ├── othersController.js    — Other products CRUD
│   ├── auctionController.js   — Public auction endpoints
│   ├── auctionAdminController.js — Admin auction management
│   ├── eventController.js     — Public event endpoints
│   ├── eventAdminController.js — Admin event management
│   ├── authController.js      — Login, register, password reset
│   ├── usersController.js     — User/author profiles
│   └── shippingController.js  — Shipping methods and zones
├── middleware/
│   ├── errorHandler.js    — ApiError class + global handler
│   ├── authorization.js   — JWT auth + role checks
│   ├── adminAuth.js       — Admin-only middleware
│   ├── rateLimiter.js     — 4-tier rate limiting (uses config/env.js)
│   ├── securityMiddleware.js — Prototype pollution, command injection, UA filter
│   ├── validate.js        — Zod schema validation middleware
│   ├── cache.js           — ETag + Cache-Control header middleware
│   └── timeout.js         — Request timeout middleware
├── routes/
│   ├── admin/             — Split admin routes (authenticate + adminAuth applied at index)
│   │   ├── index.js       — Main router, mounts sub-routes
│   │   ├── authorRoutes.js
│   │   ├── productRoutes.js
│   │   ├── orderRoutes.js
│   │   ├── shippingRoutes.js
│   │   ├── auctionRoutes.js
│   │   ├── eventRoutes.js
│   │   └── othersRoutes.js
│   ├── authRoutes.js, artRoutes.js, othersRoutes.js, ...
│   └── sellerRoutes.js, shippingRoutes.js, ...
├── services/
│   ├── emailService.js    — All email templates and sending
│   ├── email/index.js     — Re-export for future splitting
│   ├── stripeService.js   — Stripe API wrapper
│   ├── auctionService.js  — Auction business logic
│   ├── eventService.js    — Event CRUD + LiveKit
│   ├── livekitService.js  — LiveKit token generation
│   ├── agoraService.js    — Agora RTC tokens (agora-token) + moderation REST (kicking rules)
│   └── revolutService.js  — Revolut payment integration (legacy)
├── validators/            — Zod request validation schemas
│   ├── authSchemas.js
│   ├── orderSchemas.js
│   ├── productSchemas.js
│   ├── shippingSchemas.js
│   ├── auctionSchemas.js
│   └── eventSchemas.js
├── utils/
│   ├── transaction.js     — Turso batch/transaction wrapper
│   ├── response.js        — Standardized API response helpers
│   ├── htmlEscape.js      — HTML sanitization
│   └── paymentHelpers.js  — Currency conversion, VAT
├── socket/
│   ├── auctionSocket.js   — Real-time auction events
│   └── eventSocket.js     — Event notifications + authenticated Agora event rooms (presence, chat, moderation)
├── scheduler/
│   └── auctionScheduler.js — Cron job (every 30s) for auction lifecycle
└── server.js              — Express + Socket.IO + middleware stack
```

### Frontend (`client/`)

```
client/
├── app/                   — Next.js App Router pages
│   ├── admin/             — Admin dashboard (AuthGuard wrapper)
│   ├── galeria/           — Art gallery + product detail
│   ├── subastas/          — Auction pages
│   ├── espacios/          — Events/streaming pages
│   ├── orders/            — Customer order history
│   ├── seller/            — Seller dashboard
│   └── layout.js          — Root layout with providers
├── components/
│   ├── ErrorBoundary.js   — React error boundary with retry
│   ├── ShoppingCartDrawer.js — Cart checkout flow (3 steps)
│   ├── BidModal.js        — Auction bidding interface (9 phases)
│   ├── EventLiveRoom.js   — LiveKit video integration
│   ├── Navbar.js, AuthGuard.js, Notification.js, ...
│   └── cart/, auction/, events/ — Future sub-component directories
├── contexts/
│   ├── CartContext.js      — Cart state (useMemo/useCallback optimized)
│   ├── AuthContext.js      — User auth state
│   ├── NotificationContext.js
│   └── BannerNotificationContext.js
├── hooks/
│   ├── useDebounce.js     — Generic debounce hook
│   ├── usePostalCodeValidation.js — Shared postal validation
│   ├── useAuctionSocket.js — Socket.IO for auctions
│   ├── useEventSocket.js  — Socket.IO for events
│   └── useGalleryAuthors.js, useGalleryProducts.js
├── lib/
│   ├── api.js             — Centralized API client (1064 lines)
│   ├── api/index.js       — Re-export for future splitting
│   ├── constants.js       — App-wide constants (debounce, animation, cart)
│   ├── serverApi.js       — Server-side API calls
│   └── stripe.js          — Stripe.js promise loader
└── next.config.js         — Sentry, CSP headers, standalone output
```

## Key Patterns

### Backend Patterns

* **Structured Logging:** All files use `const logger = require('../config/logger')` (Pino). No `console.log` in production code.
* **Centralized Config:** All env vars accessed via `const config = require('../config/env')`. Validates required vars at startup.
* **Request Validation:** Zod schemas in `api/validators/`, applied via `validate()` middleware in routes.
* **Response Helpers:** `sendSuccess()`, `sendPaginated()`, `sendCreated()` from `api/utils/response.js`.
* **Error Handling:** `ApiError` class thrown in controllers, caught by global `errorHandler` middleware.
* **Transactions:** `createBatch()` from `api/utils/transaction.js` for atomic multi-table operations.
* **Caching:** `cacheControl()` middleware on public GET endpoints (art, others, authors).
* **Rate Limiting:** 4-tier via `config.rateLimit.*` (general, auth, sensitive, paymentVerification).
* **Graceful Shutdown:** SIGTERM/SIGINT handlers close HTTP, Socket.IO, log sequence.
* **Response Compression:** gzip via `compression` middleware (early in stack).

### Frontend Patterns

* **Performance:** CartContext uses `useMemo`/`useCallback` on all exposed functions.
* **Error Boundaries:** `<ErrorBoundary>` component for graceful failure handling.
* **Shared Hooks:** `useDebounce`, `usePostalCodeValidation` avoid duplicate logic.
* **Constants:** Magic numbers extracted to `lib/constants.js`.
* **API Client:** Centralized `lib/api.js` with request deduplication and global 401/429 handling.

## Testing (isolation rules — non-negotiable)

The local development environment points at the **preproduction** Turso database and at the real email provider. A test run must therefore never be allowed to reach either. Run the backend suite with `npm test` from `api/` (or `docker compose exec api npm test`).

**The three guarantees, each enforced in code rather than by convention:**

* **Local database.** `api/.env.test` sets `TURSO_DATABASE_URL=file:./.tmp/test.db` — a local SQLite file through the very same `@libsql/client`, so no application code changes. `api/tests/setup/globalSetup.js` recreates it from `initializeDatabase()` (still the single source of schema truth) and `globalTeardown.js` deletes it; `KEEP_TEST_DB=1` keeps it for post-mortem. `importPostalCodes()` is skipped under test (`SEED_POSTAL_CODES=1` forces the full ES.csv import); a few sample codes are seeded in `tests/setup/seed.js`.
* **Anti-remote guard.** `api/config/database.js` aborts the process (`process.exit(1)`, before the client is created) when `NODE_ENV=test` and the URL is not `file:`. This is the backstop that makes the rest a guarantee: a stale `.env`, a compose file injecting preprod, or a broken dotenv override can no longer write to preproduction.
* **No email leaves the process.** `config.emailTransport` is `noop` whenever `NODE_ENV=test` (or `EMAIL_TRANSPORT=noop`). `sendMail()` in `api/services/emailService.js` — the single chokepoint for both Resend and SMTP — records the message in an in-memory outbox and returns a synthetic `messageId` instead of contacting anyone. `marketingEmailService.marketingActive()` carries the same kill switch. Assert on email with `emailService.__getOutbox()` / `__clearOutbox()`.

**Structural rules that make the above possible:**

* `api/app.js` assembles Express + Socket.IO and is **free of side effects**; `api/server.js` is the process entry point and owns everything that touches the world (schema init, wallet migration, email verification, `listen`, the five schedulers, graceful shutdown). Tests import `app.js`, never `server.js` — importing `server.js` would start the schedulers, which mutate whatever database is configured.
* Integration tests require `tests/helpers/app.js`, not `../app` directly: it registers the `afterAll` that releases the Socket.IO handles, without which the Jest worker never exits.
* Sentry is skipped entirely under test (`instrument.js` and the `setupExpressErrorHandler` call are both guarded). Merely importing `@sentry/node` installs global require-hook instrumentation that survives Jest's per-file module registry and breaks unrelated suites.
* `dotenv` does **not** overwrite variables already in `process.env`, and in Docker the preprod values arrive via compose `env_file`. `tests/setup/env.js` therefore loads `.env.test` with `{ override: true }`. Never load a test env file without it.
* `api/.env.test` is **versioned** and contains dummy values only — never a real credential. Personal overrides go in the gitignored `.env.test.local`.
* `tests/testEnvironmentIsolation.test.js` asserts all three guarantees; treat a failure there as a stop-the-line event.
* `client/` has no test runner yet. When one is added the same rule applies: client tests must not reach the network, the API or any real database.

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

## Database Schema Management

The database schema is defined in `api/config/database.js`. This file is the **single source of truth**.

**Key rules:**
* `initializeDatabase()` runs on every startup (idempotent via `IF NOT EXISTS`).
* Schema changes: update the `CREATE TABLE` statement directly, never add `ALTER TABLE` blocks.
* 25 tables, 30+ indexes (including performance indexes on orders, products, auctions, events).
* Orders auto-increment starts at 1000 (for fresh DBs).
* Postal codes imported from `api/migrations/ES.csv` (only when empty).

## Postal Code References (Polymorphic Pivot Tables)

Three pivot tables use a **polymorphic reference pattern**:
* `ref_type` — `'postal_code'` | `'province'` | `'country'`
* `postal_code_id` — set only when `ref_type = 'postal_code'`
* `ref_value` — province name or country code otherwise

## Product Images (Polymorphic, up to 3 per entity)

Product images live in a single polymorphic table `product_images`:
* `product_type` — `'art'` | `'other'` | `'other_var'`
* `product_id` — the FK into `art`, `others`, or `other_vars` respectively
* `basename` — globally unique UUID-based filename; the file lives under `art/` for `'art'` and under `others/` for both `'other'` and `'other_var'`
* `position` — 0..2 ordering within each `(product_type, product_id)` group

Read path: API controllers select product rows WITHOUT `basename` and then call `attachProductImages(rows, productType)` from `api/utils/productImages.js` to hydrate each row with `images: [...]` and a derived `thumbnail_basename`. For SQL paths that snapshot a single basename (orders, payments, emails), use the inline subquery `(SELECT basename FROM product_images WHERE product_type = ? AND product_id = X.id ORDER BY position ASC, id ASC LIMIT 1) AS basename`.

The cap of 3 images per `(product_type, product_id)` is enforced at the upload layer (multer maxCount + controller validation), not at the DB level. The `art`, `others`, and `other_vars` tables no longer carry a `basename` column.

## Art Limited Editions (`edition_size` / `editions_sold`)

An `art` row can represent a run of N copies (e.g. 15 prints of a digital collage), not just a unique physical work. Two columns on `art` model it: `edition_size` (fixed at creation, default 1, **immutable** — never written by any edit endpoint, same as `slug`/`status`) and `editions_sold` (copies reserved or sold).

**The load-bearing rule:** `is_sold` now means *"edition sold out"* and is **only ever written in the same SQL statement as `editions_sold`** — never on its own. That keeps every existing `is_sold` reader (gallery filter, sold badge, auction eligibility, seller dashboard) working untouched, and with `edition_size = 1` the behavior is bit-for-bit the pre-existing one. The two statements are:

```sql
-- Consume one copy (guarded increment; rowsAffected = 0 means sold out)
UPDATE art SET editions_sold = editions_sold + 1,
       is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
 WHERE id = ? AND editions_sold < edition_size
-- Release one copy (guarded decrement)
UPDATE art SET editions_sold = MAX(editions_sold - 1, 0), is_sold = 0
 WHERE id = ? AND editions_sold > 0
```

A regression test in `api/tests/editionInventory.test.js` greps `controllers/`, `services/` and `scheduler/` and fails if any `UPDATE art` touches `is_sold` without `editions_sold`.

**One consumption point per sales channel** — the counter is NOT idempotent, so a second write double-counts:
* **Checkout:** `ordersController.placeOrder` reserves. `verifyPayment` (both the Stripe path and `paymentsController`) deliberately does **not** re-mark art — the old `is_sold = 1` re-marking was only safe because a flag is idempotent.
* **Draws:** `drawAdminController.billParticipation` consumes *before* charging Stripe and releases on charge failure; `draws.units` caps how many winners can be billed.
* **Auctions:** `auctionScheduler.processAuctionEnd` consumes exactly one copy on adjudication; auction billing never touches inventory.
* **Release:** `inventoryService.releaseOrderInventory` is the single release path and claims `orders.inventory_released_at` conditionally first, so a double release (webhook + TTL cleanup) can never decrement twice.

Buyers see only "Edición limitada de N ejemplares" (never the remaining count); the cart still forbids the same artwork twice, but a buyer may purchase another copy in a later order. Texts live in `EDITION_COPY` in `client/lib/constants.js`.

## Agora Virtual Backgrounds (client-only)

Background blur / image replacement over the local camera in Agora rooms. **Frontend only** — no API, DB, or env vars involved; the processed video is published straight to the channel, so no signalling and no LiveKit impact.

* **Where:** `client/hooks/useAgoraVideoEffect.js` (processor lifecycle) + `client/components/events/VideoEffectsMenu.js` (panel), mounted next to the Camera toggle in `AgoraHostControls` (host, both modes) and `MeetingSelfControls` (meeting attendees). Broadcast attendees never get it — they don't publish video.
* **Adding a background:** drop a file in `client/public/fondos-virtuales/` (16:9, 1280×720 recommended, even width×height, JPG/WEBP, <300 KB) and add its `{ file, label }` entry to `client/lib/virtualBackgrounds.js`. Order there is the display order; an empty catalog is valid (panel shows only blur).
* **Lifecycle rules:** `agora-extension-virtual-background` (~2.1 MB, WASM inlined) is loaded via dynamic `import()` on the **first panel open**, never at mount. `setOptions()` must always run **before** `enable()` (otherwise the SDK applies blur degree 1). "Ninguno" only `disable()`s — the processor stays initialized. The processor is reconciled against `camTrackVersion` from `useAgoraRoom`, which ticks whenever the camera track is created or destroyed; `unpipe()` + `release()` happen when the track goes away. Never applied to screen share or the whiteboard.
* **Degradation:** the control is hidden on mobile (vendor advises against it), replaced by an es-ES notice when `checkCompatibility()` is false, and auto-disabled on `processor.onoverload` — the persisted preference (`localStorage`, key in `client/lib/constants.js`) is not overwritten in that case.
* **CSP:** no changes needed; `'unsafe-eval'` in `script-src` (already present) is what lets the WASM compile.

## Environment Variables

All environment variables are validated at startup via `api/config/env.js`. See `api/.env.example` for full documentation. Key groups:
* **Application:** PORT, NODE_ENV, LOG_LEVEL, CLIENT_URL
* **Frontend environment identity:** NEXT_PUBLIC_APP_ENV (`preprod` | `production`) — build-time `NEXT_PUBLIC_*` var that distinguishes preprod from prod on the client. Required because Next.js forces `NODE_ENV=production` during `next build` and inlines it, so `NODE_ENV` cannot separate the two. Read via `client/lib/env.js` (`IS_PROD`); reserved for prod-only concerns (currently no consumer — its original one, Plausible Analytics, was removed). Unset defaults to `production` (fail-safe).
* **Storefront buy/quote toggles:** NEXT_PUBLIC_PAYMENT_ENABLED and NEXT_PUBLIC_ART_BUY_AVAILABLE — build-time `NEXT_PUBLIC_*` vars read via `client/lib/constants.js` (`PAYMENT_ENABLED`, `ART_BUY_AVAILABLE`). Parsed `!== 'false'` (fail-safe: unset = enabled; only the literal `'false'` disables). `PAYMENT_ENABLED` gates the "Añadir a la cesta" button on both art (`galeria/p/[id]`) and other (`tienda/p/[id]`) detail pages. `ART_BUY_AVAILABLE` applies only to art. Art truth table: both `false` → no button; both `true` → "Añadir a la cesta"; otherwise → "Solicitar cotización" (opens `ArtProductQuoteModal`, posts to `/api/inquiries/quote`). When the quote button shows, the inquiry CTA ("haz click aquí") is hidden.
* **Database:** TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
* **Auth:** JWT_SECRET, JWT_EXPIRES_IN
* **Email:** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, BUSINESS_EMAIL (optional; falls back to EMAIL_FROM — used by the art product inquiry form as the commercial inbox)
* **Payments:** STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYMENT_PROVIDER
* **LiveKit:** LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
* **Agora:** AGORA_APP_ID, AGORA_APP_CERTIFICATE (RTC tokens), AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET (moderation REST). All server-side — the App ID reaches the client in the token endpoint response (no `NEXT_PUBLIC_*`, no Docker build-args). The Agora console project MUST have **Co-host authentication** enabled or subscriber tokens could publish. Optional whiteboard phase: AGORA_WHITEBOARD_APP_IDENTIFIER, AGORA_WHITEBOARD_AK, AGORA_WHITEBOARD_SK, AGORA_WHITEBOARD_REGION (default `eu`) — empty hides the host's whiteboard toggle. The whiteboard SDK (`white-web-sdk`) loads its modules from `blob:` URLs, so the `client/next.config.js` CSP MUST allow `blob:` in `script-src` and `connect-src` (plus the existing `worker-src`); `*.netless.link` is in `font-src` and `*.agoralab.co` in `connect-src` to silence its network noise. The console warning `Cannot find module 'agora-foundation/lib/logger'` / "fallback to Argus" is **benign and expected**: `white-web-sdk@2.16.56` peer-depends on `agora-foundation@3.11.1`, unpublished on npm (only `3.11.0` exists) — do NOT force a version; the SDK falls back to its Argus logger.
* **NTAG 424 DNA (CoA):** NTAG424_SYSTEM_ID, NTAG424_K_PICC, NTAG424_MASTER_KEY, IP_HASH_SALT — critical secrets validated via `requiredHex()`. Custody documented in `scripts/nfc-personalization/README.md §7`.
* **Captcha (Cloudflare Turnstile):** TURNSTILE_SECRET (api, optional — when empty the inquiry endpoint refuses with 503 CAPTCHA_UNAVAILABLE), NEXT_PUBLIC_TURNSTILE_SITE_KEY (client, optional — when empty the inquiry CTA on the art product page is hidden). Used by the art product inquiry form. Test keys ("always passes") are documented in `.env.example`.
* **Rate Limiting:** GENERAL_RATE_LIMIT_*, AUTH_RATE_LIMIT_*, COA_VERIFY_RATE_LIMIT_*, INQUIRY_RATE_LIMIT_*, etc. Note: `*_WINDOW_SECONDS` is multiplied by 60 in the limiter — values are effectively in MINUTES (legacy naming).
* **Business / VAT (per-seller):** VAT rates are per-seller columns on `users`: `tax_vat_art` (default 10) and `tax_vat_other` (default 21), whole percentages, editable by the admin (same pattern as `dealer_commission_*`). The fiscal regime of an art sale is **derived** from `tax_vat_art` via `api/utils/vatRegime.js`: `10 → 'art_rebu'`, any other value (e.g. 21 = cooperativa) `→ 'standard_vat'`. `other` products and events are always `standard_vat`. The regime is **snapshotted per item** in `art_order_items.vat_regime` at sale time (checkout, auction billing, draw billing) — changing a seller's rate only affects future sales; reads use `COALESCE(vat_regime, 'art_rebu')`. Wallet crediting/debiting, payouts, buyer invoices (Serie A REBU / Serie P standard) and the fiscal export all key off the item's snapshot, not its table. `TAX_VAT_ES` (env) is **legacy-only**: it survives solely for Revolut line item metadata (`ordersController.placeOrder`); `TAX_VAT_ART_ES` and the `NEXT_PUBLIC_TAX_VAT_*` build vars have been removed.

### Adding a new `NEXT_PUBLIC_*` variable

`NEXT_PUBLIC_*` vars are embedded into the JS bundle at build time, so they must be present as ENV variables *during* `npm run build`. To add one, touch all FOUR places — missing any of them silently ships an empty value to production:

1. `/.env.example` (repo root) — the source list read by docker-compose; also add it to local `/.env`.
2. `client/.env.example` — the per-app reference for devs running Next.js outside Docker.
3. `client/Dockerfile.staging` AND `client/Dockerfile.prod` — add an `ARG` line in the build-args block AND a matching `ENV NAME=$NAME` line before `RUN npm run build`. The local `client/Dockerfile` does NOT need it (dev mode reads env vars at runtime).
4. `docker-compose.prod.yml` AND `docker-compose.pre2.yml` (staging) — add `- NEXT_PUBLIC_FOO=${NEXT_PUBLIC_FOO}` inside the client service's `build.args:` block.

## Certificates of Authenticity (NTAG 424 DNA)

Each artwork ships with a paper Certificate of Authenticity carrying a NTAG 424 DNA sticker. A tap with any phone resolves to a unique-per-read URL that the backend verifies cryptographically (PICC encrypted + truncated CMAC, SDM mode), proving authenticity and protecting against replay.

* **Public endpoint:** `GET /api/coa/verify?picc=<32hex>&cmac=<16hex>` → `{ status: ok | malformed | invalid_cmac | unknown_tag | revoked | replay }`. No auth, dedicated rate limit (`coaVerifyLimiter`).
* **Admin endpoints:** `GET /api/admin/coa/tags` (paginated list), `GET /api/admin/coa/tags/:uid` (detail + last N `verification_events`), `PATCH /api/admin/coa/tags/:uid/status` (revoke / lost / damaged with audit notes).
* **Public page:** `client/app/coa/page.js` (Server Component, `force-dynamic`). Calls the backend via `INTERNAL_API_URL` and renders success or failure with es-ES messages from `client/lib/constants.js`.
* **Tables:** `nfc_tags` (one row per **physical sticker**, FK to `art` with `ON DELETE RESTRICT`) and `verification_events` (audit log of every tap, including failed attempts; IPs stored as HMAC-SHA256).
* **Limited editions:** an artwork with `edition_size > 1` gets one sticker (one `nfc_tags` row) per copy, all sharing `art_id` — the schema always allowed it (PK is `uid`; `art_id` is not unique). `nfc_tags.edition_number` holds the copy number (NULL for unique works) and `serial_label` becomes `GAL-<year>-<artId>-<n>/<N>`. The paper certificate is a single shared design ("Edición limitada de N ejemplares") that the artist numbers by hand; the operator records the same number when personalizing. Each sticker keeps its own derived keys, anti-replay counter and `status`, so copies are revocable one by one. `/coa` shows "Edición Limitada. Ejemplar n de N".
* **Personalization scripts:** `scripts/nfc-personalization/` — separate Node.js subproject, ESM, **runs OUTSIDE Docker** (needs USB access to the ACR1552U reader). Uses the `ntag424` library (AGPL, internal use only) for the NTAG protocol; uses the same key derivation as the backend (`AES-CMAC(MASTER_KEY, label||UID||SYSTEM_ID)`). The "one active tag per artwork" guard is enforced there (not in the DB): it allows up to `edition_size` active tags and rejects a duplicate copy number.
* **Reference:** `docs/guia_ntag424_galeria.md` for the deep technical context.
