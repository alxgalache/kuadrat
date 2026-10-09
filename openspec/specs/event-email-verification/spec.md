# event-email-verification Specification

## Purpose

Definir la verificación del email por código durante el registro en un evento: envío, comprobación y reenvío del código, interfaz en `EventAccessModal` y guardado de la sesión solo con acceso concedido.

## Requirements

### Requirement: Send email verification code during event registration

The system SHALL send a 6-digit numeric OTP code to the attendee's email address after they submit their personal data (name + email) during event registration. The code SHALL be generated with a CSPRNG, hashed (SHA256) before storage and SHALL expire after 10 minutes. Sending a new code SHALL reset `verification_attempts` to 0 and record `verification_sent_at`. The server SHALL refuse a new send within 30 seconds of the previous one for the same attendee (see `email-otp-security`).

#### Scenario: Successful OTP send for new registration
- **WHEN** an attendee submits their name and email in the event registration modal
- **AND** the attendee clicks the button to send the verification code
- **THEN** the system SHALL generate a random 6-digit numeric code
- **AND** store the SHA256 hash of the code and an expiry timestamp (current time + 10 minutes) in the `event_attendees` record
- **AND** send an email to the provided address containing the 6-digit code
- **AND** transition the modal to the VERIFY_EMAIL phase

#### Scenario: OTP send for already-registered email
- **WHEN** an attendee submits an email that already exists as an attendee for this event, whatever its status or verification state
- **THEN** the system SHALL send a new OTP code to that email exactly as for a new registration
- **AND** the modal SHALL transition to the VERIFY_EMAIL phase, with no access granted and no SUCCESS phase shown before the code is verified

#### Scenario: Re-registering within the resend cooldown
- **WHEN** an attendee reloads the page during the VERIFY_EMAIL phase and registers again with the same email within 30 seconds
- **THEN** `send-verification` SHALL answer 400 `OTP_RESEND_TOO_SOON`
- **AND** the modal SHALL still transition to the VERIFY_EMAIL phase with the message «Ya te enviamos un código hace unos segundos. Revisa tu correo.», since the previous code remains valid

#### Scenario: Rate limiting on OTP send
- **WHEN** an attendee requests an OTP code more than the allowed rate limit
- **THEN** the system SHALL return a 429 error with an appropriate message

### Requirement: Verify email OTP code

The system SHALL verify the 6-digit OTP code entered by the attendee against the stored hash, in constant time. Verification is the proof of email ownership, and SHALL be the only step that issues an attendee credential. Upon successful verification, in a single conditional `UPDATE`, the system SHALL:

- set `email_verified = 1`;
- issue a fresh access token, storing only its SHA256 in `access_token_hash`;
- clear `verification_code_hash`, `verification_code_expires_at` and `verification_attempts`.

That `UPDATE` SHALL only apply while the event has capacity for a row that is not yet verified: `max_attendees` is null, or the number of verified non-staff attendees with `status IN ('registered','paid','joined')` is below it. A row that was already verified keeps its seat and is exempt. The response SHALL be `{ attendeeId, accessToken, paymentRequired, accessPassword? }`.

#### Scenario: Valid OTP code entered for a free event
- **WHEN** the attendee enters the correct 6-digit code
- **AND** the code has not expired
- **AND** the event has capacity
- **THEN** the system SHALL set `email_verified = 1`, issue a new access token and clear the OTP fields
- **AND** return `accessToken`, `paymentRequired: false` and the attendee's `accessPassword`, reusing an existing one or generating one if the row has none
- **AND** send the confirmation email containing that password
- **AND** the modal SHALL store the session in localStorage and transition to SUCCESS

#### Scenario: Valid OTP code entered for a paid event
- **WHEN** the attendee enters the correct code for a paid event they have not paid yet
- **THEN** the system SHALL verify the email and issue the token as above, and return `paymentRequired: true` without a password
- **AND** the modal SHALL keep the token in memory, NOT store the session yet, and transition to PAYMENT

