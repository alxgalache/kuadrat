## MODIFIED Requirements

### Requirement: Send event confirmation email with password

The system SHALL send a confirmation email to the attendee after successful registration, containing the access password. The email template SHALL follow the same structure as `sendBidConfirmationEmail` in `emailService.js`. `sendEventConfirmationEmail` SHALL receive the event row, not only its title, so the email can carry the date, the link and the calendar buttons. Every attendee- or admin-written value interpolated into the HTML (first name, event title) SHALL be escaped with `escapeForEmail`.

The email SHALL contain, in this order:

- Greeting with the attendee's first name.
- Event title.
- The event's date and time, in the event's time zone (see `event-calendar-links`), labelled as peninsular Spanish time, for example «martes, 20 de octubre de 2026, 19:00 (hora peninsular española)».
- Amount paid, for a paid event.
- The access password displayed prominently (amber box, large font, matching the auction email style), with instructions to save it.
- An access section:
  - an introductory sentence: «Cuando empiece el evento, podrás acceder desde este enlace:»;
  - a «Ir al evento» button linking to `<CLIENT_URL>/live/<slug>`;
  - the same URL as visible text;
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
  - The «Ir al evento» button and the visible URL `<CLIENT_URL>/live/<slug>`
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
