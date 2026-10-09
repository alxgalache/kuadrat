# seller-withdrawals Specification

## Purpose

Definir las retiradas del vendedor con Stripe Connect: el endpoint del vendedor pasa a ser un aviso, la tabla de retiradas se amplía y solo el flujo de pagos del admin crea retiradas.

## Requirements

### Requirement: Seller withdrawal endpoint becomes a nudge
`POST /api/seller/withdrawals` SHALL no longer create a row in `withdrawals` and SHALL no longer modify the seller's balance. Instead, it ONLY sends an email notification to the platform admin announcing that the artist has requested a payout, with a direct link to `/admin/payouts/<sellerId>` in the admin panel. It returns `200 { ok: true }`.

#### Scenario: Seller clicks "Solicitar pago"
- **GIVEN** a seller with positive balance in any bucket
- **WHEN** they POST to `/api/seller/withdrawals`
- **THEN** an email is sent to the admin with the link to the payouts page
- **AND** no row is inserted in `withdrawals`
- **AND** neither `available_withdrawal_art_rebu` nor `available_withdrawal_standard_vat` is modified
- **AND** the response is `200 { ok: true }`

#### Scenario: Seller has no balance
- **GIVEN** a seller with both buckets at 0
- **WHEN** they POST to `/api/seller/withdrawals`
- **THEN** the API responds 400 with a clear message "Sin saldo disponible"
- **AND** no email is sent

### Requirement: Withdrawals table
The system SHALL keep seller payouts in a `withdrawals` table: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `user_id` (INTEGER NOT NULL, FK → `users(id)`), `amount` (REAL NOT NULL), `iban` (TEXT NOT NULL, the bank account of the legacy manual transfers), `status` (TEXT NOT NULL DEFAULT `pending`, CHECK in `pending`, `processing`, `completed`, `failed`, `reversed`, `cancelled`), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP), `completed_at` (DATETIME, nullable) and `admin_notes` (TEXT, nullable), with an index on `user_id` (`idx_withdrawals_user`). The Stripe Connect fields are specified in the next requirement.

#### Scenario: Withdrawals table exists after initialization
- **WHEN** `initializeDatabase()` runs on a fresh database
- **THEN** the `withdrawals` table SHALL exist with these columns, the status CHECK and the `idx_withdrawals_user` index

#### Scenario: Status outside the allowed set
- **WHEN** a row is written with a status that is not one of the six allowed values
- **THEN** the database SHALL reject it

### Requirement: Withdrawals table extended with Stripe Connect fields
The `withdrawals` table SHALL be extended (via `safeAlter`) with the following fields, all NULLable for backward compatibility with pre-Stripe-Connect rows:
- `stripe_transfer_id TEXT` (UNIQUE when not null, via partial index).
- `stripe_transfer_group TEXT`.
- `vat_regime TEXT` constrained at the application layer to `'art_rebu' | 'standard_vat'`.
- `taxable_base_total REAL`, `vat_amount_total REAL`.
- `executed_at DATETIME`, `executed_by_admin_id INTEGER`.
- `failure_reason TEXT`.
- `reversed_at DATETIME`, `reversal_amount REAL`, `reversal_reason TEXT`.

The `status` column accepts the new values `processing` and `reversed` at the application layer (the existing CHECK constraint cannot be altered in SQLite; the application is the source of truth for the enum).

#### Scenario: Historical row remains valid after schema update
- **GIVEN** a pre-Stripe-Connect row in `withdrawals` with `status='completed'`, `iban='ES12...'`, and all new columns NULL
- **WHEN** the schema migration runs
- **THEN** the row is unchanged and queryable
- **AND** the admin UI clearly distinguishes legacy rows (no `vat_regime`, no `stripe_transfer_id`) from Stripe Connect rows

### Requirement: Withdrawals are created exclusively by the admin payouts flow
Rows in `withdrawals` SHALL be created ONLY by `POST /api/admin/payouts/:sellerId/execute`. The seller endpoint SHALL NOT insert rows. The admin flow SHALL always populate `vat_regime`, `taxable_base_total`, `vat_amount_total`, `executed_by_admin_id`, and (on success) `stripe_transfer_id` and `executed_at`.

#### Scenario: All new withdrawals carry full Stripe Connect metadata
- **GIVEN** a successful payout executed via the admin panel
- **WHEN** the row is queried
- **THEN** `vat_regime` is set, `stripe_transfer_id` matches the Stripe Transfer object, `executed_at` and `executed_by_admin_id` are populated, and `taxable_base_total + vat_amount_total` reconcile against the sum of the related `withdrawal_items`
