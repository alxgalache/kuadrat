## MODIFIED Requirements

### Requirement: Draw buyer registration
The system SHALL allow users to register as draw participants via `POST /api/draws/:id/register-buyer`. Registration SHALL require a `verificationToken` returned by `POST /api/draws/:id/verify-email` for the same draw, not older than 60 minutes. The email in the body SHALL be normalised and SHALL equal the email that token was issued for. Registration SHALL accept firstName, lastName, email, dni, and optional delivery/invoicing address fields. The system SHALL NOT generate or store a `bid_password`. If a buyer with the same email already exists for the same draw, the existing buyer record SHALL be returned instead of creating a duplicate. That is only possible after the token has proven ownership of that email. The client IP address SHALL be stored in the `ip_address` column.

#### Scenario: New buyer registration
- **WHEN** a user submits registration data with a valid `verificationToken` for a draw they haven't registered for
- **THEN** a new `draw_buyers` record SHALL be created with the provided DNI and IP address, and the response SHALL include the `drawBuyerId` (no password in response)

#### Scenario: Duplicate email registration
- **WHEN** a user submits registration with a valid `verificationToken` and an email that already has a `draw_buyers` record for the same draw
- **THEN** the existing buyer record SHALL be returned without creating a duplicate

#### Scenario: Registration without verification
- **WHEN** `register-buyer` is called without a `verificationToken`, or with one that is unknown, expired, issued for another draw or issued for another email
- **THEN** the system SHALL answer 403 with title `VERIFICATION_REQUIRED` and message «Verifica tu email antes de continuar»
- **AND** no `draw_buyers` record SHALL be created or returned

#### Scenario: Registration for non-active draw
- **WHEN** a user attempts to register for a draw with status other than 'active'
- **THEN** the system SHALL return a 400 error indicating the draw is not accepting participants

### Requirement: Confirm payment stores stripe_customer_id
The draw payment confirmation flow SHALL store the Stripe customer of the confirmed SetupIntent in `draw_authorised_payment_data.stripe_customer_id`. The value SHALL be taken from the SetupIntent, never from the request body, and only after the SetupIntent passes the checks in `payment-confirmation-binding`.

#### Scenario: Frontend confirms the SetupIntent
- **WHEN** a participant confirms payment in `DrawParticipationModal.js`
- **THEN** `handlePaymentSuccess` calls `drawsAPI.confirmPayment(drawId, drawBuyerId, setupIntentId)`, which sends `{ drawBuyerId, setupIntentId }` to `POST /api/draws/:id/confirm-payment`

#### Scenario: Backend stores the SetupIntent's customer
- **WHEN** the backend confirms a succeeded SetupIntent bound to that buyer and draw
- **THEN** `draw_authorised_payment_data.stripe_customer_id` SHALL hold `setupIntent.customer`
- **AND** a `customerId` field in the body, if present, SHALL be ignored
