## MODIFIED Requirements

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
