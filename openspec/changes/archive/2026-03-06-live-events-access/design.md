## Context

Live events (`/live`) allow users to register and access streaming content. Currently, the registration flow in `EventAccessModal.js` collects name + email, optionally takes payment (for paid events), and stores a random `accessToken` in localStorage as `event_attendee_{eventId}`. The backend hashes this token (SHA256) and stores it in the `event_attendees` table.

This approach has two weaknesses:
1. No email verification — users can register with typos in their email address.
2. No way to recover access if localStorage is cleared or the user switches devices.

The project already has two proven patterns for solving these issues:
- **Email OTP verification** in draws (`DrawParticipationModal.js` / `drawController.js`): sends a 6-digit code to the email, user enters it before proceeding.
- **Password-based re-access** in auctions (`BidModal.js` / `auctionService.js`): generates a short password on first registration, sends it via email (`sendBidConfirmationEmail`), and lets returning users enter email + password to regain access.

## Goals / Non-Goals

**Goals:**
- Add email verification (OTP) to the event registration flow, inserted between personal data and payment/confirmation.
- Add a password-based re-access system so returning attendees can regain access from any device.
- Add a "choose" step to the modal so users can pick between new registration and password-based re-entry.
- Send a confirmation email with the access password after successful registration.
- Maintain backward compatibility with existing attendees who already have localStorage tokens.

**Non-Goals:**
- Migrating existing attendees to the new password system (they keep using their stored tokens).
- Adding DNI/NIE validation to events (that's specific to draws).
- Adding delivery/invoicing address collection to events (not needed for event access).
- Changing the LiveKit token generation or video access flow.
- Adding fraud prevention measures (IP logging, card fingerprinting) beyond what already exists for events.

## Decisions

### 1. Reuse the same OTP pattern from draws, not a shared module

**Decision:** Implement the OTP verification directly in `eventService.js` and `eventController.js`, following the same pattern as draws but not extracting a shared module.

**Rationale:** The draw OTP implementation is tightly coupled with draw-specific logic (DNI validation, draw participation rules). Extracting a shared OTP module would require refactoring draw code, which is out of scope. The implementation is small (generate code, hash, store, verify) and the duplication is acceptable for two call sites.

**Alternative considered:** Shared `otpService.js` — rejected because it would modify working draw code and add coupling between independent features.

### 2. Store password as plaintext in the database (matching auction pattern)

**Decision:** Store the event access password as plaintext in the `event_attendees.access_password` column, consistent with how auctions store `bid_password` in `auction_buyers`.

**Rationale:** These are short-lived, low-privilege access codes (not user account passwords). They grant access only to view a specific event, not to any sensitive data. Matching the existing auction pattern keeps the codebase consistent and simplifies verification (direct string comparison).

**Alternative considered:** Hashing passwords with bcrypt — rejected because it would be inconsistent with the auction pattern, and the threat model doesn't warrant it for single-event view access.

### 3. Password generation: 6-character alphanumeric (matching auctions)

**Decision:** Use the same `generateBidPassword()` pattern from `auctionService.js` — 6 random alphanumeric characters (uppercase + digits, excluding ambiguous characters like 0/O, 1/I/L).

**Rationale:** Proven pattern, easy to read and type from an email on another device.

### 4. Modal phase flow: CHOOSE → REGISTER/VERIFY_PASSWORD → VERIFY_EMAIL → PAYMENT → SUCCESS

**Decision:** The updated `EventAccessModal.js` will have these phases:
- **CHOOSE:** Two buttons — "Registrarme en el evento" / "Ya me apunte previamente. Acceder con contrasena" (same layout as `renderChoose` in `BidModal.js`)
- **REGISTER:** Name + email form (existing)
- **VERIFY_EMAIL:** 6-digit OTP input + resend button (new, matching draw pattern)
- **VERIFY_PASSWORD:** Email + password form (new, matching `BidModal.js` VERIFY phase)
- **PAYMENT:** Stripe payment (existing, only for paid events)
- **SUCCESS:** Confirmation + display password (modified to show password)

**Rationale:** Placing CHOOSE first lets returning users skip the entire registration flow. Email verification happens after personal data but before payment, ensuring the email is valid before taking money.

### 5. Password is generated and emailed after full registration completion

**Decision:** The access password is generated and the confirmation email is sent only after the user has fully completed all registration steps (including payment for paid events). This happens in the same response as the final success confirmation.

**Rationale:** Matches the document requirement: "La generacion de la contrasena y el envio del email se realizara solamente una vez que el usuario ha completado todos los pasos en el registro y ha accedido correctamente al evento."

### 6. New columns added to event_attendees table

**Decision:** Add to the `event_attendees` CREATE TABLE statement:
- `access_password TEXT` — plaintext password for re-access
- `email_verified INTEGER DEFAULT 0` — whether email has been OTP-verified
- `verification_code_hash TEXT` — SHA256 hash of the 6-digit OTP code
- `verification_code_expires_at DATETIME` — expiry timestamp for OTP

**Rationale:** Keeps all attendee data in one table. The OTP fields are transient (cleared after verification) but storing them in the same table avoids a separate table for a simple flow.

### 7. Three new API endpoints

**Decision:**
- `POST /api/events/:id/send-verification` — sends OTP code to email (requires attendeeId)
- `POST /api/events/:id/verify-email` — verifies OTP code (requires attendeeId + code)
- `POST /api/events/:id/verify-password` — verifies email + password for returning attendees

**Rationale:** Follows RESTful conventions and matches the draw/auction endpoint patterns.

## Risks / Trade-offs

- **[Risk] Existing attendees without passwords cannot use "Acceder con contrasena"** → They still have localStorage tokens and can access normally. If they lose localStorage, they would need to re-register (same as current behavior). This is acceptable since this is a new feature going forward.

- **[Risk] OTP codes could be brute-forced (6 digits = 1M combinations)** → Mitigated by rate limiting on the verification endpoint (use existing `config.rateLimit.sensitive` tier) and OTP expiry (10 minutes, matching draw pattern).

- **[Risk] Plaintext password storage** → Acceptable trade-off given the low-privilege nature of event access (view-only, single event). Consistent with existing auction pattern.

- **[Trade-off] Code duplication with draws for OTP logic** → Accepted in favor of independence between features. If a third feature needs OTP, consider extracting a shared module then.
