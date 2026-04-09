## ADDED Requirements

### Requirement: Stripe Connect environment configuration

The system SHALL expose Stripe Connect configuration via four new environment variables, all parsed and validated through the centralized `api/config/env.js` module under `config.stripe.connect`.

#### Environment variables

| Variable | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `STRIPE_CONNECT_ENABLED` | boolean | no | `false` | Master switch. When `false`, all Stripe Connect endpoints SHALL respond with `503 Service Unavailable` and the service SHALL NOT make any API calls to Stripe. |
| `STRIPE_CONNECT_REFRESH_URL` | string (URL) | no | `https://pre.140d.art/seller/stripe-connect/refresh` | Public URL where Stripe redirects the artist if an account onboarding link expires before completion. |
| `STRIPE_CONNECT_RETURN_URL` | string (URL) | no | `https://pre.140d.art/seller/stripe-connect/return` | Public URL where Stripe redirects the artist after the artist completes the hosted onboarding form. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | string | conditional | `''` | Signing secret used to validate the Stripe Connect webhook payload. Required when `STRIPE_CONNECT_ENABLED=true`; if empty in that case, the webhook handler SHALL log a warning and respond `200` without processing events. |

This secret SHALL be **distinct** from the existing `STRIPE_WEBHOOK_SECRET` (which validates `payment_intent.*` events), because the Connect webhook is configured as a separate endpoint in the Stripe Dashboard with `Thin` payload type.

#### Scenario: Stripe Connect disabled
- **GIVEN** `STRIPE_CONNECT_ENABLED=false`
- **WHEN** any admin or seller endpoint under `/api/admin/sellers/:id/stripe-connect/*` or `/api/seller/stripe-connect/*` is called
- **THEN** the response SHALL be `503 Service Unavailable` with body `{ error: 'Stripe Connect is not enabled in this environment' }`
- **AND** no call SHALL be made to the Stripe API

#### Scenario: Stripe Connect enabled but webhook secret missing
- **GIVEN** `STRIPE_CONNECT_ENABLED=true`
- **AND** `STRIPE_CONNECT_WEBHOOK_SECRET` is empty
- **WHEN** the webhook endpoint receives an event
- **THEN** the system SHALL log a warning `[stripe-connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not configured; ignoring event`
- **AND** SHALL respond `200 OK` without processing the event
- **AND** SHALL NOT crash or surface the misconfiguration to the caller

---

### Requirement: User table schema additions for Stripe Connect

The `users` table SHALL include the following new columns to track the lifecycle of the artist's connected account in Stripe and to capture fiscal data needed for invoicing.

#### Schema additions to `users`

```sql
-- Stripe Connect lifecycle
stripe_connect_account_id TEXT UNIQUE,
stripe_connect_status TEXT
  CHECK(stripe_connect_status IN ('not_started','pending','active','restricted','rejected'))
  NOT NULL DEFAULT 'not_started',
stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0,
stripe_connect_requirements_due TEXT,
stripe_connect_last_synced_at DATETIME,

-- Datos fiscales del artista (preparados para Changes #2 y #4)
tax_status TEXT CHECK(tax_status IN ('particular','autonomo','sociedad')),
tax_id TEXT,
fiscal_full_name TEXT,
fiscal_address_line1 TEXT,
fiscal_address_line2 TEXT,
fiscal_address_city TEXT,
fiscal_address_postal_code TEXT,
fiscal_address_province TEXT,
fiscal_address_country TEXT NOT NULL DEFAULT 'ES',
irpf_retention_rate REAL,
autofactura_agreement_signed_at DATETIME
```

#### Column semantics

| Column | Semantics |
|---|---|
| `stripe_connect_account_id` | The Stripe account ID (`acct_...`) for the artist's connected account. NULL until the admin creates the account. UNIQUE — no two users can share an account. |
| `stripe_connect_status` | Local enum reflecting the artist's onboarding state. Mapped from Stripe's account state on each sync. See "Account status mapping" requirement below. |
| `stripe_transfers_capability_active` | Boolean (0/1). `1` IFF `account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'`. This is the canonical "ready to receive transfers" flag and SHALL be checked before creating any transfer in Change #2. |
| `stripe_connect_requirements_due` | JSON string. Snapshot of `account.requirements.summary.minimum_deadline.currently_due[]` from the last sync. Used to display a human-readable list to the admin and the seller. |
| `stripe_connect_last_synced_at` | Timestamp of the last successful sync (manual or webhook-triggered). |
| `tax_status` | One of `'particular'`, `'autonomo'`, `'sociedad'`. NULL until the admin captures the data. Required before creating a connected account. |
| `tax_id` | Spanish DNI, NIE, or CIF. Validated by regex on input (see "Fiscal data validation" requirement). NULL until captured. |
| `fiscal_full_name` | Legal name of the fiscal entity (individual full name or company legal name). |
| `fiscal_address_line1`, `fiscal_address_line2`, `fiscal_address_city`, `fiscal_address_postal_code`, `fiscal_address_province` | Spanish postal address fields. `line2` is optional. |
| `fiscal_address_country` | ISO 3166-1 alpha-2 code. Defaults to `'ES'`. In v1, hard-coded to ES; future expansion may allow other countries. |
| `irpf_retention_rate` | NULLable REAL. Captured for future use; **NOT applied** to any calculations in this change or in Change #2. The UI tooltip SHALL clarify "out of scope v1". |
| `autofactura_agreement_signed_at` | Timestamp when the artist signed the autofacturación agreement (art. 5 Reglamento de Facturación). NULLable. Set when the admin checks the agreement checkbox; cleared if the admin unchecks it. |

#### Scenario: Defaults on new user creation
- **GIVEN** a new row is inserted into `users` (any role)
- **THEN** `stripe_connect_status` SHALL default to `'not_started'`
- **AND** `stripe_transfers_capability_active` SHALL default to `0`
- **AND** `fiscal_address_country` SHALL default to `'ES'`
- **AND** all other Stripe Connect and fiscal columns SHALL default to NULL

