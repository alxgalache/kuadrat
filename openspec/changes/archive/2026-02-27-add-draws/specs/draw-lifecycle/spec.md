## ADDED Requirements

### Requirement: Draw status transitions via scheduler
The scheduler SHALL check draw statuses every 30 seconds (in the same cron job as auctions) and perform automatic transitions: draws with status 'scheduled' whose `start_datetime` has passed SHALL transition to 'active'; draws with status 'active' whose `end_datetime` has passed SHALL transition to 'finished'.

#### Scenario: Scheduled draw auto-starts
- **WHEN** the scheduler runs and finds a draw with status 'scheduled' and `start_datetime <= NOW()`
- **THEN** the draw status SHALL be updated to 'active'

#### Scenario: Active draw auto-finishes
- **WHEN** the scheduler runs and finds a draw with status 'active' and `end_datetime <= NOW()`
- **THEN** the draw status SHALL be updated to 'finished'

#### Scenario: Scheduler does not affect draft or cancelled draws
- **WHEN** the scheduler runs and finds draws with status 'draft' or 'cancelled'
- **THEN** those draws SHALL remain unchanged regardless of their dates

---

### Requirement: Draw start transition
When a draw transitions from 'scheduled' to 'active' (either via scheduler or admin API), the system SHALL log the transition using the structured logger.

#### Scenario: Draw start is logged
- **WHEN** a draw transitions to 'active'
- **THEN** the logger SHALL record `{ drawId, status: 'active', previousStatus: 'scheduled' }`

---

### Requirement: Draw finish transition
When a draw transitions from 'active' to 'finished' (either via scheduler or admin API), the system SHALL log the transition and the final participation count. Winner selection is NOT automated — the admin SHALL select winners manually.

#### Scenario: Draw finish is logged with participation count
- **WHEN** a draw transitions to 'finished'
- **THEN** the logger SHALL record `{ drawId, status: 'finished', participationCount }` where participationCount is the total number of entries

#### Scenario: No automated winner selection
- **WHEN** a draw transitions to 'finished'
- **THEN** the system SHALL NOT automatically select a winner or charge participants. Winner selection is a manual admin action.

---

### Requirement: Draw cancellation
When an admin cancels a draw (via `POST /api/admin/draws/:id/cancel`), the draw status SHALL transition to 'cancelled'. Only draws with status 'draft', 'scheduled', or 'active' can be cancelled.

#### Scenario: Cancel an active draw
- **WHEN** an admin cancels a draw with status 'active'
- **THEN** the draw status SHALL be updated to 'cancelled'

#### Scenario: Cannot cancel a finished draw
- **WHEN** an admin attempts to cancel a draw with status 'finished'
- **THEN** the system SHALL return a 400 error indicating finished draws cannot be cancelled

---

### Requirement: Draw entry confirmation email template
The email service SHALL include a `sendDrawEntryConfirmationEmail()` function that sends an HTML email to participants upon successful draw entry. The template SHALL follow the same structure as `sendBidConfirmationEmail()`: logo attachment, product image, Spanish language text, participant name, draw name, product name, access password, and draw price.

#### Scenario: Entry confirmation email sent
- **WHEN** a participant successfully enters a draw
- **THEN** `sendDrawEntryConfirmationEmail()` SHALL be called with the participant's email, name, draw details, and product info

#### Scenario: Email template uses Spanish language
- **WHEN** the entry confirmation email is generated
- **THEN** all text content SHALL be in Spanish (es-ES)

---

### Requirement: Draw winner notification email template
The email service SHALL include a `sendDrawWinnerEmail()` function that notifies the selected winner. The template SHALL include the draw name, product name, product image, winning price, and next steps for the winner (payment will be charged to their authorized card).

#### Scenario: Winner email sent after selection
- **WHEN** an admin selects a winner for a finished draw
- **THEN** `sendDrawWinnerEmail()` SHALL be called with the winner's email, name, draw details, product info, and price

#### Scenario: Winner email includes product image
- **WHEN** the winner notification email is generated
- **THEN** the email body SHALL include the product image resolved from basename and product_type
