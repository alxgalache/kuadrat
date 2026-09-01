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

## Shipping Zone Resolution (one resolver, two entry points)

`api/services/shipping/zoneResolver.js` is the **only** place that answers "which legacy shipping zone applies to this product, shipped to this address". The buyer's quote (`getAvailableShipping`), the server-side cost check at payment (`verifyShippingCosts`) and the legacy provider all enter through it.

* **A tariff needs three coordinates, and dropping any one reintroduces the outage of 16/08/2026.** `method_id` picks the *column* (which modality the buyer chose), the postal code picks the *row* (which zone group the destination falls in), and `product_id` picks the *table* (each artwork has its own packaging and its own rate). The old verification used only `shipping_method_id + seller_id + LIMIT 1`; once the calculator started sharing one `shipping_methods` row across every artwork and every zone group, that predicate matched 24 rows with 6 different costs and returned an arbitrary one. **Every art checkout returned 400.**
* **`verifyShippingCosts` does not query the database.** It calls the resolver and looks the chosen method up in the result, so the price shown and the price validated are the same number rather than two numbers that have to agree. The parity test in `api/tests/shippingCostVerification.test.js` asserts exactly that, and is what stops a fourth parallel query appearing — same role as `sentryGating.test.js`.
* **Three vocabularies, none optional.** `shipping_methods.article_type` is `'art' | 'others' | 'all'`; `shipping_zones.product_type` is `'art' | 'other'`; cart and payment items are `'art' | 'other'`. The resolver speaks the cart's and translates in one place (`PRODUCT_TYPES`). Comparing `'other'` against `article_type` matches nothing but `'all'`, so every dedicated store method vanishes — silently, and invisibly to the gallery, which uses `'art'` in both. It has its own test.
* **The destination is the order's delivery address, never `item.shipping.deliveryPostalCode`.** That field is captured at add-to-cart, is client-supplied, and trusting it lets a buyer pay a peninsular rate and ship to the Canaries (15,29 € vs 27,91 € on a real artwork). `create-intent` and `init-order` take `deliveryAddress: { country, postalCode }` and **reject a delivery item without it** (`SHIPPING_ADDRESS_REQUIRED`) — a fallback to the cart's postal code would *be* the bypass, since omitting the field is free. Pickup methods need no address: their zones are seller-wide. Consequence: **api and client must deploy together.**
* **`zoneId` travels out, never in.** It is returned for traceability and logged with each verified price; accepting one from the client would let the browser name the priced row.
* **Rejections carry a machine code in `title`** (`SHIPPING_ADDRESS_REQUIRED` | `SHIPPING_METHOD_UNAVAILABLE` | `SHIPPING_COST_OUTDATED`), same pattern as `CAPTCHA_UNAVAILABLE`; texts live in `SHIPPING_VERIFICATION_ERRORS` in `client/lib/constants.js`. The old single message said "Recarga la página", which fixes nothing — the cart is in `localStorage`. `SHIPPING_COST_OUTDATED` fires whenever an artwork is re-quoted in the calculator while buyers hold it in their carts.
* **Money is compared in integer cents.** `Math.abs(a - b) > 0.01` does not express "one cent of tolerance": 15,30 and 15,29 are `0.010000000000001563` apart in binary floating point, so the boundary the comparison claims to allow was rejected at random.
* **Sendcloud-quoted items never enter this path.** They reach payment with `shipping: null` (`setSendcloudShipping` writes to `shippingSelections`, a state parallel to the cart, never to `item.shipping`), and the `if (!item.shipping?.methodId) continue` guard on the first line of `verifyShippingCosts` is what keeps them out.
* **`drawService.js:694-744` still duplicates the matching predicate**, deliberately: it answers *deliverability* (a boolean), selects no `cost`, and so cannot produce a wrong charge.
* **That gap is closed.** Sendcloud shipping for `other` products really was never charged (`computeShippingTotal` sums `item.shipping.cost`, which is `null` for them) and simultaneously double-recorded (the selection was copied onto every expanded unit row). See the section below.

## Art Shipping Calculator (Sendcloud)

Admin screen at `/admin/calculadora-envios` that quotes an artwork against Sendcloud and writes the resulting `shipping_methods` + `shipping_zones` rows. It replaces the admin's keyboard, **not** the checkout's pricing engine: `SENDCLOUD_ENABLED_ART` stays `false` and art checkout keeps reading zones through the legacy lookup. The calculator only changes where the number in `shipping_zones.cost` comes from.

