## Why

Users who register for live events lose access if they clear browser data or switch devices, because access is tied to a random token stored only in localStorage. There is no mechanism to recover access without re-registering (and potentially re-paying). Additionally, there is no email verification step, so users can register with typos in their email and never receive event communications.

## What Changes

- Add an email verification step (6-digit OTP code) to the event registration flow, inserted between the personal data collection and the payment/confirmation step. Reuses the same pattern already implemented for draws in `DrawParticipationModal.js`.
- Add a password-based re-access system for events, matching the pattern used for auctions in `BidModal.js`. A password is generated upon successful registration, sent to the user via email, and can be used to regain access from any device.
- Add an initial "choose" step to the EventAccessModal with two options: "Registrarme en el evento" (new registration) and "Ya me apunte previamente al evento. Acceder con contrasena" (returning with password), matching the `renderChoose` pattern from `BidModal.js`.
- Add a backend endpoint for verifying event attendee passwords.
- Add a backend endpoint for sending and verifying email OTP codes for events.
- Send a confirmation email with the access password after successful event registration (following the `sendBidConfirmationEmail` pattern).

## Capabilities

### New Capabilities
- `event-email-verification`: Email OTP verification during event registration, reusing the same 6-digit code pattern from draws. Covers sending, verifying, and resending OTP codes for event attendees.
- `event-password-access`: Password-based re-access system for events. Covers password generation on registration, password delivery via confirmation email, and password-based login for returning attendees.

### Modified Capabilities
<!-- No existing event specs to modify -->

## Impact

- **Database:** `event_attendees` table needs new columns: `access_password` (to store the generated password), `email_verified` (to track verification status), `verification_code_hash` and `verification_code_expires_at` (for OTP).
- **Backend:**
  - `api/services/eventService.js` — new functions: password generation, OTP send/verify, password verification
  - `api/controllers/eventController.js` — new endpoints: send-verification, verify-email, verify-password
  - `api/services/emailService.js` — new function: `sendEventConfirmationEmail` (with password, based on `sendBidConfirmationEmail`)
  - `api/routes/eventRoutes.js` — new routes for verification and password endpoints
  - `api/validators/eventSchemas.js` — new schemas for verification/password requests
  - `api/config/database.js` — schema update for `event_attendees` table
- **Frontend:**
  - `client/components/EventAccessModal.js` — add CHOOSE, VERIFY_EMAIL, and VERIFY_PASSWORD phases; restructure flow
  - `client/lib/api.js` — new `eventsAPI` methods for send-verification, verify-email, verify-password
- **No breaking changes** — existing event registrations continue to work; existing attendees can still access via their stored localStorage token.