#### Scenario: UNIQUE constraint on stripe_connect_account_id
- **GIVEN** user A has `stripe_connect_account_id = 'acct_xyz'`
- **WHEN** the system attempts to insert user B with the same `'acct_xyz'`
- **THEN** the database SHALL reject the insert with a UNIQUE constraint violation

---

### Requirement: stripe_connect_events table for webhook idempotency and audit log

A new table `stripe_connect_events` SHALL be created to persist every Stripe Connect webhook event received, providing both an idempotency guard (so the same event is never processed twice) and a diagnostic audit log.

#### Schema

```sql
CREATE TABLE IF NOT EXISTS stripe_connect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT UNIQUE NOT NULL,
  stripe_event_type TEXT NOT NULL,
  account_id TEXT,
  payload_json TEXT NOT NULL,
  processed_at DATETIME,
  processing_error TEXT,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account ON stripe_connect_events(account_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type ON stripe_connect_events(stripe_event_type);
```

#### Column semantics

| Column | Semantics |
|---|---|
| `stripe_event_id` | The `evt_...` ID from Stripe. UNIQUE — the second insert attempt for the same event ID SHALL be rejected, providing idempotency. |
| `stripe_event_type` | The event type string (e.g., `'v2.core.account[requirements].updated'`). |
| `account_id` | The Stripe account ID (`acct_...`) referenced by the event, extracted from `thinEvent.related_object.id`. NULL if the event has no related account. |
| `payload_json` | The full JSON payload of the resolved event (after `events.retrieve` if applicable). Stored as text for diagnostic purposes. |
| `processed_at` | NULL until the event is successfully handled. Set to `CURRENT_TIMESTAMP` after the handler completes. |
| `processing_error` | NULL on success. Populated with the error stack trace if the handler throws. |
| `received_at` | Timestamp when the webhook was received by the API. |

#### Scenario: First receipt of an event
- **GIVEN** a webhook event with `stripe_event_id = 'evt_abc'` arrives at `/api/stripe/connect/webhook`
- **WHEN** the controller inserts the row
- **THEN** the row SHALL be created with `processed_at = NULL` and `processing_error = NULL`
- **AND** the dispatcher SHALL invoke the handler for the event type
- **AND** upon successful handler completion, `processed_at` SHALL be set to `CURRENT_TIMESTAMP`

#### Scenario: Duplicate event delivery (idempotency)
- **GIVEN** a row with `stripe_event_id = 'evt_abc'` already exists in `stripe_connect_events`
- **WHEN** Stripe re-delivers the same event (manual resend or automatic retry)
- **THEN** the controller SHALL attempt the insert with `INSERT OR IGNORE`
- **AND** the second insert SHALL be a no-op
- **AND** the controller SHALL log `[stripe-connect-webhook] duplicate event ignored: evt_abc`
- **AND** the controller SHALL respond `200 OK` to Stripe
- **AND** the handler SHALL NOT be invoked a second time

#### Scenario: Handler throws during processing
- **GIVEN** the handler for `v2.core.account[requirements].updated` throws an exception
- **WHEN** the dispatcher catches the error
- **THEN** the row SHALL be updated with `processing_error = <stack trace>`
- **AND** `processed_at` SHALL remain NULL
- **AND** the controller SHALL respond `500 Internal Server Error` so Stripe will retry the event later
- **AND** the error SHALL be logged via `logger.error`

---

### Requirement: stripeConnectService — connected account creation (V2 API)

A new service module `api/services/stripeConnectService.js` SHALL provide the function `createConnectedAccount({ user })` that creates a new connected account in Stripe using the **V2 API only**.

#### API call shape

```javascript
const account = await stripeClient.v2.core.accounts.create({
  display_name: user.full_name || user.email,
  contact_email: user.email,
  identity: { country: 'es' },
  dashboard: 'express',
  defaults: {
    responsibilities: {
      fees_collector: 'application',
      losses_collector: 'application',
    },
  },
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { requested: true },
        },
      },
    },
  },
}, {
  idempotencyKey: `account_create_user_${user.id}_v1`,
});
```

#### Forbidden parameters

The function SHALL NEVER pass any of the following to `accounts.create`:

- `type: 'express'`, `type: 'standard'`, `type: 'custom'`, or any top-level `type` parameter at all (these would invoke the legacy V1 API).
- `configuration.merchant` or `configuration.storer` (only `configuration.recipient` is allowed in this change).
- `country` at the top level (use `identity.country` instead).
- Any value other than `'es'` for `identity.country`.

The Stripe documentation that the user provided (`docs/stripe_connect/interactive_platform_guide.md`) explicitly states: *"Only use the above properties when creating accounts. Never pass type at the top level. Do not use top level type: 'express' or type: 'standard' or type 'custom'."*

#### Idempotency

The `idempotencyKey` `account_create_user_${userId}_v1` SHALL be passed on every call. The `_v1` suffix allows future deliberate recreations (e.g., if a previous account was rejected) by bumping to `_v2` in code.

