## MODIFIED Requirements

### Requirement: Event credit scheduler
The system SHALL run an hourly scheduler `eventCreditScheduler` that processes paid events whose `finished_at` is older than `config.events.creditGraceDays` (default 1) and whose `host_credited_at IS NULL` and `host_credit_excluded = 0`. For each eligible event, in a single transaction:
1. Load `event_attendees` with `status='paid'` and `host_credited_at IS NULL`.
2. For each attendee, compute `commission_amount` from `amount_paid * (hostDealerCommissionOther / 100)` — where `hostDealerCommissionOther` is the `dealer_commission_other` of the event's host (`events.host_user_id`) — and derive `seller_earning`, `taxable_base`, `vat_rate=0.21`, `vat_amount` via `computeStandardVat`. The scheduler MUST NOT use `config.payment.dealerCommissionOthers` / `config.business.dealerCommission`.
3. Persist `event_attendees.commission_amount` and `host_credited_at`.
4. Increment `users.available_withdrawal_standard_vat` for `events.host_user_id` by the sum of `seller_earning`.
5. Set `events.host_credited_at` (guarded by `WHERE host_credited_at IS NULL`).
6. Send an email to the host.

#### Scenario: Eligible event with three paid attendees
- **GIVEN** a paid event with `finished_at = now - 25 hours`, three attendees with `status='paid'` and `amount_paid = 30€` each, and the host's `dealer_commission_other = 30`
- **WHEN** the scheduler runs
- **THEN** each attendee gets `commission_amount = 9€` and `host_credited_at` set
- **AND** the host's `available_withdrawal_standard_vat` increases by `63€` (3 × 21€)
- **AND** `events.host_credited_at` is set
- **AND** the host receives the credited-event email

#### Scenario: Host-specific commission is honored
- **GIVEN** a paid event whose host has `dealer_commission_other = 10` and one attendee with `amount_paid = 30€`
- **WHEN** the scheduler runs
- **THEN** that attendee's `commission_amount` SHALL be `3€`

#### Scenario: Event still in grace period
- **GIVEN** a paid event with `finished_at = now - 6 hours`
- **WHEN** the scheduler runs
- **THEN** the event is NOT processed
- **AND** no balances change
