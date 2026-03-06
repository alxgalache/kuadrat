## ADDED Requirements

### Requirement: Send email verification code during event registration

The system SHALL send a 6-digit numeric OTP code to the attendee's email address after they submit their personal data (name + email) during event registration. The code SHALL be hashed (SHA256) before storage and SHALL expire after 10 minutes.

#### Scenario: Successful OTP send for new registration
- **WHEN** an attendee submits their name and email in the event registration modal
- **AND** the attendee clicks the button to send the verification code
- **THEN** the system SHALL generate a random 6-digit numeric code
- **AND** store the SHA256 hash of the code and an expiry timestamp (current time + 10 minutes) in the `event_attendees` record
- **AND** send an email to the provided address containing the 6-digit code
- **AND** transition the modal to the VERIFY_EMAIL phase

#### Scenario: OTP send for already-registered email
- **WHEN** an attendee submits an email that already exists as a registered attendee for this event
- **AND** the existing attendee has already completed registration (has an access password)
- **THEN** the system SHALL inform the user that they are already registered and suggest using the password access option

#### Scenario: Rate limiting on OTP send
- **WHEN** an attendee requests an OTP code more than the allowed rate limit
- **THEN** the system SHALL return a 429 error with an appropriate message

### Requirement: Verify email OTP code

The system SHALL verify the 6-digit OTP code entered by the attendee against the stored hash. Upon successful verification, the `email_verified` flag SHALL be set to 1 and the OTP fields SHALL be cleared.

#### Scenario: Valid OTP code entered
- **WHEN** the attendee enters the correct 6-digit code
- **AND** the code has not expired
- **THEN** the system SHALL set `email_verified = 1` on the attendee record
- **AND** clear `verification_code_hash` and `verification_code_expires_at`
- **AND** transition the modal to the next phase (PAYMENT for paid events, SUCCESS for free events)

#### Scenario: Invalid OTP code entered
- **WHEN** the attendee enters an incorrect 6-digit code
- **THEN** the system SHALL return a 400 error with message "Codigo de verificacion incorrecto"
- **AND** the attendee SHALL remain on the VERIFY_EMAIL phase to retry

#### Scenario: Expired OTP code
- **WHEN** the attendee enters the correct code but after the 10-minute expiry
- **THEN** the system SHALL return a 400 error with message "El codigo ha expirado. Solicita uno nuevo"
- **AND** the attendee SHALL remain on the VERIFY_EMAIL phase

### Requirement: Resend verification code

The system SHALL allow attendees to request a new OTP code, replacing the previous one. A resend button SHALL be available after a 30-second cooldown.

#### Scenario: Resend after cooldown
- **WHEN** the attendee clicks "Reenviar codigo" after 30 seconds have passed since the last send
- **THEN** the system SHALL generate a new 6-digit code, update the hash and expiry in the database, and send a new email
- **AND** reset the 30-second cooldown timer in the UI

#### Scenario: Resend before cooldown
- **WHEN** the attendee attempts to resend before 30 seconds have elapsed
- **THEN** the resend button SHALL remain disabled with a countdown indicator

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