#### Scenario: Successful account creation
- **GIVEN** Stripe Connect is enabled
- **AND** the user has fiscal data filled (pre-check at controller level)
- **WHEN** `createConnectedAccount({ user })` is called
- **THEN** the function SHALL invoke `stripeClient.v2.core.accounts.create` with the exact shape above
- **AND** SHALL return the resulting `account` object (not persist it — that is the caller's responsibility)

#### Scenario: Stripe rejects the call
- **GIVEN** the Stripe API returns a `StripeInvalidRequestError`
- **WHEN** the service catches the error
- **THEN** it SHALL throw an `ApiError(502, 'Stripe API error: <message>')` with the original Stripe error code attached as `cause`
- **AND** SHALL log the error with full context

#### Scenario: Idempotent retry after network failure
- **GIVEN** the first call to `accounts.create` succeeds in Stripe but the response is lost due to a network error before reaching the service
- **WHEN** the service is called again with the same `userId`
- **THEN** Stripe SHALL recognize the same `idempotencyKey` and return the **same** account object
- **AND** no second account SHALL be created in Stripe

---

### Requirement: stripeConnectService — onboarding link generation (V2 API)

The service SHALL provide `createOnboardingLink({ stripeAccountId })` that generates a hosted account link via the V2 API.

#### API call shape

```javascript
const link = await stripeClient.v2.core.accountLinks.create({
  account: stripeAccountId,
  use_case: {
    type: 'account_onboarding',
    account_onboarding: {
      configurations: ['recipient'],
      refresh_url: `${config.stripe.connect.refreshUrl}?account=${stripeAccountId}`,
      return_url: `${config.stripe.connect.returnUrl}?account=${stripeAccountId}`,
    },
  },
});
```

The function SHALL return `{ url: link.url, expires_at: link.expires_at }`. It SHALL NOT persist the link in the database — links are ephemeral and Stripe expires them after a short time.

#### Scenario: Successful link generation
- **GIVEN** a connected account exists in Stripe with ID `acct_xyz`
- **WHEN** `createOnboardingLink({ stripeAccountId: 'acct_xyz' })` is called
- **THEN** the function SHALL invoke `v2.core.accountLinks.create` with the shape above
- **AND** SHALL return `{ url, expires_at }`

#### Scenario: Stripe account does not exist
- **GIVEN** the `stripeAccountId` does not correspond to any account in Stripe
- **WHEN** the service is called
- **THEN** Stripe SHALL throw an error
- **AND** the service SHALL re-throw as `ApiError(404, 'Stripe connected account not found: <accountId>')`

---

### Requirement: stripeConnectService — account retrieval and status sync

The service SHALL provide:

- `retrieveAccount(stripeAccountId)` — returns the full account object from Stripe via:
  ```javascript
  stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
    include: ['configuration.recipient', 'requirements'],
  });
  ```

- `mapAccountToLocalStatus(account)` — pure function (no DB, no IO) that maps a Stripe account object to a local status descriptor:
  ```javascript
  {
    status: 'pending' | 'active' | 'restricted' | 'rejected',
    transfers_capability_active: boolean,
    requirements_due: string[],
  }
  ```

- `syncAccountStatus({ user, account = null })` — orchestrates retrieve + map + DB update.

#### Account status mapping

| Condition (in priority order) | Resulting `status` |
|---|---|
| `account` reflects an explicit rejection by Stripe (e.g., `requirements.disabled_reason === 'rejected.fraud'` or similar rejected state) | `'rejected'` |
| `account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'` | `'active'` |
| `account.requirements.summary.minimum_deadline.status === 'currently_due'` and there are no past_due items | `'pending'` |
| `account.requirements.summary.minimum_deadline.status === 'past_due'` or `'errored'` | `'restricted'` |
| Anything else (account exists but transfers capability not yet requested fully) | `'pending'` (default fallback) |

The `transfers_capability_active` flag SHALL be `true` IFF `stripe_transfers.status === 'active'`.

The `requirements_due` array SHALL be the contents of `account.requirements.summary.minimum_deadline.currently_due` (or empty array if not present).

#### Scenario: Sync of an account that just completed onboarding
- **GIVEN** the user has `stripe_connect_status='pending'` in BD
- **AND** the artist just completed the hosted onboarding
- **AND** Stripe has marked the transfers capability as `active`
- **WHEN** `syncAccountStatus({ user })` is called
- **THEN** the service SHALL call `retrieveAccount(user.stripe_connect_account_id)`
- **AND** SHALL map the account to `{ status: 'active', transfers_capability_active: true, requirements_due: [] }`
- **AND** SHALL execute `UPDATE users SET stripe_connect_status='active', stripe_transfers_capability_active=1, stripe_connect_requirements_due='[]', stripe_connect_last_synced_at=CURRENT_TIMESTAMP WHERE id=?`
- **AND** SHALL log `[stripe-connect] account status synced: userId=<id>, oldStatus=pending, newStatus=active`

#### Scenario: Sync of a user without a connected account
- **GIVEN** the user has `stripe_connect_account_id IS NULL`
- **WHEN** `syncAccountStatus({ user })` is called
- **THEN** the function SHALL return early with `{ status: 'not_started' }`
- **AND** SHALL NOT make any API call to Stripe
- **AND** SHALL NOT execute any database update

---

### Requirement: Admin endpoints for managing connected accounts

The system SHALL expose the following HTTP endpoints under `/api/admin/sellers/:id/stripe-connect/*`. All admin endpoints SHALL be protected by the existing `authenticate` + `adminAuth` middleware chain.

#### POST /api/admin/sellers/:id/stripe-connect/create

Creates a new connected account for the given seller.

**Pre-conditions** (all enforced before calling Stripe):
1. The user SHALL exist and have `role = 'seller'`. Otherwise `404 Seller not found`.
2. The user's fiscal data SHALL be complete: `tax_status`, `tax_id`, `fiscal_full_name`, `fiscal_address_line1`, `fiscal_address_postal_code`, `fiscal_address_city`, `fiscal_address_province` all NOT NULL. Otherwise `400 Fiscal data must be filled before creating the connected account`.
3. If `users.stripe_connect_account_id IS NOT NULL`, the endpoint SHALL return early with `200 OK { stripe_connect_account_id, stripe_connect_status, already_existed: true }` without calling Stripe.

**Successful flow:**
1. Call `stripeConnectService.createConnectedAccount({ user })`.
2. `UPDATE users SET stripe_connect_account_id = ?, stripe_connect_status = 'pending' WHERE id = ?`.
3. Call `syncAccountStatus({ user, account })` to populate the rest of the columns.
4. Respond `201 Created { stripe_connect_account_id, stripe_connect_status }`.

#### Scenario: Successful creation
- **GIVEN** a seller with complete fiscal data and no existing `stripe_connect_account_id`
- **WHEN** the admin calls `POST /api/admin/sellers/42/stripe-connect/create`
- **THEN** the response SHALL be `201` with `{ stripe_connect_account_id: 'acct_...', stripe_connect_status: 'pending' }`
- **AND** the database SHALL reflect the new `stripe_connect_account_id` and `stripe_connect_status='pending'`
- **AND** subsequent fields (`stripe_transfers_capability_active`, `stripe_connect_requirements_due`) SHALL be populated by the sync

#### Scenario: Missing fiscal data blocks creation
- **GIVEN** a seller with `tax_status IS NULL`
- **WHEN** the admin calls `POST /api/admin/sellers/42/stripe-connect/create`
- **THEN** the response SHALL be `400` with body `{ error: 'Fiscal data must be filled before creating the connected account' }`
- **AND** no call SHALL be made to Stripe
- **AND** no row in the database SHALL be modified

#### Scenario: Idempotent re-creation
- **GIVEN** a seller already has `stripe_connect_account_id = 'acct_xyz'`
- **WHEN** the admin calls `POST /api/admin/sellers/42/stripe-connect/create` again
- **THEN** the response SHALL be `200` with `{ stripe_connect_account_id: 'acct_xyz', stripe_connect_status: <current>, already_existed: true }`
- **AND** no call SHALL be made to Stripe (early return at controller level)

#### POST /api/admin/sellers/:id/stripe-connect/onboarding-link

Generates a hosted onboarding link for the seller.

**Pre-conditions:**
1. The user SHALL exist and SHALL have `stripe_connect_account_id IS NOT NULL`. Otherwise `409 Connected account must be created first`.

**Flow:**
1. Call `stripeConnectService.createOnboardingLink({ stripeAccountId: seller.stripe_connect_account_id })`.
2. Respond `200 OK { url, expires_at }`.

#### Scenario: Generating a link
- **GIVEN** a seller with `stripe_connect_account_id = 'acct_xyz'`
- **WHEN** the admin calls `POST /api/admin/sellers/42/stripe-connect/onboarding-link`
- **THEN** the response SHALL be `200` with `{ url: 'https://connect.stripe.com/...', expires_at: 1719..., }`
- **AND** the URL SHALL include the configured `refresh_url` and `return_url` query parameters

#### POST /api/admin/sellers/:id/stripe-connect/onboarding-link/email

Generates a link AND sends it by email to the seller.

#### Scenario: Sending the link by email
- **GIVEN** a seller with `stripe_connect_account_id = 'acct_xyz'` and `email = 'artista@example.com'`
- **WHEN** the admin calls `POST /api/admin/sellers/42/stripe-connect/onboarding-link/email`
- **THEN** the system SHALL generate the link via the service
- **AND** SHALL invoke `emailService.sendSellerOnboardingLink({ seller, url })`
- **AND** SHALL respond `200 OK { sent: true, expires_at }`
- **AND** the email SHALL use **`140d Galería de Arte`** as the brand name (NOT `Kuadrat`)

#### GET /api/admin/sellers/:id/stripe-connect/status

Forces a sync against Stripe and returns the updated status.

**Flow:**
1. Validate seller exists and has `stripe_connect_account_id`.
2. Call `syncAccountStatus({ user: seller })`.
3. Re-read the seller from BD.
4. Respond with `{ stripe_connect_status, stripe_transfers_capability_active, stripe_connect_requirements_due, stripe_connect_last_synced_at }`.

#### Scenario: Manual status sync
- **GIVEN** a seller with `stripe_connect_status='pending'` whose Stripe account has just become `active`
- **WHEN** the admin pulses "Sincronizar estado" → `GET /api/admin/sellers/42/stripe-connect/status`
- **THEN** the system SHALL call `accounts.retrieve` against Stripe
- **AND** SHALL update the BD with the new status
- **AND** SHALL respond with the updated state including `stripe_connect_status: 'active'`

---

### Requirement: Seller endpoints for managing own connected account

The system SHALL expose the following HTTP endpoints for the seller themselves, protected by `authenticate` middleware (the seller can only operate on their own account, never another's).

#### POST /api/seller/stripe-connect/onboarding-link

Generates a hosted onboarding link for the authenticated seller.

**Pre-conditions:**
1. `req.user.role === 'seller'`. Otherwise `403 Forbidden`.
2. `req.user.stripe_connect_account_id IS NOT NULL`. Otherwise `409 Your account is not yet set up. Contact 140d Galería de Arte.`

**Flow:** identical to the admin variant but operates on `req.user.id` instead of `req.params.id`.

#### Scenario: Seller continuing onboarding
- **GIVEN** an authenticated seller with `stripe_connect_account_id = 'acct_xyz'` and `stripe_connect_status = 'pending'`
- **WHEN** they call `POST /api/seller/stripe-connect/onboarding-link`
- **THEN** the response SHALL be `200 OK` with the URL
- **AND** the seller frontend can redirect to that URL

#### Scenario: Seller without account attempts to onboard
- **GIVEN** an authenticated seller with `stripe_connect_account_id IS NULL`
- **WHEN** they call `POST /api/seller/stripe-connect/onboarding-link`
- **THEN** the response SHALL be `409` with body `{ error: 'Your account is not yet set up. Contact 140d Galería de Arte.' }`

#### GET /api/seller/stripe-connect/status

Returns the seller's current Stripe Connect status from the database. **Does NOT** force a sync (unlike the admin endpoint), to avoid latency and rate limits when the seller refreshes their dashboard.

**Flow:**
1. Read `req.user` (already loaded by `authenticate`).
2. Respond with `{ stripe_connect_status, stripe_transfers_capability_active, stripe_connect_requirements_due, stripe_connect_last_synced_at }`.

---

### Requirement: Connect webhook endpoint with thin event parsing

The system SHALL expose `POST /api/stripe/connect/webhook` to receive Stripe Connect events. The endpoint SHALL be:

- **Public** (no auth middleware).
- **Mounted before** the global `express.json()` middleware so that `express.raw({ type: 'application/json' })` can capture the raw body.
- **Distinct** from the existing `/api/stripe/webhook` endpoint (which handles `payment_intent.*` snapshot events).

#### Webhook configuration in Stripe Dashboard

The endpoint SHALL be configured in the Stripe Dashboard with:
- **Events from:** `Connected accounts`
- **Payload style:** **`Thin`** (CRITICAL — snapshot mode is incompatible with the V2 event types)
- **Events:**
  - `v2.core.account[requirements].updated`
  - `v2.core.account[configuration.recipient].capability_status_updated`

#### Parsing flow

```javascript
const sig = req.headers['stripe-signature'];
const thinEvent = stripeClient.parseThinEvent(
  req.body,                                  // raw Buffer
  sig,
  config.stripe.connect.webhookSecret
);

// thinEvent has shape: { id, type, related_object: { type, id } }

// Persist for idempotency + audit
const inserted = await db.execute({
  sql: `INSERT OR IGNORE INTO stripe_connect_events
        (stripe_event_id, stripe_event_type, account_id, payload_json)
        VALUES (?, ?, ?, ?)`,
  args: [thinEvent.id, thinEvent.type, thinEvent.related_object?.id || null, JSON.stringify(thinEvent)],
});

if (inserted.rowsAffected === 0) {
  // Already processed (or in flight)
  logger.info({ eventId: thinEvent.id }, '[stripe-connect-webhook] duplicate event ignored');
  return res.status(200).json({ received: true, duplicate: true });
}

// Dispatch
await dispatchHandler(thinEvent);

// Mark processed
await db.execute({
  sql: `UPDATE stripe_connect_events SET processed_at = CURRENT_TIMESTAMP WHERE stripe_event_id = ?`,
  args: [thinEvent.id],
});

return res.status(200).json({ received: true });
```

#### Scenario: Successful processing of a requirements update
- **GIVEN** Stripe sends `v2.core.account[requirements].updated` for `acct_xyz`
- **AND** `acct_xyz` corresponds to seller user ID 42 in the database
- **WHEN** the webhook handler processes the event
- **THEN** the row in `stripe_connect_events` SHALL be inserted with `processed_at = NULL`
- **AND** `handleRequirementsUpdated(thinEvent)` SHALL be invoked
- **AND** the handler SHALL call `syncAccountStatus({ user: seller42 })`
- **AND** the seller's row SHALL be updated with the latest status
- **AND** `stripe_connect_events.processed_at` SHALL be set
- **AND** the response SHALL be `200 OK`

#### Scenario: Successful processing of a capability status update
- **GIVEN** Stripe sends `v2.core.account[configuration.recipient].capability_status_updated` for `acct_xyz`
- **AND** the new capability status is `active`
- **WHEN** the handler processes the event
- **THEN** `handleCapabilityUpdated(thinEvent)` SHALL invoke `syncAccountStatus({ user })`
- **AND** the seller's `stripe_transfers_capability_active` SHALL become `1`
- **AND** the seller's `stripe_connect_status` SHALL become `'active'`

#### Scenario: Invalid signature
- **GIVEN** a request with an invalid `stripe-signature` header
- **WHEN** `parseThinEvent` throws a signature verification error
- **THEN** the controller SHALL respond `400 Bad Request` with body `{ error: 'Invalid signature' }`
- **AND** SHALL NOT insert any row in `stripe_connect_events`

#### Scenario: Account not in BD (orphan event)
- **GIVEN** Stripe sends an event for `acct_unknown` that does not match any user in `users`
- **WHEN** the handler attempts the lookup
- **THEN** the handler SHALL log `[stripe-connect-webhook] account not found in BD: acct_unknown`
- **AND** SHALL still mark the event as `processed_at` (no error)
- **AND** SHALL respond `200 OK` (so Stripe does not retry)

#### Scenario: Unknown event type
- **GIVEN** Stripe sends an event of a type not handled by the dispatcher (e.g., `v2.core.something.else`)
- **WHEN** the dispatcher reaches the default case
- **THEN** it SHALL log `[stripe-connect-webhook] unknown event type: <type>`
- **AND** SHALL leave `processed_at = NULL` (so it can be diagnosed later in `stripe_connect_events`)
- **AND** SHALL respond `200 OK`

---

### Requirement: Fiscal data validation

When the admin updates a seller's fiscal data via `PUT /api/admin/sellers/:id/fiscal`, the request body SHALL be validated by a Zod schema with the following rules.

#### Body schema

| Field | Type | Required | Validation |
|---|---|---|---|
| `tax_status` | enum | yes | Must be one of `'particular'`, `'autonomo'`, `'sociedad'`. |
| `tax_id` | string | yes | Must match Spanish DNI/NIE/CIF regex (see below). |
| `fiscal_full_name` | string | yes | min 1, max 200 chars. |
| `fiscal_address_line1` | string | yes | min 1, max 200 chars. |
| `fiscal_address_line2` | string | no | max 200 chars; nullable. |
| `fiscal_address_city` | string | yes | min 1, max 100 chars. |
| `fiscal_address_postal_code` | string | yes | Must match `/^\d{5}$/` (Spanish CP — exactly 5 digits). |
| `fiscal_address_province` | string | yes | min 1, max 100 chars. |
| `fiscal_address_country` | string | no | length 2 (ISO code), defaults to `'ES'`. |
| `irpf_retention_rate` | number | no | min 0, max 0.5; nullable. |
| `autofactura_agreement_signed` | boolean | no | If `true` and the current `autofactura_agreement_signed_at` is NULL, set the timestamp; if `false`, clear the timestamp. |

#### Spanish tax_id regex

```javascript
const dniRegex = /^\d{8}[A-Z]$/;       // 8 digits + letter
const nieRegex = /^[XYZ]\d{7}[A-Z]$/;  // X|Y|Z + 7 digits + letter
const cifRegex = /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/; // letter + 7 digits + digit/letter
// Valid IFF dni || nie || cif
```

The validation is **format only** — the system does NOT verify the tax_id against AEAT or any external service. Real verification happens in Stripe's KYC during the artist's onboarding.

#### Scenario: Valid DNI
- **WHEN** the admin submits `tax_id = '00000000T'`
- **THEN** the schema SHALL accept it as a valid DNI

#### Scenario: Valid NIE
- **WHEN** the admin submits `tax_id = 'X1234567L'`
- **THEN** the schema SHALL accept it as a valid NIE

#### Scenario: Valid CIF
- **WHEN** the admin submits `tax_id = 'B12345678'`
- **THEN** the schema SHALL accept it as a valid CIF

#### Scenario: Invalid format
- **WHEN** the admin submits `tax_id = '12345'`
- **THEN** the schema SHALL reject with error message `'tax_id debe ser un DNI, NIE o CIF español válido'`

#### Scenario: Invalid postal code
- **WHEN** the admin submits `fiscal_address_postal_code = '1234'`
- **THEN** the schema SHALL reject with error message `'CP español: 5 dígitos'`

#### Scenario: Toggling autofactura agreement
- **GIVEN** a seller with `autofactura_agreement_signed_at IS NULL`
- **WHEN** the admin sends `autofactura_agreement_signed: true`
- **THEN** the system SHALL set `autofactura_agreement_signed_at = CURRENT_TIMESTAMP`
- **WHEN** later the admin sends `autofactura_agreement_signed: false`
- **THEN** the system SHALL set `autofactura_agreement_signed_at = NULL`

---

### Requirement: Seller email — onboarding link

A new email template `sendSellerOnboardingLink({ seller, url })` SHALL be added to `api/services/emailService.js`.

#### Email content rules

- **Subject:** `'140d Galería de Arte — Completa tu cuenta de pagos'`
- **From:** `config.emailFrom` (`info@140d.art` by default).
- **To:** `seller.email`.
- **Branding:** the email body SHALL use **`140d Galería de Arte`** as the brand name throughout. The string `Kuadrat` SHALL NOT appear anywhere in the rendered HTML or plain text.
- **HTML body** SHALL include:
  - The 140d logo (URL from `config.logoUrl`).
  - A personal greeting using `seller.full_name`.
  - A paragraph explaining what data Stripe will request: DNI/NIE, IBAN, dirección.
  - A visible button "Completar onboarding" linking to `url`.
  - A note that the link expires within a few hours.
  - A footer with contact `info@140d.art`.
- **Plain text fallback** SHALL convey the same information.

#### Scenario: Email is sent
- **GIVEN** the admin clicks "Enviar por email" in the link modal
- **WHEN** the system invokes `sendSellerOnboardingLink({ seller, url })`
- **THEN** the email SHALL be sent via the existing SMTP transport
- **AND** the rendered HTML SHALL contain the string `'140d Galería de Arte'`
- **AND** the rendered HTML SHALL NOT contain the string `'Kuadrat'`
- **AND** the email log SHALL record the delivery

---

### Requirement: Admin UI — Stripe Connect section in author detail

The admin "Author detail" page (`client/app/admin/authors/[id]/page.js` or equivalent) SHALL include a new section titled "Stripe Connect" rendered by a new component `client/components/admin/StripeConnectSection.js`.

#### Section content

The section SHALL display:

1. **Status badge** with the following color/text mapping:
   | `stripe_connect_status` | Tailwind classes | Text |
   |---|---|---|
   | `not_started` | `bg-gray-100 text-gray-800` | "No iniciado" |
   | `pending` | `bg-amber-100 text-amber-800` | "Pendiente de onboarding" |
   | `active` | `bg-green-100 text-green-800` | "Activo" |
   | `restricted` | `bg-orange-100 text-orange-800` | "Restringido" |
   | `rejected` | `bg-red-100 text-red-800` | "Rechazado" |

2. **Read-only fields:**
   - `stripe_connect_account_id` (with tooltip "ID de la cuenta en Stripe")
   - `stripe_transfers_capability_active` ("Sí" / "No")
   - `stripe_connect_last_synced_at` (formatted in `es-ES` locale)

3. **List of pending requirements:** if `stripe_connect_requirements_due` is non-empty, render a `<ul>` with each requirement string as `<li>`. If empty or NULL, omit the list.

4. **Action buttons:**

   | Button | Visibility condition | Disabled condition | Action |
   |---|---|---|---|
   | "Crear cuenta conectada" | Always | `stripe_connect_account_id` exists OR fiscal data incomplete | Confirm dialog → `adminCreateStripeConnectAccount(sellerId)` → toast → refresh |
   | "Generar enlace de onboarding" | `stripe_connect_account_id` exists AND `stripe_connect_status !== 'active'` | — | `adminGenerateStripeConnectLink(sellerId)` → open `<StripeConnectLinkModal>` |
   | "Sincronizar estado" | `stripe_connect_account_id` exists | — | `adminGetStripeConnectStatus(sellerId)` → toast → refresh |

#### Scenario: Section for a brand-new seller
- **GIVEN** a seller with `stripe_connect_account_id IS NULL` and complete fiscal data
- **WHEN** the admin opens the author detail page
- **THEN** the section SHALL display the badge "No iniciado"
- **AND** the "Crear cuenta conectada" button SHALL be enabled
- **AND** the "Generar enlace" and "Sincronizar" buttons SHALL be hidden

#### Scenario: Section for a seller without fiscal data
- **GIVEN** a seller with `stripe_connect_account_id IS NULL` and `tax_id IS NULL`
- **WHEN** the admin opens the page
- **THEN** the "Crear cuenta conectada" button SHALL be disabled
- **AND** a tooltip SHALL explain "Rellena los datos fiscales antes de crear la cuenta de pagos"

#### Scenario: Section for an active seller
- **GIVEN** a seller with `stripe_connect_status='active'`
- **WHEN** the admin opens the page
- **THEN** the section SHALL display the badge "Activo" in green
- **AND** the "Crear cuenta conectada" button SHALL be disabled
- **AND** the "Generar enlace" button SHALL be hidden
- **AND** the "Sincronizar estado" button SHALL be visible

---

### Requirement: Admin UI — Onboarding link modal

A new component `client/components/admin/StripeConnectLinkModal.js` SHALL be created.

#### Props

```javascript
StripeConnectLinkModal({
  isOpen: boolean,
  onClose: () => void,
  url: string,
  expiresAt: number,           // unix timestamp (seconds)
  sellerEmail: string,
  sellerId: number,
})
```

#### Modal content

- Title: `"Enlace de onboarding generado"`
- Explanation paragraph: `"Comparte este enlace con el artista para que complete su cuenta de pagos. Expira en <X horas>."` (compute from `expiresAt`).
- Read-only `<input>` containing the full URL, with a "Copiar" button next to it.
- Button "Enviar por email a `<sellerEmail>`" — calls `adminSendStripeConnectLinkEmail(sellerId)`, shows success/error toast.
- Button "Cerrar".

#### Scenario: Copy URL to clipboard
- **GIVEN** the modal is open
- **WHEN** the admin clicks "Copiar"
- **THEN** the URL SHALL be written to the clipboard via `navigator.clipboard.writeText(url)`
- **AND** a success toast SHALL be shown: `"URL copiada al portapapeles"`

#### Scenario: Send by email
- **GIVEN** the modal is open
- **WHEN** the admin clicks "Enviar por email"
- **THEN** the system SHALL invoke `adminSendStripeConnectLinkEmail(sellerId)`
- **AND** on success SHALL show toast `"Email enviado a <sellerEmail>"`
- **AND** on failure SHALL show toast `"Error al enviar el email: <message>"`

---

### Requirement: Admin UI — Fiscal data form

A new component `client/components/admin/SellerFiscalForm.js` SHALL be created and integrated into the author detail page in a section titled "Datos fiscales".

#### Form fields

The form SHALL include controlled inputs for: `tax_status` (select), `tax_id` (text), `fiscal_full_name` (text), `fiscal_address_line1` (text), `fiscal_address_line2` (text, optional), `fiscal_address_city` (text), `fiscal_address_postal_code` (text, maxlength 5), `fiscal_address_province` (text), `fiscal_address_country` (text, default `'ES'`), `irpf_retention_rate` (number, optional, with tooltip), and a checkbox for `autofactura_agreement_signed`.

#### IRPF tooltip text

The `irpf_retention_rate` input SHALL have a tooltip with the text: `"Out of scope v1 — campo preparado para futuro. No se aplica todavía a los pagos."`

#### Autofactura checkbox behavior

- If `autofactura_agreement_signed_at IS NULL` and the checkbox is checked, on save the system SHALL set the timestamp.
- If `autofactura_agreement_signed_at IS NOT NULL` and the checkbox is unchecked, on save the system SHALL clear the timestamp.
- The current `autofactura_agreement_signed_at` SHALL be displayed as a read-only date below the checkbox if non-NULL.

#### Inline validation

The form SHALL apply client-side validation matching the backend regex (DNI/NIE/CIF and 5-digit postal code) and display errors inline before submission.

#### Scenario: Submitting valid fiscal data
- **GIVEN** the admin fills all required fields with valid data
- **WHEN** they click "Guardar"
- **THEN** the system SHALL call `adminUpdateSellerFiscalData(sellerId, payload)`
- **AND** on success SHALL show toast `"Datos fiscales actualizados"`
- **AND** SHALL refresh the seller data displayed on the page

#### Scenario: Submitting invalid tax_id
- **GIVEN** the admin enters `tax_id = '12345'`
- **WHEN** they click "Guardar"
- **THEN** the form SHALL display an inline error `"tax_id debe ser un DNI, NIE o CIF español válido"`
- **AND** SHALL NOT submit to the backend

---

### Requirement: Seller UI — Stripe Connect status banner

A new component `client/components/seller/StripeConnectBanner.js` SHALL be created and rendered at the top of the seller dashboard, before the wallet section.

#### Banner content per status

The banner SHALL render different content depending on `stripe_connect_status`:

| Status | Background | Heading | Body | CTA |
|---|---|---|---|---|
| `not_started` | `bg-gray-100` | "Cuenta de pagos no creada" | "Aún no hemos creado tu cuenta de pagos. Contacta con 140d Galería de Arte para empezar." | _(none)_ |
| `pending` | `bg-amber-50` | "Completa tu cuenta de pagos" | "Necesitamos algunos datos antes de poder enviarte transferencias." | "Continuar onboarding" → call `sellerGenerateStripeConnectLink()` → redirect to `data.url` |
| `restricted` | `bg-orange-50` | "Hay datos pendientes en tu cuenta de pagos" | (list of `requirements_due`) | "Completar" → same flow as `pending` |
| `active` | `bg-green-50` | "Cuenta de pagos conectada" | "Puedes recibir transferencias de 140d Galería de Arte." | _(none)_ |
| `rejected` | `bg-red-50` | "Cuenta de pagos rechazada" | "Tu cuenta ha sido rechazada por Stripe. Contacta con 140d Galería de Arte." | _(none)_ |

#### Branding rule (CRITICAL)

All texts in the banner SHALL use **`140d Galería de Arte`** as the brand name. The string `Kuadrat` SHALL NEVER appear in the rendered output.

#### Scenario: Active seller dashboard
- **GIVEN** an authenticated seller with `stripe_connect_status='active'`
- **WHEN** they load `/seller`
- **THEN** the banner SHALL show the green "Cuenta de pagos conectada" message
- **AND** SHALL contain the text `'140d Galería de Arte'`
- **AND** SHALL NOT contain the text `'Kuadrat'`

#### Scenario: Pending seller clicks "Continuar onboarding"
- **GIVEN** the banner shows the `pending` state with a CTA button
- **WHEN** the seller clicks "Continuar onboarding"
- **THEN** the frontend SHALL call `sellerGenerateStripeConnectLink()`
- **AND** SHALL redirect the browser to the URL returned

---

### Requirement: Seller routes — return and refresh intermediate pages

Two new client routes SHALL be created in `client/app/seller/stripe-connect/`.

#### `/seller/stripe-connect/return/page.js`

A client component that handles the artist's return from Stripe's hosted onboarding.

**Behavior:**
1. On mount, extract `?account=` query parameter (informational, not strictly required).
2. Display a spinner with text `"Actualizando estado de tu cuenta..."`.
3. Call `sellerGetStripeConnectStatus()` to refresh the local state (the actual sync is done by the webhook, but this re-reads the status from BD).
4. After 1-2 seconds (or the response, whichever is later), redirect to `/seller` (the seller dashboard).
5. Show a toast based on the resulting `stripe_connect_status`:
   - `active` → green toast `"Cuenta de pagos conectada con éxito"`.
   - `pending` → amber toast `"Estamos procesando tus datos. Esto puede tardar unos minutos."`
   - `restricted` → orange toast `"Hay datos pendientes. Revisa el banner en tu dashboard."`
   - `rejected` → red toast `"Tu cuenta ha sido rechazada. Contacta con 140d Galería de Arte."`

#### Scenario: Successful return
- **GIVEN** the artist completes the Stripe hosted onboarding
- **AND** Stripe redirects them to `https://pre.140d.art/seller/stripe-connect/return?account=acct_xyz`
- **AND** the webhook has already updated the BD to `stripe_connect_status='active'`
- **WHEN** the page loads and calls the status endpoint
- **THEN** the page SHALL show the spinner briefly
- **AND** SHALL redirect to `/seller`
- **AND** SHALL show the green toast `"Cuenta de pagos conectada con éxito"`

#### `/seller/stripe-connect/refresh/page.js`

A client component that handles the case where an account link has expired.

**Behavior:**
1. On mount, call `sellerGenerateStripeConnectLink()` to generate a fresh link.
2. Redirect the browser to the new `data.url`.
3. If the call fails, redirect to `/seller` with an error toast.

#### Scenario: Refresh after link expiration
- **GIVEN** an artist clicks on an expired account link
- **AND** Stripe redirects them to `https://pre.140d.art/seller/stripe-connect/refresh?account=acct_xyz`
- **WHEN** the page loads
- **THEN** the page SHALL call `sellerGenerateStripeConnectLink()`
- **AND** SHALL redirect to the fresh URL
- **AND** the artist SHALL be brought back to the Stripe hosted onboarding

---

### Requirement: Frontend constants — public brand name

The constant module `client/lib/constants.js` SHALL export:

```javascript
export const PUBLIC_BRAND_NAME = '140d Galería de Arte';
export const PUBLIC_BRAND_NAME_SHORT = '140d';
```

All user-facing strings introduced in this change (banner texts, modal copy, form labels, toast messages, button labels) SHALL reference this constant rather than hard-coding the brand string. This centralizes the branding and prevents accidental leaks of the internal name `Kuadrat`.

#### Scenario: Brand constant is used
- **GIVEN** the seller dashboard renders the Stripe Connect banner
- **WHEN** the banner displays the body text
- **THEN** the text SHALL be derived from `PUBLIC_BRAND_NAME`
- **AND** the constant SHALL equal `'140d Galería de Arte'`

---

### Requirement: Manual migration script for existing environments

A new SQL file `api/migrations/2026-04-stripe-connect-accounts.sql` SHALL be created with `ALTER TABLE` statements to add the new columns to existing `users` rows in environments that already have data (since `database.js` uses `CREATE TABLE IF NOT EXISTS` which only creates new tables, not modifies existing ones).

#### Migration script content rules

The script SHALL:
1. Add all 16 new columns via `ALTER TABLE users ADD COLUMN ...`.
2. Create a unique index on `stripe_connect_account_id` (since `ALTER TABLE` cannot add UNIQUE constraints in SQLite).
3. Create the `stripe_connect_events` table via `CREATE TABLE IF NOT EXISTS`.
4. Be idempotent — re-running the script SHALL fail gracefully on already-applied `ADD COLUMN` statements (or include `IF NOT EXISTS` where supported).

#### Operational rule

The migration script is **manual**, run once per existing environment by the operator using:
```bash
turso db shell <db-name> < api/migrations/2026-04-stripe-connect-accounts.sql
```

For brand-new environments where `database.js` runs from scratch, the script is NOT needed because `initializeDatabase()` will create the schema with all the new columns from the start.

#### Scenario: Running the migration on staging
- **GIVEN** the staging Turso database has the pre-change `users` table without Stripe Connect columns
- **WHEN** the operator runs the migration script via `turso db shell`
- **THEN** the new columns SHALL be added to `users`
- **AND** the `stripe_connect_events` table SHALL be created
- **AND** existing rows SHALL have NULL for the new nullable columns and the defaults for the non-NULL ones (`stripe_connect_status='not_started'`, `stripe_transfers_capability_active=0`, `fiscal_address_country='ES'`)
