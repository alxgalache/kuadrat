# per-seller-vat-rates

## Purpose

Per-seller VAT rates stored on the `users` table (`tax_vat_art` / `tax_vat_other`), the derivation of an art sale's fiscal regime from the seller's art rate, the per-item snapshot of that regime on `art_order_items`, admin and seller endpoints exposing the rates, and the removal of the legacy global VAT environment variables from the client pipeline.

## Requirements

### Requirement: Per-seller VAT rate columns on users
The `users` table SHALL carry two columns storing the VAT rate the seller
invoices with, as a whole-number percentage:
- `tax_vat_art REAL NOT NULL DEFAULT 10`
- `tax_vat_other REAL NOT NULL DEFAULT 21`

Both columns SHALL be declared in the `CREATE TABLE users` statement (for fresh
databases) and added via `safeAlter('ALTER TABLE users ADD COLUMN ...')` blocks
(for existing databases) in `api/config/database.js`, following the same pattern
as `dealer_commission_art` / `dealer_commission_other`.

#### Scenario: Fresh database gets the columns with defaults
- **WHEN** `initializeDatabase()` runs against an empty database
- **THEN** the `users` table SHALL include `tax_vat_art` defaulting to `10` and `tax_vat_other` defaulting to `21`

#### Scenario: Existing database is migrated additively
- **WHEN** `initializeDatabase()` runs against a database whose `users` table predates this change
- **THEN** the two columns SHALL be added via `safeAlter` with defaults `10` and `21`, leaving every existing seller with the exact behavior they had before this change

### Requirement: Art VAT regime derivation rule
The system SHALL provide a single helper module `api/utils/vatRegime.js` that
derives the platform fiscal regime of an art sale from the selling artist's
`tax_vat_art`:
- `tax_vat_art = 10` → `'art_rebu'` (author invoices at the reduced rate; REBU applies).
- any other value (e.g. `21`, cooperative billing) → `'standard_vat'`.

`other` products and paid events SHALL always be `'standard_vat'` (no
derivation). No backend code SHALL inline this comparison outside the helper.

#### Scenario: Author artist derives REBU
- **WHEN** the helper is called with `tax_vat_art = 10`
- **THEN** it SHALL return `'art_rebu'`

#### Scenario: Cooperative artist derives standard regime
- **WHEN** the helper is called with `tax_vat_art = 21`
- **THEN** it SHALL return `'standard_vat'`

#### Scenario: Any non-10 value derives standard regime
- **WHEN** the helper is called with `tax_vat_art = 0` or `tax_vat_art = 15`
- **THEN** it SHALL return `'standard_vat'`

### Requirement: VAT regime snapshot on art order items
The `art_order_items` table SHALL carry a `vat_regime TEXT` column that freezes
the regime of each art sale at item-creation time, computed from the product
owner's `tax_vat_art` via the derivation helper. It SHALL be written by every
code path that inserts art order items: cart checkout (`ordersController`),
auction bid billing (`auctionAdminController`) and draw billing
(`drawAdminController`).

The column SHALL be added to both the `CREATE TABLE art_order_items` statement
and a `safeAlter` block. An idempotent backfill
(`UPDATE art_order_items SET vat_regime = 'art_rebu' WHERE vat_regime IS NULL`)
SHALL run on startup after the `safeAlter` (all pre-existing sales were REBU).
Every read of the column SHALL be defensive: `COALESCE(vat_regime, 'art_rebu')`.

Changing a seller's `tax_vat_art` SHALL only affect items created afterwards;
existing items keep their snapshotted regime (no historical recalculation),
mirroring how `commission_amount` is frozen.

#### Scenario: Checkout snapshots the regime at purchase time
- **GIVEN** a seller with `tax_vat_art = 21`
- **WHEN** a buyer checks out an art product owned by that seller
- **THEN** the created `art_order_items` row SHALL have `vat_regime = 'standard_vat'`

#### Scenario: Existing items keep their regime after a rate change
- **GIVEN** an `art_order_items` row created with `vat_regime = 'art_rebu'`
- **WHEN** the admin later changes that seller's `tax_vat_art` to `21`
- **THEN** the existing row SHALL keep `vat_regime = 'art_rebu'` and continue to credit/withdraw through the REBU bucket

