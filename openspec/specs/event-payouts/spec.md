# event-payouts

## Requirements

### Requirement: Event finished_at marker
The system SHALL set `events.finished_at = CURRENT_TIMESTAMP` exactly once, the first time the host abandons the LiveKit room of a paid event. The update SHALL be guarded by `WHERE finished_at IS NULL` to be idempotent. The system SHALL also expose `POST /api/admin/events/:id/mark-finished` (admin only) as a manual fallback.

#### Scenario: Host disconnects from a paid event
- **GIVEN** a paid event with `finished_at IS NULL` and the host connected to the LiveKit room
- **WHEN** the host disconnects (LiveKit `participant_disconnected` for identity=host)
- **THEN** `events.finished_at` is set to the current timestamp
- **AND** `events.status` becomes `'finished'`

#### Scenario: Host re-enters and disconnects again
- **GIVEN** an event with `finished_at` already set
- **WHEN** the host reconnects and disconnects a second time
- **THEN** `finished_at` is NOT modified

#### Scenario: Admin manually marks an event finished
- **GIVEN** an event whose disconnect hook never fired
- **WHEN** the admin POSTs to `/api/admin/events/:id/mark-finished`
- **THEN** `finished_at` is set (now or to the body-provided value if present)

### Requirement: Event credit scheduler
The system SHALL run an hourly scheduler `eventCreditScheduler` that processes paid events whose `finished_at` is older than `config.events.creditGraceDays` (default 1) and whose `host_credited_at IS NULL` and `host_credit_excluded = 0`. For each eligible event, in a single transaction:
1. Load `event_attendees` with `status='paid'` and `host_credited_at IS NULL`.
2. For each attendee, compute `commission_amount` from `amount_paid * config.business.dealerCommission` and derive `seller_earning`, `taxable_base`, `vat_rate=0.21`, `vat_amount` via `computeStandardVat`.
3. Persist `event_attendees.commission_amount` and `host_credited_at`.
4. Increment `users.available_withdrawal_standard_vat` for `events.host_user_id` by the sum of `seller_earning`.
5. Set `events.host_credited_at` (guarded by `WHERE host_credited_at IS NULL`).
6. Send an email to the host.

#### Scenario: Eligible event with three paid attendees
- **GIVEN** a paid event with `finished_at = now - 25 hours`, three attendees with `status='paid'` and `amount_paid = 30€` each, and `dealerCommission = 0.30`
- **WHEN** the scheduler runs
- **THEN** each attendee gets `commission_amount = 9€` and `host_credited_at` set
- **AND** the host's `available_withdrawal_standard_vat` increases by `63€` (3 × 21€)
- **AND** `events.host_credited_at` is set
- **AND** the host receives the credited-event email

#### Scenario: Event still in grace period
- **GIVEN** a paid event with `finished_at = now - 6 hours`
- **WHEN** the scheduler runs
- **THEN** the event is NOT processed
- **AND** no balances change

#### Scenario: Event with no paid attendees
- **GIVEN** an eligible paid event with zero `event_attendees` in `status='paid'`
- **WHEN** the scheduler runs
- **THEN** `events.host_credited_at` is set anyway (so the event is not retried forever)
- **AND** the host's bucket is unchanged
- **AND** no email is sent

#### Scenario: Excluded event
- **GIVEN** an eligible event with `host_credit_excluded = 1`
- **WHEN** the scheduler runs
- **THEN** the event is skipped on every tick
- **AND** no balance change occurs until the admin reverts the exclusion

### Requirement: Admin exclusion endpoints
The system SHALL expose admin endpoints to mark/unmark events as credit-excluded:
- `POST /api/admin/events/:id/exclude-credit` with body `{ reason: string }` sets `host_credit_excluded=1`.
- `POST /api/admin/events/:id/include-credit` reverts the flag.
Both require admin auth and are logged with the actor and reason.

#### Scenario: Admin excludes an event after partial refunds
- **GIVEN** a paid event in grace period where the admin issued multiple refunds in Stripe
- **WHEN** the admin POSTs to `/exclude-credit` with a reason
- **THEN** the flag is set and the next scheduler tick skips the event
- **AND** the exclusion is logged with the reason and admin id

### Requirement: Event attendees as payable items in the payouts panel
After an event has been credited (`events.host_credited_at IS NOT NULL`), its `event_attendees` rows SHALL appear as payable items of `vat_regime='standard_vat'` in `GET /api/admin/payouts/:sellerId` (Change #2 endpoint), and SHALL be selectable in `preview` / `execute` exactly like `art_order_item` and `other_order_item` rows.

#### Scenario: Attendees show up in the standard_vat bucket
- **GIVEN** an event credited to host X with three attendees, none yet included in any withdrawal
- **WHEN** the admin opens `/admin/payouts/<X>`
- **THEN** the response lists each attendee under the standard_vat bucket with `item_type='event_attendee'` and the same `seller_earning` that was credited to the bucket

#### Scenario: Including event attendees in a payout creates correct withdrawal_items
- **WHEN** the admin executes a payout that includes event attendees
- **THEN** rows are inserted into `withdrawal_items` with `item_type='event_attendee'`, `vat_regime='standard_vat'`, `vat_rate=0.21`
- **AND** the totals reconcile against `withdrawals.taxable_base_total + vat_amount_total`

### Requirement: Seller dashboard surfaces event credit state
The seller dashboard SHALL show, for hosts of paid events, each of their paid events with one of the following states: `Próximamente`, `En espera (24 h de gracia)`, `Acreditado el <fecha>`, `Excluido`. The state is derived from `finished_at`, `host_credited_at`, and `host_credit_excluded`.

#### Scenario: Host views their event states
- **GIVEN** a host with three paid events: one upcoming (no `finished_at`), one finished 6h ago, and one credited yesterday
- **WHEN** the host opens the dashboard
- **THEN** they see the three events with states `Próximamente`, `En espera (24 h de gracia)`, and `Acreditado el <fecha>` respectively
