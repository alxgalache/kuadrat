# stripe-connect-payouts (MODIFIED)

## ADDED Requirements

### Requirement: Pending items are selected by item VAT regime
The payout pending-item queries SHALL classify order items by their snapshotted
`vat_regime`, not by their source table:
- An `art_rebu` payout SHALL include only `art_order_items` with
  `COALESCE(vat_regime, 'art_rebu') = 'art_rebu'`.
- A `standard_vat` payout SHALL include all pending `other_order_items`, all
  pending `art_order_items` with `vat_regime = 'standard_vat'`, and all pending
  credited `event_attendees`.

Every pending row SHALL carry its own `item_type`
(`art_order_item` | `other_order_item` | `event_attendee`), and
`withdrawal_items` rows created from them SHALL persist that `item_type`
together with the payout's `vat_regime` (an `art_order_item` row inside a
`standard_vat` withdrawal is valid). The per-item VAT split keeps using the
compute function of the payout's regime (numerically identical in both — 21%
extracted from the commission).

#### Scenario: Standard payout includes a cooperative artist's art items
- **GIVEN** a seller with two pending confirmed items: an art item with `vat_regime = 'standard_vat'` (750€ earning) and an other item (100€ earning)
- **WHEN** the admin previews a `standard_vat` payout for that seller
- **THEN** the summary contains both items (`item_count = 2`, `total = 850`)
- **AND** the art line carries `item_type = 'art_order_item'` and `vat_regime = 'standard_vat'`

#### Scenario: REBU payout excludes standard-regime art items
- **GIVEN** the same seller
- **WHEN** the admin previews an `art_rebu` payout
- **THEN** the standard-regime art item is NOT included

#### Scenario: Legacy art items without snapshot behave as REBU
- **GIVEN** an `art_order_items` row with `vat_regime IS NULL` (created before the backfill ran)
- **WHEN** pending items are loaded for either regime
- **THEN** the row is treated as `'art_rebu'`

## MODIFIED Requirements

### Requirement: Payouts admin endpoints
The system SHALL expose under `/api/admin/payouts` the following authenticated endpoints (admin-only):
- `GET /api/admin/payouts` — list of sellers with positive balance in any bucket.
- `GET /api/admin/payouts/:sellerId` — full breakdown for a seller (both buckets, pending items, history).
- `POST /api/admin/payouts/:sellerId/preview` — returns a non-persistent summary plus a single-use `confirmation_token` valid for 5 minutes.
- `POST /api/admin/payouts/:sellerId/execute` — executes the payout end-to-end, requiring the `confirmation_token` from a prior preview.
- `POST /api/admin/payouts/withdrawals/:id/mark-reversed` — manual reflection of a reversal performed in the Stripe dashboard.

Because a `standard_vat` payout can now contain rows from two integer-id tables
(`other_order_items` and `art_order_items`), the preview/execute payloads SHALL
disambiguate restricted selections: `item_ids` keeps meaning the regime's
native order-item table (`art_order_items` for `art_rebu`,
`other_order_items` for `standard_vat`), and an optional `art_item_ids` array
restricts the art items included in a `standard_vat` payout. Both are optional;
omitting them pays the full bucket.

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

#### Scenario: Restricted standard payout mixing both tables
- **GIVEN** a seller with pending standard-regime art items and other items
- **WHEN** admin calls `preview` with `vat_regime='standard_vat'`, `item_ids=[<other ids>]` and `art_item_ids=[<art ids>]`
- **THEN** the summary contains exactly the referenced rows from each table, each tagged with its own `item_type`
