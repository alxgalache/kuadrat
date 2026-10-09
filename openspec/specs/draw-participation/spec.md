# draw-participation Specification

## Purpose

Definir la participación en un sorteo: registro del participante, modal de participación, email de confirmación y guardado del cliente de Stripe al confirmar el pago.

## Requirements

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

### Requirement: Draw participation modal
The frontend SHALL display a multi-step participation modal (`DrawParticipationModal`) when the user clicks "Inscribirse en el sorteo" on the draw detail page. The modal SHALL open directly into the TERMS phase with the following flow: TERMS (accept conditions) → PERSONAL (name, email, DNI + email OTP verification) → DELIVERY (delivery address) → INVOICING (invoice address) → PAYMENT (Stripe Elements) → CONFIRM (review and confirm) → SUCCESS (auto-close). The CHOOSE and VERIFY phases SHALL NOT exist.

#### Scenario: New participant completes full flow
- **WHEN** a new participant accepts terms and completes all steps through CONFIRM
- **THEN** the system SHALL register the buyer, verify email via OTP, authorize payment, create the participation, and show the SUCCESS phase

#### Scenario: No returning participant flow
- **WHEN** the modal opens
- **THEN** the modal SHALL display the TERMS phase directly — no CHOOSE phase with "Ya me registré antes" / "Nuevo participante" buttons SHALL be shown

#### Scenario: PERSONAL step includes DNI and email verification
- **WHEN** the PERSONAL step is displayed
- **THEN** the form SHALL include fields for firstName, lastName, email, and DNI. After submission, the system SHALL validate the DNI, check uniqueness, send an email OTP, and display an inline code input for verification before proceeding

#### Scenario: Confirm phase displays product details
- **WHEN** the CONFIRM phase is shown
- **THEN** the modal SHALL display the product image, product name, draw price, and a "Confirmar inscripción" button

#### Scenario: SUCCESS phase auto-closes with notification
- **WHEN** the SUCCESS phase is reached after successful entry
- **THEN** the modal SHALL display a green checkmark and success message, auto-close after 2 seconds, and trigger a BannerNotification with "Te has inscrito correctamente en el sorteo"

#### Scenario: No password displayed anywhere
- **WHEN** any phase of the modal is displayed
- **THEN** no password, access code, or `bid_password` SHALL be shown or referenced

#### Scenario: No localStorage session recovery
- **WHEN** the modal opens and a previous localStorage session exists for this draw
- **THEN** the modal SHALL NOT skip to the CONFIRM phase — it SHALL always start from TERMS

### Requirement: Stripe payment authorization for draws
The system SHALL authorize the participant's payment method with a Stripe SetupIntent (a 0 EUR authorization) through `POST /api/draws/:id/setup-payment` and `POST /api/draws/:id/confirm-payment`, the same flow as the auction payment authorization: create the SetupIntent, return its `clientSecret`, collect the card in the frontend, then confirm and save the payment method data. A `drawBuyerId` that does not belong to the draw SHALL be answered with 404.

#### Scenario: Setup payment creates Stripe SetupIntent
- **WHEN** `POST /api/draws/:id/setup-payment` is called with a `drawBuyerId` of that draw
- **THEN** the system SHALL create a Stripe SetupIntent and return its `clientSecret`

#### Scenario: Confirm payment saves payment method
- **WHEN** `POST /api/draws/:id/confirm-payment` is called with the `drawBuyerId` and the `setupIntentId`
- **THEN** the system SHALL save the payment method data (name, last four digits, Stripe ids) in `draw_authorised_payment_data`

### Requirement: Draw entry (participation)
The system SHALL let a registered buyer with an authorized payment method enter a draw through `POST /api/draws/:id/enter`, which creates a `draw_participations` row and sends the entry confirmation email without blocking the response. `drawService.enterDraw` SHALL refuse the entry when the draw is not active, the buyer already entered, the draw is full or there is no payment authorization; the controller answers every such refusal with 400 and its message.

#### Scenario: Successful draw entry
- **WHEN** a registered buyer with an authorized payment method enters an active draw that has not reached `max_participations`
- **THEN** a `draw_participations` row SHALL be created and the response SHALL be 200 with the participation id and date

#### Scenario: Duplicate entry attempt
- **WHEN** a buyer who already has a participation in the draw tries to enter again
- **THEN** the response SHALL be 400 with "Ya estás inscrito en este sorteo"

#### Scenario: Draw at capacity
- **WHEN** a buyer tries to enter a draw that has reached `max_participations`
- **THEN** the response SHALL be 400 with "El sorteo ha alcanzado el máximo de participantes"

#### Scenario: Entry without payment authorization
- **WHEN** a buyer without a saved payment method tries to enter
- **THEN** the response SHALL be 400 with "Se requiere autorización de pago para participar"

#### Scenario: Entry for non-active draw
- **WHEN** a buyer tries to enter a draw whose status is not `active`
- **THEN** the response SHALL be 400 with "El sorteo no está activo"

#### Scenario: Buyer of another draw
- **WHEN** the `drawBuyerId` belongs to a different draw
- **THEN** the response SHALL be 404

### Requirement: Draw entry confirmation email
The system SHALL send a confirmation email to the participant after successful draw entry. The email SHALL include: the draw name, product name, product image, and the participant's name. The email SHALL NOT include any password or access code. The email template SHALL follow the same HTML structure and Spanish language as existing email templates.

#### Scenario: Email sent after successful entry
- **WHEN** a participant successfully enters a draw
- **THEN** the system SHALL send an email to the participant's registered email address with draw entry confirmation details

#### Scenario: Email does not include password
- **WHEN** the confirmation email is generated
- **THEN** the email body SHALL NOT contain any password, access code, or `bid_password` references

#### Scenario: Email includes product image
- **WHEN** the confirmation email is generated
- **THEN** the email body SHALL include the product image URL resolved from the product's basename and type

### Requirement: Confirm payment stores stripe_customer_id
The draw payment confirmation flow SHALL store the Stripe customer of the confirmed SetupIntent in `draw_authorised_payment_data.stripe_customer_id`. The value SHALL be taken from the SetupIntent, never from the request body, and only after the SetupIntent passes the checks in `payment-confirmation-binding`.

#### Scenario: Frontend confirms the SetupIntent
- **WHEN** a participant confirms payment in `DrawParticipationModal.js`
- **THEN** `handlePaymentSuccess` calls `drawsAPI.confirmPayment(drawId, drawBuyerId, setupIntentId)`, which sends `{ drawBuyerId, setupIntentId }` to `POST /api/draws/:id/confirm-payment`

#### Scenario: Backend stores the SetupIntent's customer
- **WHEN** the backend confirms a succeeded SetupIntent bound to that buyer and draw
- **THEN** `draw_authorised_payment_data.stripe_customer_id` SHALL hold `setupIntent.customer`
- **AND** a `customerId` field in the body, if present, SHALL be ignored
