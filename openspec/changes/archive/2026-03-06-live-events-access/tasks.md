## 1. Database Schema

- [x] 1.1 [HIGH-RISK] Add `access_password TEXT`, `email_verified INTEGER DEFAULT 0`, `verification_code_hash TEXT`, and `verification_code_expires_at DATETIME` columns to the `event_attendees` CREATE TABLE statement in `api/config/database.js`

## 2. Backend Service Layer

- [x] 2.1 Add `generateEventPassword()` function to `api/services/eventService.js` — 6-character alphanumeric (uppercase + digits, excluding 0/O/1/I/L), matching `generateBidPassword()` in `api/services/auctionService.js`
- [x] 2.2 Add `generateVerificationCode()`, `sendVerificationCode(eventId, attendeeId)`, and `verifyEmailCode(eventId, attendeeId, code)` functions to `api/services/eventService.js` — 6-digit OTP with SHA256 hash storage and 10-minute expiry
- [x] 2.3 Add `verifyAttendeePassword(eventId, email, password)` function to `api/services/eventService.js` — looks up attendee by email + event, compares password, generates new access token on success
- [x] 2.4 Add `setAttendeePassword(attendeeId, password)` function to `api/services/eventService.js` — stores password and sets email_verified flag

## 3. Email Template

- [x] 3.1 Add `sendEventConfirmationEmail(params)` function to `api/services/emailService.js` — template with event title, password in amber box (matching `sendBidConfirmationEmail` style), and save instructions. Support both free and paid event variants (paid includes amount)
- [x] 3.2 Add `sendEventVerificationEmail(email, firstName, code)` function to `api/services/emailService.js` — sends 6-digit OTP code (matching draw verification email pattern)

## 4. Validation Schemas

- [x] 4.1 Add `sendVerificationSchema`, `verifyEmailSchema`, and `verifyPasswordSchema` Zod schemas to `api/validators/eventSchemas.js`

## 5. Backend Controller & Routes

- [x] 5.1 Add `sendVerification` handler to `api/controllers/eventController.js` — POST endpoint that calls `sendVerificationCode()` and sends verification email
- [x] 5.2 Add `verifyEmail` handler to `api/controllers/eventController.js` — POST endpoint that calls `verifyEmailCode()` and returns success
- [x] 5.3 Add `verifyPassword` handler to `api/controllers/eventController.js` — POST endpoint that calls `verifyAttendeePassword()` and returns attendee data with new access token
- [x] 5.4 Modify the existing registration completion flow in `api/controllers/eventController.js` to generate password and send confirmation email after all steps are complete (either after email verification for free events, or after payment confirmation for paid events)
- [x] 5.5 Add routes for `POST /api/events/:id/send-verification`, `POST /api/events/:id/verify-email`, and `POST /api/events/:id/verify-password` to `api/routes/eventRoutes.js` with appropriate validation and rate limiting (sensitive tier for verify endpoints)

## 6. Frontend API Client

- [x] 6.1 Add `sendVerification(eventId, attendeeId)`, `verifyEmail(eventId, attendeeId, code)`, and `verifyPassword(eventId, email, password)` methods to the `eventsAPI` object in `client/lib/api.js`

## 7. Frontend Modal Refactor

- [x] 7.1 Add CHOOSE, VERIFY_EMAIL, and VERIFY_PASSWORD phases to `client/components/EventAccessModal.js`. Update the phase state machine: CHOOSE → REGISTER or VERIFY_PASSWORD; REGISTER → VERIFY_EMAIL; VERIFY_EMAIL → PAYMENT (paid) or SUCCESS (free); VERIFY_PASSWORD → direct access
- [x] 7.2 Implement `renderChoose()` in `EventAccessModal.js` — two-button layout matching `renderChoose` in `BidModal.js`, with "Registrarme en el evento" and "Ya me apunte previamente al evento. Acceder con contraseña"
- [x] 7.3 Implement `renderVerifyEmail()` in `EventAccessModal.js` — 6-digit code input, submit button, resend button with 30-second countdown timer (matching `DrawParticipationModal.js` pattern)
- [x] 7.4 Implement `renderVerifyPassword()` in `EventAccessModal.js` — email + password form with submit and back button (matching `BidModal.js` VERIFY phase)
- [x] 7.5 Modify the SUCCESS phase rendering in `EventAccessModal.js` to display the generated access password in a highlighted box with save instructions (matching `BidModal.js` success pattern)
- [x] 7.6 Add logic to skip CHOOSE phase when user already has a valid localStorage session for the event (existing behavior preserved)