#### Scenario: Returning attendee re-verifies from another device
- **WHEN** an already-verified attendee registers again from another device and enters the correct code
- **THEN** the system SHALL issue a new access token, which replaces the previous one, and return their existing password
- **AND** the capacity check SHALL NOT apply to them

#### Scenario: Event filled between registration and verification
- **WHEN** the attendee enters the correct code, but the event reached `max_attendees` verified attendees after they registered
- **THEN** the system SHALL answer 409 with title `EVENT_FULL` and message «Aforo completo»
- **AND** the row SHALL stay unverified and without a credential

#### Scenario: Invalid OTP code entered
- **WHEN** the attendee enters an incorrect 6-digit code
- **THEN** the system SHALL increment `verification_attempts` and return a 400 error with title `OTP_INVALID` and message «Código de verificación incorrecto»
- **AND** the attendee SHALL remain on the VERIFY_EMAIL phase to retry

#### Scenario: Expired OTP code
- **WHEN** the attendee enters the correct code but after the 10-minute expiry
- **THEN** the system SHALL return a 400 error with title `OTP_EXPIRED` and message «El código ha expirado. Solicita uno nuevo»
- **AND** the attendee SHALL remain on the VERIFY_EMAIL phase

#### Scenario: Too many attempts
- **WHEN** the row has 5 failed attempts for the current code
- **THEN** the system SHALL reject any code with 400 `OTP_TOO_MANY_ATTEMPTS` until a new code is sent

### Requirement: Resend verification code

The system SHALL allow attendees to request a new OTP code, replacing the previous one. A resend button SHALL be available after a 30-second cooldown, and the server SHALL enforce the same cooldown.

#### Scenario: Resend after cooldown
- **WHEN** the attendee clicks "Reenviar codigo" after 30 seconds have passed since the last send
- **THEN** the system SHALL generate a new 6-digit code, update the hash and expiry in the database, reset `verification_attempts` and send a new email
- **AND** reset the 30-second cooldown timer in the UI

#### Scenario: Resend before cooldown
- **WHEN** the attendee attempts to resend before 30 seconds have elapsed
- **THEN** the resend button SHALL remain disabled with a countdown indicator
- **AND** a direct API call SHALL be refused with 400 `OTP_RESEND_TOO_SOON`

### Requirement: Email verification UI in EventAccessModal

The VERIFY_EMAIL phase in `EventAccessModal.js` SHALL display a form with a 6-digit code input field, a submit button, and a resend button with countdown timer. The layout SHALL match the email verification step in `DrawParticipationModal.js`.

#### Scenario: VERIFY_EMAIL phase display
- **WHEN** the modal transitions to the VERIFY_EMAIL phase
- **THEN** the system SHALL display a message indicating that a code was sent to the attendee's email
- **AND** show a 6-digit input field
- **AND** show a "Verificar" submit button
- **AND** show a "Reenviar codigo" button (initially disabled with 30-second countdown)

#### Scenario: Loading state during verification
- **WHEN** the attendee submits the OTP code
- **THEN** the submit button SHALL show a loading state until the API responds

### Requirement: The modal stores the session only when access is granted

`EventAccessModal` SHALL write `event_attendee_{eventId}` to localStorage, and call `onAccessGranted`, only in these three cases:

- after `verify-email` returns `paymentRequired: false`;
- after `confirm-payment` succeeds;
- after `verify-password` succeeds.

It SHALL NOT write the session after `register`, and it SHALL NOT call `onAccessGranted` without a token in hand.

#### Scenario: Closing the modal during VERIFY_EMAIL
- **WHEN** the attendee closes the modal or reloads during VERIFY_EMAIL
- **THEN** localStorage SHALL contain no session for the event and the event page SHALL show «Acceder»

#### Scenario: Closing the modal during PAYMENT
- **WHEN** the attendee verifies the email for a paid event and reloads during PAYMENT
- **THEN** localStorage SHALL contain no session for the event
- **AND** registering again with the same email SHALL lead to VERIFY_EMAIL and then back to PAYMENT
