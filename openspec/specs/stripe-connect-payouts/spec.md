# stripe-connect-payouts (ADDED)

## ADDED Requirements

### Requirement: VAT calculator helper
The system SHALL provide a pure helper `api/utils/vatCalculator.js` exposing `computeRebuVat` and `computeStandardVat`, used by both the confirmation scheduler and the payouts controller to compute `seller_earning`, `taxable_base`, `vat_rate` and `vat_amount` per item from `(price, commission)`.

#### Scenario: REBU computation for an art item
- **GIVEN** an art item with price 100€ and commission 30€
- **WHEN** `computeRebuVat({ priceCents: 10000, commissionCents: 3000 })` is invoked
- **THEN** it returns `seller_earning = 7000`, `taxable_base = 2727` (3000 / 1.10 rounded), `vat_rate = 0.10`, `vat_amount = 273`

#### Scenario: Standard VAT computation for an "other" item
- **GIVEN** an other-product item with price 100€ and commission 30€
- **WHEN** `computeStandardVat({ priceCents: 10000, commissionCents: 3000 })` is invoked
- **THEN** it returns `seller_earning = 7000`, `taxable_base = 2479`, `vat_rate = 0.21`, `vat_amount = 521`

### Requirement: Withdrawal items table
The system SHALL persist every line included in a payout into a polymorphic table `withdrawal_items(id, withdrawal_id, item_type, item_id, seller_earning, taxable_base, vat_rate, vat_amount, vat_regime, created_at)` with `item_type` constrained to `'art_order_item' | 'other_order_item' | 'event_attendee'`.

#### Scenario: Rows are created atomically with the parent withdrawal
- **WHEN** an admin executes a payout containing 3 art items
- **THEN** the same DB transaction inserts the `withdrawals` row AND the 3 corresponding `withdrawal_items` rows
- **AND** if the Stripe API call later fails, both the parent row and the children are reverted (parent set to `failed`, children deleted)

### Requirement: One item, one active withdrawal
The system SHALL prevent any given `(item_type, item_id)` from appearing in more than one withdrawal whose status is not in `('failed', 'cancelled')`. This rule is enforced application-side inside the execute transaction (SQLite partial indexes cannot reference other tables).

#### Scenario: Two admins try to pay the same item concurrently
- **GIVEN** admin A has just included `art_order_item:42` in a payout being executed
- **WHEN** admin B attempts a preview/execute that also includes `art_order_item:42`
- **THEN** admin B's execute call fails with HTTP 409 and a clear error mentioning the conflict

### Requirement: Payouts admin endpoints
The system SHALL expose under `/api/admin/payouts` the following authenticated endpoints (admin-only):
- `GET /api/admin/payouts` — list of sellers with positive balance in any bucket.
- `GET /api/admin/payouts/:sellerId` — full breakdown for a seller (both buckets, pending items, history).
- `POST /api/admin/payouts/:sellerId/preview` — returns a non-persistent summary plus a single-use `confirmation_token` valid for 5 minutes.
- `POST /api/admin/payouts/:sellerId/execute` — executes the payout end-to-end, requiring the `confirmation_token` from a prior preview.
- `POST /api/admin/payouts/withdrawals/:id/mark-reversed` — manual reflection of a reversal performed in the Stripe dashboard.

#### Scenario: Preview without execute
- **WHEN** admin calls `preview` for a seller with REBU balance
- **THEN** the response contains `{ token, summary: { total, taxable_base, vat_amount, item_count, items } }`
- **AND** no row is created in `withdrawals` or `withdrawal_items`
- **AND** the seller's bucket is unchanged

#### Scenario: Execute happy path
- **GIVEN** a valid `confirmation_token` from a recent preview
- **AND** the seller has `stripe_connect_status='active'` and `stripe_transfers_capability_active=1`
- **WHEN** admin calls `execute` with that token
- **THEN** a `withdrawals` row is created with `status='processing'`
- **AND** `withdrawal_items` are inserted
- **AND** the bucket is decremented
- **AND** `stripe.transfers.create` is called with idempotency key `transfer_withdrawal_<id>_v1`
- **AND** on success the row transitions to `status='completed'` with `stripe_transfer_id` and `executed_at` set
- **AND** the seller receives an email notifying the payout

