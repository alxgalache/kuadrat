## ADDED Requirements

### Requirement: Choose step in EventAccessModal

The `EventAccessModal.js` SHALL display an initial CHOOSE phase with two options before any registration or login flow, matching the layout of the `renderChoose` function in `BidModal.js`.

#### Scenario: Modal opens showing choose step
- **WHEN** the user clicks the "Acceder" button on an event page
- **AND** the user does not have a valid session in localStorage for this event
- **THEN** the modal SHALL display two buttons:
  - "Registrarme en el evento" (proceeds to REGISTER phase)
  - "Ya me apunte previamente al evento. Acceder con contrasena" (proceeds to VERIFY_PASSWORD phase)

#### Scenario: User has existing localStorage session
- **WHEN** the user clicks the "Acceder" button on an event page
- **AND** the user has a valid `event_attendee_{eventId}` entry in localStorage
- **THEN** the modal SHALL NOT show the CHOOSE step and SHALL grant access directly (existing behavior)

### Requirement: Password-based re-access for returning attendees

The system SHALL allow returning attendees to regain access to an event by entering their email address and the access password they received via email during initial registration.

#### Scenario: Valid email and password
- **WHEN** a returning attendee enters their email and access password in the VERIFY_PASSWORD phase
- **AND** the email and password match a registered attendee for this event
- **THEN** the system SHALL return the attendee data (attendeeId, accessToken)
- **AND** store the session in localStorage as `event_attendee_{eventId}`
- **AND** grant access to the event (close the modal and show event content)

#### Scenario: Invalid password
- **WHEN** a returning attendee enters their email with an incorrect password
- **THEN** the system SHALL return a 401 error with message "Contrasena incorrecta"
- **AND** the attendee SHALL remain on the VERIFY_PASSWORD phase to retry

#### Scenario: Email not found
- **WHEN** a returning attendee enters an email that is not registered for this event
- **THEN** the system SHALL return a 404 error with message "No se encontro un registro con este correo electronico"
- **AND** the attendee SHALL remain on the VERIFY_PASSWORD phase

#### Scenario: Attendee without password (legacy registration)
- **WHEN** a returning attendee enters their email
- **AND** the attendee record exists but has no `access_password` (registered before this feature)
- **THEN** the system SHALL return a 404 error with message "No se encontro un registro con este correo electronico"

### Requirement: Generate access password on successful registration

The system SHALL generate a 6-character alphanumeric access password for each new event attendee upon successful completion of all registration steps. The password SHALL be stored in the `event_attendees.access_password` column.

#### Scenario: Password generation for free event
- **WHEN** an attendee completes email verification for a free event
- **THEN** the system SHALL generate a 6-character alphanumeric password (uppercase + digits, excluding ambiguous characters 0/O/1/I/L)
- **AND** store the password in the attendee record
- **AND** send a confirmation email containing the password
- **AND** display the password in the SUCCESS phase of the modal

#### Scenario: Password generation for paid event
- **WHEN** an attendee completes email verification AND payment confirmation for a paid event
- **THEN** the system SHALL generate a 6-character alphanumeric password
- **AND** store the password in the attendee record
- **AND** send a confirmation email containing the password
- **AND** display the password in the SUCCESS phase of the modal

### Requirement: Send event confirmation email with password

The system SHALL send a confirmation email to the attendee after successful registration, containing the access password. The email template SHALL follow the same structure as `sendBidConfirmationEmail` in `emailService.js`.

#### Scenario: Confirmation email for free event
- **WHEN** an attendee successfully completes registration for a free event
- **THEN** the system SHALL send an email containing:
  - Greeting with the attendee's first name
  - Event title
  - The access password displayed prominently (amber box, large monospace font, matching auction email style)
  - Instructions to save the password for future access from other devices

#### Scenario: Confirmation email for paid event
- **WHEN** an attendee successfully completes registration and payment for a paid event
- **THEN** the system SHALL send an email containing:
  - Greeting with the attendee's first name
  - Event title
  - Amount paid
  - The access password displayed prominently
  - Instructions to save the password for future access from other devices

### Requirement: Display password in SUCCESS phase

The SUCCESS phase of `EventAccessModal.js` SHALL display the generated access password to the attendee with instructions to save it, matching the pattern in `BidModal.js` success phase.

#### Scenario: SUCCESS phase shows password
- **WHEN** the modal transitions to the SUCCESS phase after completing registration
- **THEN** the system SHALL display the access password in a prominent, highlighted box
- **AND** show a message instructing the user to save the password for future access
- **AND** show a "Cerrar" button to dismiss the modal

### Requirement: VERIFY_PASSWORD UI in EventAccessModal

The VERIFY_PASSWORD phase SHALL display a form with email and password fields, a submit button, and a back button to return to the CHOOSE phase.

#### Scenario: VERIFY_PASSWORD phase display
- **WHEN** the attendee selects "Ya me apunte previamente al evento. Acceder con contrasena" from the CHOOSE step
- **THEN** the modal SHALL display:
  - An email input field
  - A password input field
  - A "Acceder" submit button
  - A back button to return to the CHOOSE step

#### Scenario: Loading state during password verification
- **WHEN** the attendee submits the email and password
- **THEN** the submit button SHALL show a loading state until the API responds

### Requirement: Backend password verification endpoint

The system SHALL provide a `POST /api/events/:id/verify-password` endpoint that verifies an attendee's email and access password combination.

#### Scenario: Successful password verification
- **WHEN** a POST request is made with a valid email and matching access_password
- **THEN** the system SHALL generate a new access token for the attendee
- **AND** update the `access_token_hash` in the database
- **AND** return the attendee data including the new accessToken

#### Scenario: Rate limiting on password verification
- **WHEN** more than the allowed number of password verification attempts are made from the same IP
- **THEN** the system SHALL return a 429 error
