# seller-wallet (MODIFIED)

## MODIFIED Requirements

### Requirement: Wallet split into two VAT buckets
The seller wallet SHALL be split from a single `users.available_withdrawal` column into two columns reflecting the fiscal regime of the underlying sale:
- `available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0` — credits originating from `art_order_items` (REBU 10% on dealer margin).
- `available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0` — credits originating from `other_order_items` and (in Change #3) `event_attendees` (standard 21% VAT).

The legacy `available_withdrawal` column is retained as deprecated, set to 0 for all users after the migration, and is not written to by any new code path.

#### Scenario: Confirmation scheduler credits the correct bucket
- **GIVEN** an art order item that crosses the auto-confirmation threshold
- **WHEN** the confirmation scheduler runs
- **THEN** `users.available_withdrawal_art_rebu` is incremented by `(price - commission)` for the seller of that item
- **AND** `users.available_withdrawal_standard_vat` is unchanged
- **AND** the legacy `available_withdrawal` column is unchanged

#### Scenario: Manual status change credits the correct bucket
- **GIVEN** an admin marks an `other_order_items` row as confirmed via `PATCH /api/orders/:orderId/items/:itemId/status`
- **WHEN** the handler runs
- **THEN** `users.available_withdrawal_standard_vat` is incremented for the seller
- **AND** `users.available_withdrawal_art_rebu` is unchanged

### Requirement: Seller dashboard surfaces both balances
The seller dashboard SHALL display both balances with clear labels in es-ES:
- "Saldo arte (REBU 10% IVA)" → `available_withdrawal_art_rebu`.
- "Saldo otros productos / eventos (21% IVA)" → `available_withdrawal_standard_vat`.
- A combined total below.

#### Scenario: Seller with credits in both buckets
- **GIVEN** a seller with `available_withdrawal_art_rebu = 120` and `available_withdrawal_standard_vat = 80`
- **WHEN** the seller opens their dashboard
- **THEN** they see "Saldo arte: 120,00 €", "Saldo otros: 80,00 €", and a combined total "200,00 €"

### Requirement: Standard VAT bucket also receives event credits
The `available_withdrawal_standard_vat` bucket SHALL also receive credits originating from paid events, in addition to credits from `other_order_items`. The credit happens via `eventCreditScheduler` once an event passes its grace period (`config.events.creditGraceDays`, default 1 day) after `finished_at`.

#### Scenario: Event credit increments the standard_vat bucket
- **GIVEN** a host with `available_withdrawal_standard_vat = 0` and a paid event eligible for credit with total `seller_earning = 50€`
- **WHEN** the event credit scheduler processes the event
- **THEN** the host's `available_withdrawal_standard_vat` is `50€`
- **AND** the host's `available_withdrawal_art_rebu` is unchanged (events never go to REBU)

#### Scenario: Mixed buckets for the same seller
- **GIVEN** a seller who is both an artist (with `art_order_items` already credited to `available_withdrawal_art_rebu`) and the host of a credited paid event
- **WHEN** the seller views their dashboard or the admin opens `/admin/payouts/<sellerId>`
- **THEN** both buckets show their independent balances
- **AND** event attendees appear in the `standard_vat` bucket alongside any `other_order_items`

### Requirement: One-time data migration of legacy balances
On first boot after deploy, the system SHALL execute an idempotent migration that, for every user with `available_withdrawal > 0`, dumps the entire amount into `available_withdrawal_standard_vat` and zeroes the legacy column. The migration logs each affected user and amount via the structured logger.

#### Scenario: Re-running the migration is a no-op
- **GIVEN** the migration already ran and left every user with `available_withdrawal = 0`
- **WHEN** the API is restarted
- **THEN** the migration runs but performs no UPDATEs
- **AND** no errors are produced
