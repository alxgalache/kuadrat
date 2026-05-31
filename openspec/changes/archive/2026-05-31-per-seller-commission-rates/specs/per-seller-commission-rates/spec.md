## ADDED Requirements

### Requirement: Per-seller commission columns on users
The `users` table SHALL carry two columns storing the gallery commission for that
seller as a whole-number percentage:
- `dealer_commission_art` (REAL NOT NULL DEFAULT 25)
- `dealer_commission_other` (REAL NOT NULL DEFAULT 10)

Both columns SHALL be declared in the `CREATE TABLE users` statement (for fresh
databases) and added via `safeAlter('ALTER TABLE users ADD COLUMN ...')` blocks
(for existing databases) in `api/config/database.js`. No standalone ALTER outside
the existing `safeAlter` pattern is allowed.

#### Scenario: Fresh database gets the columns with defaults
- **WHEN** `initializeDatabase()` runs against an empty database
- **THEN** the `users` table SHALL include `dealer_commission_art` defaulting to `25` and `dealer_commission_other` defaulting to `10`

#### Scenario: Existing database is migrated additively
- **WHEN** `initializeDatabase()` runs against a database whose `users` table predates this change
- **THEN** the two columns SHALL be added via `safeAlter` with defaults `25` and `10`, leaving existing rows with those default values

### Requirement: Commission calculation uses the product owner's rate
Every server-side computation of a sale's commission SHALL use the commission rate
configured on the **seller that owns the product**, selecting `dealer_commission_art`
for `art` products and `dealer_commission_other` for `other` products. The rate is
a whole percentage and SHALL be divided by 100 to obtain the multiplier. The system
SHALL NOT use `config.payment.dealerCommissionArt` / `dealerCommissionOthers` for
sale calculations.

This applies to the cart checkout (`ordersController`), auction bid billing
(`auctionAdminController`), draw billing (`drawAdminController`), and paid-event
host credit (`eventCreditScheduler`).

#### Scenario: Cart checkout with multiple sellers
- **WHEN** a cart contains an `art` product owned by seller A (whose `dealer_commission_art` is `25`) and an `other` product owned by seller B (whose `dealer_commission_other` is `10`)
- **THEN** the art item's `commission_amount` SHALL equal `price * 0.25` and the other item's `commission_amount` SHALL equal `price * 0.10`

#### Scenario: Seller-specific art rate is honored
- **WHEN** an art product is sold whose seller has `dealer_commission_art = 30`
- **THEN** the stored `commission_amount` SHALL equal `price * 0.30`, regardless of any environment variable

#### Scenario: Commission amount is frozen at sale time
- **WHEN** a sale has been recorded and the seller's `dealer_commission_art` is later changed
- **THEN** the already-stored `commission_amount` of the past sale SHALL remain unchanged

### Requirement: Seller can read their own commission rates
The system SHALL provide `GET /api/seller/commission-rates`, protected by
`authenticate` + seller authorization, returning the authenticated seller's rates
as `{ commissionRateArt, commissionRateOther }` read from their `users` row.
Additionally, `GET /api/seller/wallet` SHALL return `commissionRateArt` and
`commissionRateOther` sourced from the authenticated seller's `users` row (not from
environment configuration).

#### Scenario: Commission rates endpoint returns the seller's row values
- **WHEN** an authenticated seller whose `dealer_commission_art = 25` and `dealer_commission_other = 10` calls `GET /api/seller/commission-rates`
- **THEN** the response SHALL be `{ commissionRateArt: 25, commissionRateOther: 10 }`

#### Scenario: Wallet exposes per-seller rates
- **WHEN** an authenticated seller calls `GET /api/seller/wallet`
- **THEN** the response `commissionRateArt` and `commissionRateOther` SHALL equal that seller's `dealer_commission_art` and `dealer_commission_other`

### Requirement: Admin can view and edit a seller's commission rates
The admin author endpoints SHALL expose and persist the two commission columns:
- `GET /api/admin/authors/:id` SHALL include `dealer_commission_art` and `dealer_commission_other` in the returned author.
- `PUT /api/admin/authors/:id` SHALL accept `dealer_commission_art` and `dealer_commission_other`, validate each as a number in the range `[0, 100]` (Zod), and persist them in the `UPDATE users`.

The admin author edit screen (`client/app/admin/authors/[id]/edit/page.js`) SHALL
render two numeric inputs (percentage, step `0.01`, range `0`–`100`) with es-ES
labels, and the author detail view SHALL display the current values.

#### Scenario: Admin updates a seller's art commission
- **WHEN** an admin submits `PUT /api/admin/authors/:id` with `dealer_commission_art = 30`
- **THEN** the seller's `dealer_commission_art` SHALL be persisted as `30` and reflected on the next sale of that seller's art products

#### Scenario: Out-of-range commission is rejected
- **WHEN** an admin submits `dealer_commission_art = 150` (or a negative value)
- **THEN** the request SHALL be rejected with a validation error and no update SHALL occur

### Requirement: Removal of global commission environment variables
The global commission environment variables SHALL be removed from the codebase and
no longer drive sale calculations:
- API: `DEALER_COMMISSION_ART`, `DEALER_COMMISSION_OTHERS` SHALL be removed from
  `api/config/env.js` (the `config.payment.dealerCommission*` keys) and from
  `api/.env.example`.
- Client: `NEXT_PUBLIC_DEALER_COMMISSION_ART`, `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
  SHALL be removed from `.env.example` (root), `client/.env.example`,
  `client/Dockerfile.staging`, `client/Dockerfile.prod`, `docker-compose.prod.yml`,
  `docker-compose.pre2.yml`, and `docker-compose.m1.yml`.

#### Scenario: No code path reads the commission env vars
- **WHEN** the codebase is searched for `DEALER_COMMISSION_ART`, `DEALER_COMMISSION_OTHERS`, `NEXT_PUBLIC_DEALER_COMMISSION_ART`, or `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
- **THEN** no application code, build arg, compose file, or `.env.example` SHALL reference them
