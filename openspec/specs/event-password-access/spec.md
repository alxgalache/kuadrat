# event-password-access Specification

## Purpose

Definir el reacceso a un evento con contraseña para quien ya se registró: generación de la contraseña, email de confirmación, pasos del modal y endpoint de verificación.

## Requirements

### Requirement: Choose step in EventAccessModal

The `EventAccessModal.js` SHALL display an initial CHOOSE phase with two options before any registration or login flow, matching the layout of the `renderChoose` function in `BidModal.js`.

#### Scenario: Modal opens showing choose step
- **WHEN** the user clicks the "Acceder" button on an event page
- **AND** the user does not have a server-validated session for this event
- **THEN** the modal SHALL display two buttons:
  - "Registrarme en el evento" (proceeds to REGISTER phase)
  - "Ya me apunte previamente al evento. Acceder con contraseña" (proceeds to VERIFY_PASSWORD phase)

#### Scenario: User has existing localStorage session
- **WHEN** the user opens an event page
- **AND** localStorage contains an `event_attendee_{eventId}` entry
- **THEN** the page SHALL validate it with `POST /api/events/:id/session` before granting access (see `event-session-validation`)
- **AND** a rejected session SHALL be removed and the "Acceder" button shown, so the CHOOSE step is reachable again

### Requirement: Password-based re-access for returning attendees

The system SHALL allow returning attendees to regain access to an event by entering their email address and the access password they received via email during initial registration. The email SHALL be normalised (trimmed, lower-cased) on the server before lookup.

#### Scenario: Valid email and password
- **WHEN** a returning attendee enters their email and access password in the VERIFY_PASSWORD phase
- **AND** the email and password match a registered attendee for this event
- **THEN** the system SHALL return the attendee data (attendeeId, accessToken)
- **AND** store the session in localStorage as `event_attendee_{eventId}`
- **AND** grant access to the event (close the modal and show event content)

#### Scenario: Invalid password
- **WHEN** a returning attendee enters their email with an incorrect password
- **THEN** the system SHALL return a 401 error with message "Contraseña incorrecta"
- **AND** the attendee SHALL remain on the VERIFY_PASSWORD phase to retry
- **AND** the client SHALL call this endpoint with `skipAuthHandling`, so the 401 does not clear the user's login or redirect to the home page

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

The system SHALL send a confirmation email to the attendee after successful registration, containing the access password. The email template SHALL follow the same structure as `sendBidConfirmationEmail` in `emailService.js`. `sendEventConfirmationEmail` SHALL receive the event row, not only its title, so the email can carry the date, the link and the calendar buttons. Every attendee- or admin-written value interpolated into the HTML (first name, event title) SHALL be escaped with `escapeForEmail`.

The email SHALL contain, in this order:

- Greeting with the attendee's first name.
- Event title.
- The event's date and time, in the event's time zone (see `event-calendar-links`), labelled as peninsular Spanish time, for example «martes, 20 de octubre de 2026, 19:00 (hora peninsular española)».
- Amount paid, for a paid event.
- The access password displayed prominently (amber box, large font, matching the auction email style), with instructions to save it.
- An access section:
  - an introductory sentence: «Cuando empiece el evento, podrás acceder pulsando este botón:»;
  - a «Ir al evento» button linking to `<CLIENT_URL>/live/<slug>`, with no visible copy of the URL;
  - a line explaining that, from another device or browser, the attendee enters through «Acceder con contraseña» on the event page, with their email and the password above. It names only the modal's button, because the page button that opens the modal reads «Registrarse» before the start and «Acceder» during the event.
- The calendar button row defined in `event-calendar-links`.

The calendar row and the date line SHALL be omitted when the event's start cannot be interpreted. The email SHALL still be sent with everything else.

#### Scenario: Confirmation email for free event
- **WHEN** an attendee successfully completes registration for a free event
- **THEN** the system SHALL send an email containing:
  - Greeting with the attendee's first name
  - Event title
  - The event's date and time in peninsular Spanish time
  - The access password displayed prominently
  - Instructions to save the password for future access from other devices
  - The «Ir al evento» button linking to `<CLIENT_URL>/live/<slug>`
  - The instructions to enter from another device through «Acceder con contraseña»
  - The Google Calendar, Outlook and Apple buttons

#### Scenario: Confirmation email for paid event
- **WHEN** an attendee successfully completes registration and payment for a paid event
- **THEN** the system SHALL send an email containing everything listed for a free event
- **AND** the amount paid

#### Scenario: Attendee-written values are escaped
- **WHEN** an attendee registers with the first name `<b>Ana</b>`
- **THEN** the email HTML SHALL contain `&lt;b&gt;Ana&lt;&#x2F;b&gt;` and SHALL NOT contain `<b>Ana</b>`

#### Scenario: Password stays out of every link
- **WHEN** the confirmation email is sent with the access password `ABC234`
- **THEN** `ABC234` SHALL appear in the password box
- **AND** no `href` in the email SHALL contain `ABC234`

#### Scenario: Unreadable event date
- **WHEN** the event's `event_datetime` cannot be interpreted
- **THEN** the email SHALL be sent without the date line and without the calendar row
- **AND** SHALL still contain the password and the access section

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
- **WHEN** the attendee selects "Ya me apunte previamente al evento. Acceder con contraseña" from the CHOOSE step
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
