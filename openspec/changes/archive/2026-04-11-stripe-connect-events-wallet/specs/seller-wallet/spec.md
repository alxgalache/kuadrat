# seller-wallet (MODIFIED)

## MODIFIED Requirements

### Requirement: Standard VAT bucket also receives event credits
The `available_withdrawal_standard_vat` bucket (introduced in Change #2) SHALL also receive credits originating from paid events, in addition to credits from `other_order_items`. The credit happens via `eventCreditScheduler` once an event passes its grace period (`config.events.creditGraceDays`, default 1 day) after `finished_at`.

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
