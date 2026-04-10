# seller-withdrawals (MODIFIED)

## MODIFIED Requirements

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
After this change, rows in `withdrawals` are created ONLY by `POST /api/admin/payouts/:sellerId/execute`. The seller endpoint no longer inserts rows. The admin flow always populates `vat_regime`, `taxable_base_total`, `vat_amount_total`, `executed_by_admin_id`, and (on success) `stripe_transfer_id` and `executed_at`.

#### Scenario: All new withdrawals carry full Stripe Connect metadata
- **GIVEN** a successful payout executed via the admin panel
- **WHEN** the row is queried
- **THEN** `vat_regime` is set, `stripe_transfer_id` matches the Stripe Transfer object, `executed_at` and `executed_by_admin_id` are populated, and `taxable_base_total + vat_amount_total` reconcile against the sum of the related `withdrawal_items`
