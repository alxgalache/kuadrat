## MODIFIED Requirements

### Requirement: The modal stores the session only when access is granted

`EventAccessModal` SHALL write `event_attendee_{eventId}` to localStorage, and call `onAccessGranted`, only in these four cases:

- after `verify-email` returns `paymentRequired: false`;
- after `identity/complete` returns `paymentRequired: false` (see `event-identity-provider-verification`);
- after `confirm-payment` succeeds;
- after `verify-password` succeeds.

It SHALL NOT write the session after `register`, after leaving for an identity provider or on returning from it before `identity/complete` answers, and it SHALL NOT call `onAccessGranted` without a token in hand.

#### Scenario: Closing the modal during VERIFY_EMAIL
- **WHEN** the attendee closes the modal or reloads during VERIFY_EMAIL
- **THEN** localStorage SHALL contain no session for the event and the event page SHALL show «Acceder»

#### Scenario: Closing the modal during PAYMENT
- **WHEN** the attendee verifies the email for a paid event and reloads during PAYMENT
- **THEN** localStorage SHALL contain no session for the event
- **AND** registering again with the same email SHALL lead to VERIFY_EMAIL and then back to PAYMENT

#### Scenario: Abandoning the provider screen
- **WHEN** the attendee leaves for Google and closes the tab without choosing an account
- **THEN** localStorage SHALL contain no session for the event, and the attendee row (if any) SHALL have no credential

#### Scenario: Provider verification for a free event
- **WHEN** `identity/complete` returns `paymentRequired: false`
- **THEN** the modal SHALL store `{ attendeeId, accessToken, firstName, lastName }` from that response and transition to SUCCESS

## ADDED Requirements

### Requirement: The email form is one of the verification methods

The REGISTER phase (name, surname and email, then the 6-digit code) SHALL be reached from the METHOD phase through the «Recibir un código por email» card, or from a provider return with `IDENTITY_EMAIL_UNTRUSTED`. It SHALL NOT show the terms checkbox, which is accepted in METHOD, and its «Volver» link SHALL lead back to METHOD. The rest of the email flow (`register`, `send-verification`, `verify-email`, cooldown, attempts and capacity) SHALL stay unchanged.

#### Scenario: Email code after accepting the terms
- **WHEN** the attendee accepts the terms in METHOD, picks the email card and submits name, surname and email
- **THEN** the code is sent and the modal transitions to VERIFY_EMAIL exactly as before this change

#### Scenario: Provider email that must be confirmed by code
- **WHEN** the modal opens with `IDENTITY_EMAIL_UNTRUSTED`
- **THEN** REGISTER is shown with the notice, empty fields and no checkbox
- **AND** the terms SHALL count as accepted, because starting the provider flow required ticking the checkbox in METHOD