* **Three new columns on `art`, written by nothing else.** `outside_dimensions` (TEXT, `LxWxH` cm) and `outside_weight` (INTEGER, grams) describe the **package**, not the artwork — `dimensions`/`weight` describe the piece, and the carrier bills the volumetric weight of the box. `packaging_cost` (REAL, `NOT NULL DEFAULT 0`; a self-packing artist is a legitimate 0). Written only from `PATCH|POST /api/admin/art-shipping/:artId/{packaging,quote}`; deliberately absent from `productValidation.js`, `ProductForm`, and stripped from `GET /admin/products/:id/edit-data`, whose `SELECT *` would otherwise hand them to the edit form.
* **Both package fields are mandatory to quote — no fallback to the artwork's own measurements.** A plausible substitute produces a plausible but wrong price, and that price is then frozen into `shipping_zones.cost` with nothing to show it was guessed. An empty input is visible; a silent substitution is not.
* **Four zone groups, not three.** `peninsula` (`28001`), `baleares` (`07001`), `canarias` (`35001`), `ceuta_melilla` (`51001`) — four `POST /v3/shipping-options` calls per artwork, fired with `Promise.allSettled` so one failing zone keeps the other three. **Baleares is its own group because it does not share a rate with the peninsula:** `correos:standard` is 6,38 € to Madrid and 8,48 € to Palma on the same parcel, and each side has options the other lacks (`baleares_express` only to Palma, `paq24`/`epaq24` only to the mainland). Merging them would force one `cost` onto two real rates.
* **Provinces come from `postal_codes` by exclusion, never from a list in code** (`api/utils/spainShippingZones.js`). `peninsula` is "every ES province that is not Baleares, Las Palmas, Santa Cruz de Tenerife, Ceuta or Melilla". A literal list of 47 accented strings drifts out of sync silently, and the symptom (one province stops offering shipping) looks nothing like the cause. `api/tests/spainShippingZones.test.js` asserts the four groups partition ES.csv's 52 provinces exactly (47+1+2+2).
* **Final price = `round(sendcloud_total × 1.21, 2) + packaging_cost`**, in that order — VAT taxes the transport, packaging is added after. The 21 % is a **local constant** of `artShippingCalculator.js`, explicitly decoupled from `TAX_VAT_ES` and from the seller's `tax_vat_art`/`tax_vat_other`: those are the VAT and fiscal regime of the *article* (REBU vs cooperativa), an axis independent of the VAT on *transport*, which is always the general rate.
* **Saving is set semantics, per zone group.** `POST /:artId/zones` deletes every previous generated zone of that group and inserts the current selection in one `createBatch()`. The delete is bounded by `(product_id, product_type, zone_group, source='sendcloud_calculator')` — all three matter, and `source` is what protects the admin's hand-made zones. Deselecting everything and saving is how a territory is cleared; there is no separate delete. Several options may be selected per group (more choice for the buyer), each becoming its own `shipping_zones` row pointing at a shared catalog `shipping_methods` row keyed by `sendcloud_option_code`.
* **A catalog method left with zero zones is deleted along with them.** After each save, any `shipping_methods` row whose `sendcloud_option_code` just lost its last `shipping_zones` row — counting every artwork and every group — is removed, so the admin shipping screens only list modalities some artwork actually offers. Bounded twice: only rows with a `sendcloud_option_code` (a hand-made method with no zones is one being configured, not rubbish), and only the codes *that save* could have orphaned (a global sweep would race with a concurrent save that has created its method but not yet its zones). Ticking the option again recreates the row — `ensureShippingMethod` is find-or-create. Order history is unaffected: `art_order_items`/`other_order_items` snapshot `shipping_method_name`/`shipping_method_type` and their `shipping_method_id` carries no FK.
* **The priced option travels in the save request** (`base_cost` per selection) rather than being re-quoted server-side, so the zone holds exactly the price the screen showed. `base_cost` + `packaging_cost_snapshot` + `calculated_at` are stored beside `cost` so the calculation can be reconstructed months later, once `art.packaging_cost` has moved on.
* **Option states:** eligible (numeric total > 0) → selectable; `quotes: []` → shown greyed out with "Sin tarifa disponible (contrato propio del vendedor)" (a real, announceable option Sendcloud does not price because it runs on the seller's own contract; `quote_error` is null, so there is nothing to display but the explanation); total `<= 0` → discarded entirely, which is how `sendcloud:letter` disappears.
* **Known ceiling:** Sendcloud prices insurance in `[2, 5000]` € and outside that range **silently charges the boundary premium** rather than erroring. The screen warns on artworks above 5000 €; there is no fix inside the API.

## Sendcloud Authentication and Insurance

* **`SENDCLOUD_AUTH_MODE`** (`auto` | `oauth2` | `basic`, default `auto`, invalid value fails startup). `auto` tries OAuth2 `client_credentials` against `https://account.sendcloud.com/oauth2/token`, retries **once** with a fresh token on 401/403, and then resolves that request with Basic Auth, logs a `warn` and skips OAuth2 for 5 minutes. `oauth2` throws instead of degrading; `basic` never contacts the token endpoint. **429 and 5xx are not credential problems**: they never discard the token, never retry for auth reasons and never trigger the fallback. A token-endpoint failure also degrades in `auto` mode — the API never returns a 401 in that case, so the request-level fallback would never fire.
* Token cache lives in a module variable of `api/services/shipping/sendcloudAuth.js`, renewed 60 s before `expires_in`, with a single in-flight promise so N concurrent calls make one token request. There is no `refresh_token`; refreshing means asking for a new token.
* **Nothing ever logs the `Authorization` header, the secret or the token** — `api/tests/sendcloudAuth.test.js` asserts it. The client used to emit a ready-to-paste cURL with the credential at `logger.info`, on every request, in production.
* **Every shipment travels insured for the value of its goods, in both flows, with no way to disable it.** `art` insures `art.price`; `other` insures `parcel.totalValue` from `parcelGrouper.js`. `user_sendcloud_configuration.insurance_type` and `insurance_fixed_amount` are **not read by anything** (the columns stay; no form ever wrote them, so branching on them was branching on a constant). This raised the price of every store shipment.
* **The same field has a different shape in each endpoint** — copying one to the other breaks silently or with a 400: `POST /v3/shipping-options` wants a bare **integer** (`350`); `POST /v3/shipments` wants an **object** (`{ value, currency }`). Both derive from `insuredValueFor()` in `api/services/shipping/sendcloudPricing.js`, the single point that rounds and clamps to `[2, 5000]`.
* **`createShipments()` declares the insured value it quoted with.** Without it the buyer pays a premium and the parcel is announced uninsured — a failure that is invisible, because the shipment goes out fine.
* **`hasUsableRate()`** (same module) is the shared filter: a quote total that is absent, non-numeric or `<= 0` is not an option. The comparison is on the **parsed** number — Sendcloud returns the total as a string and `sendcloud:letter` quotes `"0"`, which is truthy in JavaScript and used to be the only surviving option on a large parcel.

## Store Shipping: charged, verified, and counted once

The cart's Sendcloud selection lives in `shippingSelections`, a state **parallel** to the cart and keyed by seller; `item.shipping` stays `null` for those items. That one fact produced three separate defects, all invisible from any screen, and the rules below are what keep them closed.

* **The selection travels as its own field, never on the item.** `create-intent`, the Revolut init and `placeOrder` all take `shippingSelections: [{ sellerId, shippingOptionCode, servicePointId, cost }]`. Merging it back onto each cart item is what used to make `placeOrder` record it once per **unit**: 2 units of a 20 € product stored `orders.total_price = 49,14 €` while Stripe charged 40,00 € and the shipment cost 4,57 €. Three numbers, none of them equal.
* **The price charged is re-quoted server-side; the client's `cost` only detects drift.** `sendcloudQuoteVerifier.verifySendcloudShipping` rebuilds the parcels through **`cartQuoting`, the same module the quote endpoint uses** — not a second copy of the grouping rules, which is the mistake `zoneResolver` documents and the outage of 16/08/2026 paid for. Rejections carry a machine code in `title`: `SHIPPING_SELECTION_REQUIRED` | `SHIPPING_METHOD_UNAVAILABLE` | `SHIPPING_COST_OUTDATED` | `SHIPPING_ADDRESS_REQUIRED`, compared **in integer cents**.
* **`placeOrder` reads the amount off the `PaymentIntent`, it does not re-quote.** `create-intent` leaves it in metadata as `[{"s":<sellerId>,"c":<cents>}]`. Re-quoting there would be two numbers that have to agree across the seconds spent in the card form, and a fuel surcharge moving in that window would record something other than what was paid. Missing metadata (an older intent) or Revolut falls back to re-verifying, with a `warn`.
* **The cost is written ONCE per seller group**, on the item row with the lowest id, and `0` on the rest. That keeps the six `Σ (price_at_purchase + shipping_cost)` aggregations in `ordersController` correct **without touching any of them** and adds no column. Art and legacy items keep genuine per-item shipping.
* **Nothing price-determining comes from the request.** `enrichItemsFromDB` reads `weight`, `dimensions`, `price` and `can_copack` from the product row and **overwrites** the last two (no `|| item.x` fallback — the endpoint is public and unauthenticated). `canCopack` is not even in the Zod schema any more: it was never stored on the cart item, so the client always sent `true`, and a `can_copack = 0` product was quoted as one parcel and announced as N.
* **A shipping option's price is the SUM of its quotes.** `POST /v3/shipping-options` returns **one quote per parcel** — its own breakdown labels them `Label (1/3)`, `(2/3)`, `(3/3)` — and `quoteTotal` used to read `quotes[0]`. Verified live: one, two and three identical parcels all quoted 4,35 €. `estimatedDays` is the **max** lead time. With a single parcel the sum is unchanged, which is why the co-packed cart and the art calculator (`parcels: [parcel]`) price identically to before.
* **Volumetric weight and `dimensions` are mutually exclusive on one parcel.** This is the rule that will break whoever edits `parcelGrouper` next. The co-packed parcel carries `weight = max(Σ real, Σ volumetric)` and **no dimensions**, because Sendcloud applies its own volumetric calculation to whatever dimensions it receives and would bill the volume twice. A single-item parcel does the opposite — real weight *and* real dimensions — and lets Sendcloud use each carrier's own divisor and enforce its size limits. Divisor is **5000** (`api/utils/volumetricWeight.js`), deliberately not the 6000 Sendcloud applies: Σ of item volumes is the *floor* of any real box, so the two biases cancel instead of accumulating. Measured: a 1,2 kg parcel declared 60×60×60 cm is quoted as 36 kg — 5,06 € becomes 39,48 €.
* **`ProductForm` compared `productCategory === 'others'` in three places, a value the `<select>` cannot emit.** All three were dead code: the co-pack checkbox **never rendered** (so `can_copack` was unsettable by anyone), the weight was not required by the form though the API rejected it, and its label read "(opcional)". There is now one named predicate each (`isStoreCategory` / `isWeightRequired` / `areDimensionsRequired`); three inline copies is what let the typo survive. Dimensions joined weight as mandatory for store products, in the **shared** `api/utils/productValidation.js`.
* **Known blind spot:** the client half of that predicate has no automated test — the `api` container bind-mounts only `api/`, so no test in the suite can read `client/components/ProductForm.js`, and there is still no client test runner. The server half is covered.

## Store Pickup ("Recogida en persona")

Whether the cart offers pickup for **store (`other`) products** is decided by one column and nothing else: `user_sendcloud_configuration.allow_store_pickup` (INTEGER, `NOT NULL DEFAULT 0`), surfaced as the «Permitir recogida para productos de la tienda» checkbox beside «Empaqueta él mismo» in the admin author edit screen.

* **It replaced an inference, which is the whole point.** `shippingOptionsController` used to offer pickup whenever `users.pickup_address` and `users.pickup_city` were both non-empty — an address captured for other reasons silently doubling as consent to receive buyers at the door. Now the flag grants and the address only decorates: it is read for display, an empty one does **not** hide the option, and a complete one does **not** produce it. `SellerShippingGroup` joins the parts that exist so an enabled seller with no address renders no line rather than a bare `", "`.
* **Deployed `DEFAULT 0` with no backfill, deliberately.** Every existing seller starts with pickup off and is switched on one at a time from the panel. Safe here only because a single seller had store products at the time; on any other dataset this is a silent removal of a buyer-visible option.
* **A seller with no `user_sendcloud_configuration` row has no flag.** The `LEFT JOIN` yields `NULL`, which must read as an explicit `0` rather than as "unknown".
* **Art is out of scope and must stay out.** Art shipments are arranged by hand from the Sendcloud web interface, so an art-only seller group is never offered pickup here even when the flag is on; a mixed group gets it on account of its store items. Art pickup, where it exists, is a different mechanism entirely — a `shipping_methods` row with `type = 'pickup'` resolved by `zoneResolver.loadPickupZones`, untouched by this flag.
* **The column lives on the Sendcloud configuration, not on `users`,** because pickup is the buyer-facing alternative to a Sendcloud-quoted shipment and only exists for the product type Sendcloud quotes. Consequence: the checkbox disappears with the rest of the section when `SENDCLOUD_ENABLED` is off.
* `api/tests/storePickupFlag.test.js` covers all six cases. It drives the controller directly and touches no network — `.env.test` disables Sendcloud for both product types, so the legacy provider answers from the local database.

## Agora Virtual Backgrounds (client-only)

Background blur / image replacement over the local camera in Agora rooms. **Frontend only** — no API, DB, or env vars involved; the processed video is published straight to the channel, so no signalling and no LiveKit impact.

* **Where:** `client/hooks/useAgoraVideoEffect.js` (processor lifecycle) + `client/components/events/VideoEffectsMenu.js` (panel), mounted next to the Camera toggle in `AgoraHostControls` (host, both modes) and `MeetingSelfControls` (meeting attendees). Broadcast attendees never get it — they don't publish video.
* **Adding a background:** drop a file in `client/public/fondos-virtuales/` (16:9, 1280×720 recommended, even width×height, JPG/WEBP, <300 KB) and add its `{ file, label }` entry to `client/lib/virtualBackgrounds.js`. Order there is the display order; an empty catalog is valid (panel shows only blur).
* **Lifecycle rules:** `agora-extension-virtual-background` (~2.1 MB, WASM inlined) is loaded via dynamic `import()` on the **first panel open**, never at mount. `setOptions()` must always run **before** `enable()` (otherwise the SDK applies blur degree 1). "Ninguno" only `disable()`s — the processor stays initialized. The processor is reconciled against `camTrackVersion` from `useAgoraRoom`, which ticks whenever the camera track is created or destroyed; `unpipe()` + `release()` happen when the track goes away. Never applied to screen share or the whiteboard.
* **Degradation:** the control is hidden on mobile (vendor advises against it), replaced by an es-ES notice when `checkCompatibility()` is false, and auto-disabled on `processor.onoverload` — the persisted preference (`localStorage`, key in `client/lib/constants.js`) is not overwritten in that case.
* **CSP:** no changes needed; `'unsafe-eval'` in `script-src` (already present) is what lets the WASM compile.

## Production Load Hardening (caching, proxy, container topology)

A load test against production (15/08/2026, k6, ~96k requests) put the ceiling at **25 req/s** on the artwork detail page and **126 req/s** on the listing, with the bottleneck in **Next.js rendering — not the API or Turso** (the API served 60 req/s at p95 382 ms without straining). See `openspec/changes/production-load-hardening`.

* **Detail pages are ISR, and `revalidate` alone was not enough.** `/galeria/p/[id]`, `/galeria/autor/[authorSlug]` and the two `/tienda` equivalents export `revalidate = 300` **plus** `generateStaticParams()` returning `[]` and `dynamicParams = true`. A dynamic segment without `generateStaticParams` stays `ƒ (Dynamic)` in the `next build` route table and answers `no-store` — which is exactly what the highest-traffic route was doing. The empty list is deliberate: returning the real catalog would require the API to be up during `docker build`, turning a network blip into a broken deploy.
* **nginx configuration is versioned in `deploy/nginx/`** (it previously existed only on the instance). Three load-bearing details, none of them obvious: the **cache key includes the RSC headers** (`rsc`, `next-router-prefetch`, `next-router-state-tree`) because the App Router serves two different bodies at the same URL and nginx's default key lets one poison the other; `proxy_ignore_headers Cache-Control` is **deliberately absent**, which is the only thing keeping `/admin`, `/orders` and `/seller` out of the cache; and `proxy_cache_use_stale ... http_500` is the fix for the dirty-degradation finding — under overload the origin was returning 500 and cutting connections (`EOF` / `connection reset`), which reads as a network error, not a slow site.
* **Image variants never reach the browser at full size** — every product image goes through `/_next/image`, including the lightbox. The 1.5 MB original is a *CPU* problem, not a bandwidth one: each new variant makes the 1-vCPU container fetch, decode, resize and re-encode it. `minimumCacheTTL` is a year (basenames are UUIDs, so a URL's content never changes), `deviceSizes` is trimmed to 5 widths, and **AVIF is deliberately not generated** — it compresses better but its encode cost is the scarce resource here. Durability comes from nginx's on-disk cache, since the container's own cache lives in a 200 MB tmpfs wiped on every deploy.
* **Server-side rendering is exempt from the general rate limiter**, keyed on the **absence of `X-Forwarded-For`**, never on the IP range. nginx always appends the header and port 3001 is published only on `127.0.0.1`, so a request without it cannot have come from outside; checking only for a private range would be bypassable with `X-Forwarded-For: 10.0.0.1`. That property is the whole security of the mechanism and has its own test (`api/tests/rateLimitInternalExemption.test.js`). `client/lib/serverApi.js` splits `DATA_API_URL` (internal, for fetches) from `API_URL` (public — it travels inside the HTML for Open Graph images and must stay resolvable by social scrapers).
* **Container CPU limits must sum to less than the instance's vCPUs.** The box is a `t4g.medium` (2 vCPU); the previous `1.0 + 1.0` handed both to the containers and left nginx — which terminates TLS and now serves the cache — fighting for scraps. Now 0.75 (api) + 1.0 (client), favoring the client because that is where the measured bottleneck is.
* **`api/Dockerfile.prod`** exists because production was building from the *development* Dockerfile with `command:` overridden: `npm install` instead of `npm ci`, jest/nodemon/supertest shipped in the image, and no init process, so SIGTERM never reached the graceful-shutdown handler.
* **Deployment is a single script: `./deploy/deploy.sh`** (see `deploy/README.md`). It replaces the manual sequence and encodes two orderings that are easy to get wrong. **Purging the nginx page cache is mandatory on every client deploy** — static pages are cached for a year and their HTML references JS chunks the new build no longer has, giving a page that renders but does not hydrate. And the purge happens **after** the containers answer, not before: while they restart, `proxy_cache_use_stale` keeps serving visitors, and purging early throws away exactly that safety net. The old `docker compose down --rmi all --volumes` step is gone: it forced a from-scratch rebuild and kept the site down for the whole compile rather than just the restart (`--volumes` never touched uploads — `/home/ubuntu/uploads` is a bind mount).
* **The "zero Sentry issues" finding was a category error, not a Sentry bug.** ~40 000 failed requests during the load test produced no Sentry events because there was nothing to capture: the failures were dropped TCP connections, nginx `503`s from the rate limiter, and 500s from Next's internal plumbing — none of which is an exception in application code. Verified by hitting `GET /api/sentry-example-api` in production: it reached Sentry to the second, so `onRequestError` in `client/instrumentation.js` is wired correctly. **Do not "fix" Sentry for this.** The real gap was that nothing watched reachability, and `proxy_cache_use_stale` makes a dead origin *less* visible from outside, not more.
* **`TestAccessGate` blanked the entire server render, and that was the LCP.** Its `checking` state started at `true` and only ever fell to `false` inside a `useEffect`, which does not run on the server — so the root layout's whole subtree (navbar, page, banners, footer) rendered as `null` and **production shipped an empty `<body>`**; everything painted after hydration. PageSpeed reported it as "element render delay: 2800 ms" attributed to the cookie banner's `<p>`, which was merely the largest of the blocks that appeared at once. The fix is one line — the initial state is derived from `gateEnabled` (`useState(!gateEnabled)` / `useState(gateEnabled)`) — so with the gate off (production) there is nothing to check and nothing to hide, while with it on (preproduction) the blanking is unchanged and content still never precedes the password. Every context in the tree reads `localStorage` from an effect, never from a `useState` initializer, which is why turning SSR on introduced no hydration mismatch; **that property must hold for any new provider added to `app/layout.js`.**
  * **Two things the blanked render had been hiding, both of which now break the build or the page instead of failing silently.** First, `useSearchParams()` needs a Suspense boundary above it or `next build` aborts with `missing-suspense-with-csr-bailout` while prerendering — `/galeria` and `/tienda` had none because their tree never reached the prerenderer. They now use the same wrapper the payment result pages already used. The boundary does **not** make the page dynamic: both stay `○ (Static)` in the route table, and their content was client-fetched anyway, so the prerendered HTML shows the same "Cargando..." it always showed — what changed is that the navbar, footer and cookie banner now come with it. Second, `StoryVideo` drew its video with `Math.random()` in a `useState` initializer; server and client would draw different ones and React does not patch a mismatched attribute. The draw moved to `app/page.js` (a server component), so the homepage is static with a video that rotates on revalidation rather than on every load. **Anything that renders differently on each call is now a hydration bug where before it was invisible.**
  * **`next build` must run with `NODE_ENV=production`.** The local containers set `NODE_ENV=development` (`docker-compose.local.yml`), and building under it fails while prerendering with `TypeError: Cannot read properties of null (reading 'useState')` plus a flood of `unique "key" prop` warnings — symptoms of mixing React's development and production builds, not of any defect in the code. Verified against an untouched checkout: it fails there too. To reproduce a production build locally: `docker compose exec -e NODE_ENV=production client npm run build`.
* **The cookie banner ships rendered in the HTML and is hidden pre-paint by a blocking script.** Making it wait for hydration would put a large text block back on the LCP path. `bannerVisible` is therefore true while `consent === undefined` (the pre-read state) so the banner is part of the server render; the inline script that is deliberately the **first node of `<body>`** replicates `loadConsent()` — expiry included — and stamps `data-cookie-consent="set"` on `<html>`, which a rule in `globals.css` uses to drop the banner before it can be seen. `<html>` carries `suppressHydrationWarning` for exactly that attribute. Reopening the banner from the footer must **remove** the attribute (`openPreferences` does), or the CSS wins over any render. Script source and attribute live in `client/lib/cookieConsent.js` so the storage key cannot drift between the two readers.
* **Everything uploaded to the media bucket carries `Cache-Control: public, max-age=31536000, immutable`** (`MEDIA_CACHE_CONTROL` in `s3Service.js`), which is safe because no media key is ever reused: product basenames are UUIDs and author images carry a timestamp plus a random suffix. The homepage story videos are the exception that produced the PageSpeed finding — they are uploaded **by hand** into `stories/`, never pass through `uploadFile()`, and reached S3 with no header at all, so CloudFront cached them but every repeat visitor re-downloaded 1.8 MB. Backfill with `npm run s3:cache-headers -- --apply` (dry run by default, and the dry run does a real `HeadObject` per key precisely so it fails on a missing `s3:GetObject` instead of letting `--apply` be the first to find out), with the AWS CLI on the instance, or with a CloudFront Response Headers Policy. **The npm script lives inside the image** (`Dockerfile.prod` does `COPY . .`), so it does not exist on the instance until the next `./deploy/deploy.sh` — a restart is not enough. All three routes, and the mandatory CloudFront invalidation afterwards, are in `docs/cdn-cache.md`, along with the operational consequence — **replacing a story video means a new filename, never overwriting one**, since `immutable` puts the old copy beyond the reach of a CloudFront invalidation.
* **`/health` is liveness, `/health/ready` is readiness — they answer different questions.** `/health` returns 200 as soon as the process accepts requests and deliberately touches nothing: it drives the Docker healthcheck, whose only question is whether to restart the container, and restarting because Turso is down would just add a restart loop to a problem that lives elsewhere. `/health/ready` runs a `SELECT 1` with its own 4 s timeout and answers `503 degraded` when the database is unreachable — because a monitor pointed at `/health` would report a healthy site while the gallery cannot list a single artwork. It is exempt from the rate limiter (`req.path.startsWith('/health')`), never cached, and normalizes DB error messages so a public endpoint cannot leak hostnames. **Monitors must watch `/health/ready`, not `/health`.** See `docs/monitorizacion.md` for the three layers and what is still pending (external uptime monitor + CloudWatch alarms, both console-side).

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
* **Sendcloud:** SENDCLOUD_API_KEY, SENDCLOUD_API_SECRET (both serve OAuth2 *and* Basic), SENDCLOUD_AUTH_MODE (`auto` | `oauth2` | `basic`, default `auto`, invalid value fails startup), SENDCLOUD_WEBHOOK_SECRET, SENDCLOUD_ENABLED_ART (**must stay `false`** — art checkout reads the zones the calculator writes), SENDCLOUD_ENABLED_OTHERS, SENDCLOUD_AUTO_CONFIRM_DAYS, SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES. All server-side and delivered through `env_file: ./api/.env`; no compose `build.args` and no `NEXT_PUBLIC_*` counterpart except the two `NEXT_PUBLIC_SENDCLOUD_ENABLED_*` flags the navbar reads.
* **NTAG 424 DNA (CoA):** NTAG424_SYSTEM_ID, NTAG424_K_PICC, NTAG424_MASTER_KEY, IP_HASH_SALT — critical secrets validated via `requiredHex()`. Custody documented in `scripts/nfc-personalization/README.md §7`.
* **Captcha (Cloudflare Turnstile):** TURNSTILE_SECRET (api, optional — when empty the inquiry endpoint refuses with 503 CAPTCHA_UNAVAILABLE), NEXT_PUBLIC_TURNSTILE_SITE_KEY (client, optional — when empty the inquiry CTA on the art product page is hidden). Used by the art product inquiry form. Test keys ("always passes") are documented in `.env.example`.
* **Sentry:** SENTRY_TRACES_SAMPLE_RATE, SENTRY_PROFILES_SAMPLE_RATE, SENTRY_ENABLE_DEV (api); NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, NEXT_PUBLIC_SENTRY_ENABLE_DEV (client). See the "Sentry Error Reporting" section below.
* **Rate Limiting:** GENERAL_RATE_LIMIT_*, AUTH_RATE_LIMIT_*, COA_VERIFY_RATE_LIMIT_*, INQUIRY_RATE_LIMIT_*, etc. Note: `*_WINDOW_SECONDS` is multiplied by 60 in the limiter — values are effectively in MINUTES (legacy naming).

## Sentry Error Reporting (gated by environment)

Reporting is **off in development and absent in test**; staging and production report normally. Every issue this project ever received from `environment: development` was an artefact of the edit-save-reload cycle (Fast Refresh serving a half-applied module, nodemon restarting on a half-written file), never a reproducible defect — plus session replays of `localhost`. See `openspec/changes/sentry-noise-cleanup`.

**Two independent gates that must NOT be collapsed into one:**

* `NODE_ENV=test` → Sentry is **never imported**. Structural, not about noise: merely importing `@sentry/node` installs global require-hook instrumentation that survives Jest's per-file module registry and breaks unrelated suites. `enabled: false` is *not* sufficient — `init()` still installs the versioned global carrier (`globalThis.__SENTRY__`). Enforced by the `if (!isTest)` around the `require`/`init` in `api/instrument.js` and around `setupExpressErrorHandler` in `api/app.js`.
* `NODE_ENV=development` → imported and initialized, **transport muted** via `enabled: false`. The wiring (`setupExpressErrorHandler`, `onRequestError`, `onRouterTransitionStart`, the replay integration) stays identical across environments, so a broken wiring still surfaces locally and no "express is not instrumented" warning appears. `SENTRY_ENABLE_DEV=true` / `NEXT_PUBLIC_SENTRY_ENABLE_DEV=true` opts back in (fail-safe: only the literal `true`).

**Four init points, two criteria sources.** `api/instrument.js` (Express) and the three Next.js runtimes (`client/instrumentation-client.js`, `client/sentry.server.config.js`, `client/sentry.edge.config.js`, all reading `client/lib/sentryEnv.js`).

`instrument.js` reads `process.env` **directly** and does not require `config/env.js` — it loads on the first line of `app.js` so OpenTelemetry can patch `require` before anything else, and importing the env module would run the whole validation (including its `process.exit` paths) ahead of `Sentry.init()`. `config.sentry.enabled` mirrors the criterion for the rest of the app to read; the duplication is deliberate and `api/tests/sentryGating.test.js` asserts the two agree across the full environment matrix (it probes `instrument.js` in a **child process**, since requiring it inside a Jest worker is the exact thing the test gate prevents).

`NEXT_PUBLIC_SENTRY_ENABLE_DEV` is the one `NEXT_PUBLIC_*` var that deliberately **skips the four-place ritual** above: it only takes effect under `next dev`, where there is no build step and env vars are read at runtime, so wiring it into the production images would be dead code.

**Story videos in preproduction:** `GET /api/stories/videos` returns `200 {"videos":[]}` when `AWS_S3_BUCKET` is unset, instead of a 500. Staging is self-hosted with no AWS credentials **by decision**, the homepage video is decorative, and the client already falls back to an empty list — the 500 was 1414 Sentry events for a non-event. The guard is on `config.useS3` in `api/routes/storiesRoutes.js`, never a `try/catch` (which would collapse "not configured" back into "broken") and never in `s3Service.getClient()`, whose throw must stay loud for image uploads and database backups. A configured-but-unreachable bucket still returns 500 and still reports.

**In-app browser noise (Instagram/Facebook on Android):** `instrumentation-client.js` drops `Error invoking postMessage: …` (`ignoreErrors`) and anything whose stack lands in an injected `app://<name>` script (`denyUrls`). Meta injects its own telemetry (`navigation_performance_logger_android`) into every page opened from its in-app browser and talks to the native app over the WebView's JS↔Java bridge; when that bridge dies mid-page (`Java object is gone`) or its method throws, **their** script throws inside a listener we never registered, and Sentry attributes it to whatever page hosted it. Nothing of ours is on the failing stack and nothing user-visible breaks. **The `(?!\/)` in the `denyUrls` regex is load-bearing:** the Sentry Next.js SDK rewrites our own frames to `app:///_next/…` (three slashes) while the injected scripts live at `app://<name>` (two) — without the lookahead the pattern would discard every event the application produces.
* **Business / VAT (per-seller):** VAT rates are per-seller columns on `users`: `tax_vat_art` (default 10) and `tax_vat_other` (default 21), whole percentages, editable by the admin (same pattern as `dealer_commission_*`). The fiscal regime of an art sale is **derived** from `tax_vat_art` via `api/utils/vatRegime.js`: `10 → 'art_rebu'`, any other value (e.g. 21 = cooperativa) `→ 'standard_vat'`. `other` products and events are always `standard_vat`. The regime is **snapshotted per item** in `art_order_items.vat_regime` at sale time (checkout, auction billing, draw billing) — changing a seller's rate only affects future sales; reads use `COALESCE(vat_regime, 'art_rebu')`. Wallet crediting/debiting, payouts, buyer invoices (Serie A REBU / Serie P standard) and the fiscal export all key off the item's snapshot, not its table. `TAX_VAT_ES` (env) is **legacy-only**: it survives solely for Revolut line item metadata (`ordersController.placeOrder`); `TAX_VAT_ART_ES` and the `NEXT_PUBLIC_TAX_VAT_*` build vars have been removed.

### Adding a new `NEXT_PUBLIC_*` variable

`NEXT_PUBLIC_*` vars are embedded into the JS bundle at build time, so they must be present as ENV variables *during* `npm run build`. To add one, touch all FOUR places — missing any of them silently ships an empty value to production:

1. `/.env.example` (repo root) — the source list read by docker-compose; also add it to local `/.env`.
2. `client/.env.example` — the per-app reference for devs running Next.js outside Docker.
3. `client/Dockerfile.staging` AND `client/Dockerfile.prod` — add an `ARG` line in the build-args block AND a matching `ENV NAME=$NAME` line before `RUN npm run build`. The local `client/Dockerfile` does NOT need it (dev mode reads env vars at runtime).
4. `docker-compose.prod.yml` AND `docker-compose.pre2.yml` (staging) — add `- NEXT_PUBLIC_FOO=${NEXT_PUBLIC_FOO}` inside the client service's `build.args:` block.

## Plausible Analytics (self-hosted, production only)

Audience measurement for `140d.art`, served by **our own Plausible Community Edition v3.2.1 instance** at `https://analytics.140d.art` — not Plausible Cloud, which is what commit `e2516b3` removed. The instance runs on the Mac mini M1 under OrbStack, on the same external `proxy-network` that Nginx Proxy Manager and the Kuadrat staging containers already share, so NPM reaches it as `http://plausible:8000` with no host port. **Full from-scratch installation and disaster-recovery guide: `docs/plausible-analytics.md`** — it carries the ordered procedure, the four silent failure modes and a symptom→cause table. See also `openspec/changes/plausible-self-hosted-analytics` for the decisions and their rationale.

* **Two `<Script>` tags in `client/app/layout.js`, gated on `IS_PROD` alone** (`client/lib/env.js`). The gate is the one `fix-analytics-env-gate` built and is unchanged: `NODE_ENV` cannot express it, because `next build` forces `NODE_ENV=production` and inlines it, so preprod and prod look identical to the compiler. `NEXT_PUBLIC_APP_ENV=preprod` is what suppresses analytics in preproduction, and it is **build-time** — a wrong value leaks on the next *rebuild*, never on a restart.
* **The tracker URL is a literal and must stay one.** `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js`. A `NEXT_PUBLIC_*` variable would buy nothing: the value is embedded at build time, so changing it requires exactly the same client rebuild as changing the literal, while adding the four-place wiring ritual. **Known cost:** the id is issued by our instance for the site `140d.art`; recreating the instance from scratch mints a new one and this tag starts 404ing with no error anywhere.
* **The CSP needs `https://analytics.140d.art` in BOTH `script-src` and `connect-src`, and neither is sufficient alone.** `script-src` permits fetching the tracker; `connect-src` permits the `POST` of every event to `/api/event` on the same origin. With only the first, the page loads, the script runs, and **not one event is recorded** — the sole evidence being a CSP violation in the visitor's console. Same failure the Meta Pixel comment documents two lines above in the same array. `grep -c "analytics.140d.art" client/next.config.js` must return `2`.
* **It loads without cookie consent, deliberately, and the policy says so.** The tracker writes no cookie and no persistent identifier to the terminal equipment, so art. 22.2 LSSI does not apply. Gating it on `adsAllowed` would discard every visitor choosing «Solo las necesarias» — the exact cost that picking a cookieless analytics avoids. `CookieConsentContext`, `CookieBanner` and `CONSENT_BOOTSTRAP_SCRIPT` are untouched; the disclosure lives in `client/app/legal/politica-de-cookies/page.js`, which also had to stop claiming it used analytics cookies it never set.
* **The init stub is not decoration.** The `beforeInteractive` queue shim lets `window.plausible('EventName')` be called from anywhere without first checking that the external script loaded. Plausible's own install screen omits it because it is unnecessary for pageviews; without it any future custom event fired in that window is lost *intermittently*, which is a latency-dependent bug that never reproduces locally.
* **`analytics.140d.art` is terminated on the production EC2 and reverse-proxied to the M1 — and that hop is the only thing making the data real.** On macOS, OrbStack's published-port path (like Docker Desktop's) runs through a userspace proxy that **replaces the source address**: every request reached NPM as `192.168.97.1`, the Docker `proxy-network` gateway, including requests issued from the EC2's public IP. It is architectural, `network_mode: host` does not avoid it (orbstack/orbstack#1727), and no NPM setting recovers an address that never arrives. Since Plausible identifies visitors as `hash(daily_salt, IP, User-Agent, domain)`, the result was visitors deduplicated **by User-Agent alone** and permanently empty geolocation — false data, not imprecise data. The sixth server block of `deploy/nginx/140d.art.conf` writes `X-Forwarded-For: $remote_addr` from a host that does see the client, and Plausible's leftmost-wins rule makes OrbStack's appended address harmless. **One hostname serves both the dashboard and ingestion, and cannot be split:** the endpoint is baked into the generated script as `BASE_URL/api/event`, and `BASE_URL` also governs the dashboard URL and the WebSocket CSWSH check. **Timeouts are split by route:** 5 s on `/api/event`, 3600 s on `/live/websocket`, or the dashboard's LiveView socket dies every five seconds.
* **`X-Forwarded-For` is load-bearing and fails silently.** `PlausibleWeb.RemoteIP.get/1` is not the `RemoteIp` library: it reads `x-plausible-ip` → `cf-connecting-ip` → `b-forwarded-for` → `x-forwarded-for` (taking the **leftmost** value, with no trusted-proxy logic) → peer address. NPM actually uses `$proxy_add_x_forwarded_for`, which **prepends** whatever the client sent — combined with leftmost-wins and no trusted-proxy logic, that let any visitor forge their country (verified: a request carrying `X-Forwarded-For: 1.1.1.1` was recorded as Australia). The EC2 block closes it by using `$remote_addr`, which overwrites. Leave NPM's Advanced tab empty; the authority is the EC2, not NPM. If the header ever stops arriving, every visitor hashes to the same identity and collapses into one, with numbers that still look believable. `X-Plausible-IP: 8.8.8.8` on a test event isolates geolocation from IP delivery in one request.
* **ClickHouse's floor is not zero, and undershooting it loses events while the API still answers `ok`.** The instance caps `max_server_memory_usage` in `clickhouse/kuadrat-tuning.xml` (on the M1, outside this repo). The first value tried, 700 MB, was **below what ClickHouse 24.12 tracks at rest on an empty database** — ~666 MiB, being 334 MiB RSS plus caches and, under cgroup v2, page cache. Every write-buffer flush then died with `Code: 241 MEMORY_LIMIT_EXCEEDED`, the `Plausible.Event.WriteBuffer` GenServer crashed on each tick, and `POST /api/event` kept returning `ok` because acceptance happens before persistence: events were taken and then lost between the buffer and the table. Now 1.1 GB, with the container at 1536M. **The cgroup limit must sit comfortably above the ClickHouse tracker limit**, so ClickHouse rejects a query (recoverable) instead of the kernel killing the process (not). Unlike the `X-Forwarded-For` failure, this one is loud — it is in `docker compose logs plausible` with the exact byte counts.
* **Known blind spot: a production site measured from a residential connection.** If the M1 is off, the ISP rotates the IP or DynDNS has not propagated, the tracker simply fails to load. Nothing visitor-facing breaks (it is `afterInteractive` and async) and **Sentry sees nothing** — a third-party script failing to load is not an exception in application code, same category error as the load-test finding. Data is lost silently. The residential IP is no longer public — visitors resolve the name to the EC2 — but blockers still are not addressed, since the hostname is still `analytics.`; true first-party would require moving `BASE_URL` onto the site's own origin, which moves the dashboard with it.

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

## Admin access to Live events (`event_attendees.is_staff`)

`POST /api/events/:id/admin-access` (JWT, `role === 'admin'`) find-or-creates a **real attendee row** for the admin and returns the same `{ attendeeId, accessToken }` the registration modal produces — no registration, no OTP, no payment.

* **A real row, not a bypass in `getViewerToken`.** That identity is re-derived by `getViewerToken`, `renewToken`, `getWhiteboardToken`, `uploadWhiteboardImage`, `getVideoToken`, `report-spam` and the authenticated Socket.IO room. Special-casing the admin in each would be seven places that must agree.
* **`status` stays `'registered'`, never `'paid'` with `amount_paid = 0`** — a paid state matching no payment is a lie in a table the invoicing and payout queries read. The exemption lives in `requiresPayment(event, attendee)` in `eventController.js`, the single predicate behind all five payment gates.
* **The admin is a participant, not a host.** `subscriber` in Agora broadcast, `publisher` in meeting mode (like everyone there), never `HOST_UID`. `getHostToken` still requires `req.user.id === event.host_user_id`.
* **`is_staff = 1` is excluded from five queries**, and a sixth refuses outright: `getAttendeeCount` (public figure), `eventCreditScheduler.loadUncreditedAttendees` (host wallet), the payout detail in `stripeConnectPayoutsController`, the seller revenue listing in `sellerRoutes`, and `invoiceService.generateEventAttendeeInvoice` (a 0 € invoice would burn a number from series P, and invoice numbers are not recycled). **`listAttendees` deliberately does NOT filter** — the admin panel should show who was in the room. Any new query over `event_attendees` has to make this choice consciously.
* **Known ceiling:** in Agora `meeting` mode the admin consumes one of the 16 slots. That limit is the vendor's and `is_staff` does not dodge it.

## Certificates of Authenticity (NTAG 424 DNA)

Each artwork ships with a paper Certificate of Authenticity carrying a NTAG 424 DNA sticker. A tap with any phone resolves to a unique-per-read URL that the backend verifies cryptographically (PICC encrypted + truncated CMAC, SDM mode), proving authenticity and protecting against replay.

* **Public endpoint:** `GET /api/coa/verify?picc=<32hex>&cmac=<16hex>` → `{ status: ok | malformed | invalid_cmac | unknown_tag | revoked | replay }`. No auth, dedicated rate limit (`coaVerifyLimiter`).
* **Admin endpoints:** `GET /api/admin/coa/tags` (paginated list), `GET /api/admin/coa/tags/:uid` (detail + last N `verification_events`), `PATCH /api/admin/coa/tags/:uid/status` (revoke / lost / damaged with audit notes).
* **Public page:** `client/app/coa/page.js` (Server Component, `force-dynamic`). Calls the backend via `INTERNAL_API_URL` and renders success or failure with es-ES messages from `client/lib/constants.js`.
* **Tables:** `nfc_tags` (one row per **physical sticker**, FK to `art` with `ON DELETE RESTRICT`) and `verification_events` (audit log of every tap, including failed attempts; IPs stored as HMAC-SHA256).
* **Limited editions:** an artwork with `edition_size > 1` gets one sticker (one `nfc_tags` row) per copy, all sharing `art_id` — the schema always allowed it (PK is `uid`; `art_id` is not unique). `nfc_tags.edition_number` holds the copy number (NULL for unique works) and `serial_label` becomes `GAL-<year>-<artId>-<n>/<N>`. The paper certificate is a single shared design ("Edición limitada de N ejemplares") that the artist numbers by hand; the operator records the same number when personalizing. Each sticker keeps its own derived keys, anti-replay counter and `status`, so copies are revocable one by one. `/coa` shows "Edición Limitada. Ejemplar n de N".
* **Personalization scripts:** `scripts/nfc-personalization/` — separate Node.js subproject, ESM, **runs OUTSIDE Docker** (needs USB access to the ACR1552U reader). Uses the `ntag424` library (AGPL, internal use only) for the NTAG protocol; uses the same key derivation as the backend (`AES-CMAC(MASTER_KEY, label||UID||SYSTEM_ID)`). The "one active tag per artwork" guard is enforced there (not in the DB): it allows up to `edition_size` active tags and rejects a duplicate copy number.
* **Reference:** `docs/guia_ntag424_galeria.md` for the deep technical context.
