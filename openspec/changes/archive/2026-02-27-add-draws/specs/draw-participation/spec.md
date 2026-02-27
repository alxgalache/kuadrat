## ADDED Requirements

### Requirement: Draw buyer registration
The system SHALL allow users to register as draw participants via `POST /api/draws/:id/register-buyer`. Registration SHALL accept firstName, lastName, email, and optional delivery/invoicing address fields. The system SHALL generate a 6-character alphanumeric password (using the same character set as auction bid passwords) for returning participant access. If a buyer with the same email already exists for the same draw, the existing buyer record SHALL be returned instead of creating a duplicate.

#### Scenario: New buyer registration
- **WHEN** a user submits registration data for a draw they haven't registered for
- **THEN** a new `draw_buyers` record SHALL be created with a generated password, and the response SHALL include the `drawBuyerId` and `bidPassword`

#### Scenario: Duplicate email registration
- **WHEN** a user submits registration with an email that already has a `draw_buyers` record for the same draw
- **THEN** the existing buyer record SHALL be returned without creating a duplicate

#### Scenario: Registration for non-active draw
- **WHEN** a user attempts to register for a draw with status other than 'active'
- **THEN** the system SHALL return a 400 error indicating the draw is not accepting participants

---

### Requirement: Returning participant verification
The system SHALL allow returning participants to verify their identity via `POST /api/draws/:id/verify-buyer` using their email and password. On successful verification, the response SHALL include the `drawBuyerId` and whether the buyer already has a saved payment method.

#### Scenario: Valid credentials verification
- **WHEN** a returning participant provides correct email and password for a draw
- **THEN** the response SHALL include `drawBuyerId`, `hasPaymentMethod` flag, and `hasParticipation` flag

#### Scenario: Invalid credentials verification
- **WHEN** a participant provides incorrect email or password
- **THEN** the system SHALL return a 401 error

---

### Requirement: Stripe payment authorization for draws
The system SHALL authorize participant payment methods using Stripe SetupIntent (0 EUR authorization) via `POST /api/draws/:id/setup-payment` and `POST /api/draws/:id/confirm-payment`. The flow SHALL be identical to the auction payment authorization: create SetupIntent → return clientSecret → frontend collects card details → confirm and save payment method data.

#### Scenario: Setup payment creates Stripe SetupIntent
- **WHEN** `POST /api/draws/:id/setup-payment` is called with a valid drawBuyerId
- **THEN** the system SHALL create a Stripe SetupIntent and return the `clientSecret`

#### Scenario: Confirm payment saves payment method
- **WHEN** `POST /api/draws/:id/confirm-payment` is called with drawBuyerId and setupIntentId
- **THEN** the system SHALL save the payment method data (name, last_four, stripe IDs) to `draw_authorised_payment_data`

---

### Requirement: Draw entry (participation)
The system SHALL allow registered buyers with authorized payment methods to enter a draw via `POST /api/draws/:id/enter`. Entry SHALL create a `draw_participations` record. The system SHALL enforce uniqueness: one participation per email per draw.

#### Scenario: Successful draw entry
- **WHEN** a registered buyer with an authorized payment method submits entry for an active draw that has not reached max_participations
- **THEN** a `draw_participations` record SHALL be created and the response SHALL confirm the entry

#### Scenario: Duplicate entry attempt
- **WHEN** a buyer who already has a participation record for this draw attempts to enter again
- **THEN** the system SHALL return a 409 error indicating the user has already entered

#### Scenario: Draw at capacity
- **WHEN** a buyer attempts to enter a draw that has reached its max_participations count
- **THEN** the system SHALL return a 400 error indicating the draw is full

#### Scenario: Entry without payment authorization
- **WHEN** a buyer without a saved payment method attempts to enter a draw
- **THEN** the system SHALL return a 400 error indicating payment authorization is required

#### Scenario: Entry for non-active draw
- **WHEN** a buyer attempts to enter a draw with status other than 'active'
- **THEN** the system SHALL return a 400 error indicating the draw is not accepting entries

---

### Requirement: Draw entry confirmation email
The system SHALL send a confirmation email to the participant after successful draw entry. The email SHALL include: the draw name, product name, product image, the participant's name, and their return-access password. The email template SHALL follow the same HTML structure and Spanish language as existing auction bid confirmation emails.

#### Scenario: Email sent after successful entry
- **WHEN** a participant successfully enters a draw
- **THEN** the system SHALL send an email to the participant's registered email address with draw entry confirmation details

#### Scenario: Email includes product image
- **WHEN** the confirmation email is generated
- **THEN** the email body SHALL include the product image URL resolved from the product's basename and type

---

### Requirement: Draw participation modal
The frontend SHALL display a multi-step participation modal (`DrawParticipationModal`) when the user clicks "Inscribirse en el sorteo" on the draw detail page. The modal SHALL follow the same phase-based pattern as `BidModal` with these phases: CHOOSE (new/returning), VERIFY (returning participant auth), TERMS (accept conditions), PERSONAL (name/email), DELIVERY (delivery address), INVOICING (invoice address), PAYMENT (Stripe Elements), CONFIRM (review with product image, price, confirm button), SUCCESS (entry confirmed, show password).

#### Scenario: New participant completes full flow
- **WHEN** a new participant selects "Nuevo participante" and completes all steps through CONFIRM
- **THEN** the system SHALL register the buyer, authorize payment, create the participation, and show the SUCCESS phase with their access password

#### Scenario: Returning participant skips registration steps
- **WHEN** a returning participant verifies with email and password and already has a saved payment method
- **THEN** the modal SHALL skip directly to the CONFIRM phase

#### Scenario: Confirm phase displays product details
- **WHEN** the CONFIRM phase is shown
- **THEN** the modal SHALL display the product image, product name, draw price, and a "Confirmar inscripcion" button

#### Scenario: Modal stores session in localStorage
- **WHEN** a participant completes registration
- **THEN** the modal SHALL store `{ drawBuyerId, bidPassword }` in localStorage keyed by draw ID, so reopening the modal restores the session
