## MODIFIED Requirements

### Requirement: Choose step in EventAccessModal

The `EventAccessModal.js` SHALL display an initial CHOOSE phase with two options before any registration or login flow, matching the layout of the `renderChoose` function in `BidModal.js`. Registering SHALL go through the METHOD phase (see `event-verification-methods`), where the attendee picks how to prove their email (Google, Microsoft or a code by email) and accepts the terms, before any form or provider screen.

#### Scenario: Modal opens showing choose step
- **WHEN** the user clicks the "Acceder" button on an event page
- **AND** the user does not have a server-validated session for this event
- **THEN** the modal SHALL display two buttons:
  - "Registrarme en el evento" (proceeds to the METHOD phase)
  - "Ya me apunte previamente al evento. Acceder con contraseña" (proceeds to VERIFY_PASSWORD phase)

#### Scenario: User has existing localStorage session
- **WHEN** the user opens an event page
- **AND** localStorage contains an `event_attendee_{eventId}` entry
- **THEN** the page SHALL validate it with `POST /api/events/:id/session` before granting access (see `event-session-validation`)
- **AND** a rejected session SHALL be removed and the "Acceder" button shown, so the CHOOSE step is reachable again

#### Scenario: Returning from an identity provider
- **WHEN** the event page loads with the `#acceso` or `#acceso-error=<CODE>` fragment
- **THEN** the modal SHALL open directly in the COMPLETING or METHOD phase, without showing CHOOSE first