#### Scenario: Execute when Stripe call fails
- **WHEN** `stripe.transfers.create` rejects (network/4xx)
- **THEN** the `withdrawals` row is updated to `status='failed'` with `failure_reason`
- **AND** the bucket decrement is reverted (the original balance is restored)
- **AND** the `withdrawal_items` rows are deleted
- **AND** the API responds with a clear 5xx and the failure reason

#### Scenario: Execute rejected when seller is not active
- **GIVEN** a seller with `stripe_connect_status != 'active'`
- **WHEN** admin tries to execute a payout for that seller
- **THEN** the API responds 422 with a message asking the admin to wait until the connected account is active
- **AND** no Stripe call is made

#### Scenario: Confirmation token replay
- **GIVEN** a `confirmation_token` already used in a successful execute
- **WHEN** the same token is reused on a second execute call
- **THEN** the API responds 409 and no second transfer is attempted
- **AND** even if the rejection bypassed the token check, the Stripe idempotency key would return the same Transfer object instead of duplicating

### Requirement: Stripe transfer creation contract
The `createTransfer` function in `api/services/stripeConnectService.js` SHALL invoke `stripe.transfers.create` with:
- `amount` in the smallest currency unit (céntimos),
- `currency: 'eur'`,
- `destination` = the seller's `stripe_connect_account_id`,
- `transfer_group` = `'WITHDRAWAL_' + withdrawal.id`,
- `metadata` containing at least `withdrawal_id` and `vat_regime`,
- `source_transaction` left undefined (funded from platform balance),
- and an `idempotencyKey` of the form `transfer_withdrawal_<withdrawal.id>_v1`.

#### Scenario: Idempotency on retry
- **GIVEN** a network timeout on the first `transfers.create` call
- **WHEN** the call is retried with the same idempotency key
- **THEN** Stripe returns the same Transfer object instead of creating a second one
- **AND** the local `withdrawals` row ends up linked to a single `stripe_transfer_id`

### Requirement: Webhook handlers for transfer events
The system SHALL handle the following Stripe Connect webhook events on `/api/stripe/connect/webhook` (the endpoint defined by Change #1), with idempotency provided by the `stripe_connect_events` table:
- `transfer.created` — backfill `executed_at` and `stripe_transfer_id` if missing.
- `transfer.reversed` — set `status='reversed'`, populate `reversed_at`, `reversal_amount`, and refund the bucket of `vat_regime` by `reversal_amount`.
- `transfer.failed` — set `status='failed'`, populate `failure_reason`, refund the bucket, and email the admin.

#### Scenario: Reversal webhook restores the bucket
- **GIVEN** a completed payout for `vat_regime='art_rebu'` worth 50€
- **WHEN** Stripe sends a `transfer.reversed` event with `amount = 5000`
- **THEN** the local row is marked `reversed`, `reversal_amount=5000`, and the user's `available_withdrawal_art_rebu` is incremented by 50€
- **AND** the `withdrawal_items` rows are NOT deleted (they remain for historical traceability)

### Requirement: Confirmation modal for irreversibility
The admin frontend SHALL implement a two-step confirmation modal (`ConfirmPayoutModal`) that:
- Step 1: shows the preview summary returned by the backend, including total, item count, taxable base, VAT, and a clear warning that the operation is irreversible once confirmed.
- Step 2: only after explicit confirmation, calls `execute`. While in flight, the confirm button is disabled and the modal shows "Procesando con Stripe…".

#### Scenario: Admin closes the modal mid-confirmation
- **GIVEN** the admin opened the modal and the preview was fetched
- **WHEN** the admin closes the modal without confirming
- **THEN** no execute call is made
- **AND** no row is created in `withdrawals`