#### Scenario: Startup backfill marks legacy rows as REBU
- **WHEN** `initializeDatabase()` runs against a database with pre-existing `art_order_items` rows where `vat_regime IS NULL`
- **THEN** those rows SHALL be set to `'art_rebu'`
- **AND** re-running the startup SHALL perform no further updates

### Requirement: Admin can view and edit per-seller VAT rates
`GET /api/admin/authors/:id` SHALL return `tax_vat_art` and `tax_vat_other`.
`PUT /api/admin/authors/:id` SHALL accept and persist both fields, validated by
Zod as numbers in `[0, 100]` (coerced, optional — omitting a field leaves the
column unchanged), mirroring the `dealer_commission_*` handling. The admin
author edit screen (`client/app/admin/authors/[id]/edit/page.js`) SHALL expose
two numeric inputs next to the commission inputs, with es-ES helper text
explaining that `10` means author (REBU) and any other value (e.g. `21`) means
standard-regime invoicing (e.g. via a cooperative). The author view page SHALL
display both rates.

#### Scenario: Admin sets a cooperative artist's art VAT
- **WHEN** the admin submits the author edit form with `tax_vat_art = 21`
- **THEN** the API SHALL persist `21` and return it in the response
- **AND** subsequent art sales of that seller SHALL derive `standard_vat`

#### Scenario: Out-of-range value is rejected
- **WHEN** the admin submits `tax_vat_art = 150`
- **THEN** the API SHALL respond 400 with a Spanish validation message
- **AND** the column SHALL remain unchanged

#### Scenario: Omitted fields keep their values
- **WHEN** the admin submits the author edit form without `tax_vat_other`
- **THEN** `tax_vat_other` SHALL keep its previous value

### Requirement: Seller endpoints expose the VAT rates
`GET /api/seller/commission-rates` SHALL additionally return `taxVatArt` and
`taxVatOther` (whole percentages) AND `artVatRegime`
(`'art_rebu' | 'standard_vat'`, derived via `api/utils/vatRegime.js`) for the
authenticated seller. `GET /api/seller/wallet` SHALL additionally return
`taxVatArt`, `taxVatOther` and `artVatRegime` (derived the same way), so the
client never derives the regime itself.

#### Scenario: Commission-rates endpoint includes VAT rates and regime
- **GIVEN** an authenticated seller with `tax_vat_art = 21` and `tax_vat_other = 21`
- **WHEN** they call `GET /api/seller/commission-rates`
- **THEN** the response SHALL include `taxVatArt: 21`, `taxVatOther: 21` and `artVatRegime: 'standard_vat'` alongside the commission rates

#### Scenario: Commission-rates endpoint derives REBU for author artists
- **GIVEN** an authenticated seller with `tax_vat_art = 10`
- **WHEN** they call `GET /api/seller/commission-rates`
- **THEN** the response SHALL include `artVatRegime: 'art_rebu'`

#### Scenario: Wallet endpoint includes the derived art regime
- **GIVEN** an authenticated seller with `tax_vat_art = 10`
- **WHEN** they call `GET /api/seller/wallet`
- **THEN** the response SHALL include `taxVatArt: 10`, `taxVatOther: 21` and `artVatRegime: 'art_rebu'`

### Requirement: Global VAT env vars removed from the client pipeline
The client SHALL NOT read `NEXT_PUBLIC_TAX_VAT_ES` or
`NEXT_PUBLIC_TAX_VAT_ART_ES`. Both variables SHALL be removed from the root
`.env.example`, `client/.env.example`, `client/Dockerfile.staging`,
`client/Dockerfile.prod`, `docker-compose.prod.yml`, `docker-compose.pre2.yml`
and `docker-compose.m1.yml`. On the API, `TAX_VAT_ART_ES` (registered as
`config.payment.vatArtEs`, which has no consumers) SHALL be removed from
`api/config/env.js` and `api/.env.example`. `TAX_VAT_ES` SHALL be kept solely
for the legacy Revolut line-item metadata in `ordersController`, with a comment
documenting that it is its only remaining consumer.

#### Scenario: Client bundle has no VAT env references
- **WHEN** searching the client codebase for `NEXT_PUBLIC_TAX_VAT`
- **THEN** there SHALL be no occurrences

#### Scenario: Revolut metadata keeps working
- **WHEN** an order is placed through the legacy Revolut flow with `TAX_VAT_ES=0.21`
- **THEN** the line-item tax metadata SHALL be computed exactly as before this change
