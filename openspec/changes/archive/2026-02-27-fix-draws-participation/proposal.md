## Why

The draw participation system was cloned from the auction module and inherits patterns that don't apply to one-time draw entries: a two-button flow for returning participants, a `bid_password` access code, and no fraud prevention. A single person can currently enter the same draw multiple times using different email addresses, and the modal shows a brief password flash on the confirmation step due to leftover state. These issues need to be fixed before draws go live.

## What Changes

- **Remove returning participant flow**: eliminate the CHOOSE and VERIFY phases from `DrawParticipationModal`. The modal opens directly into TERMS. Remove all `bid_password` state, localStorage session recovery, and the verify-buyer API endpoint.
- **Remove `bid_password` from draw_buyers**: drop the column from the schema, remove generation logic from `drawService`, remove the password from the confirmation email template.
- **Add DNI-based identity validation**: add a `dni` column to `draw_buyers`, add a DNI input field to the PERSONAL step, validate Spanish NIF format client-side, enforce DNI uniqueness per draw server-side with early feedback before the user proceeds past step 2.
- **Add email verification via OTP**: after the user submits PERSONAL data, send a 6-digit verification code to their email. New `draw_email_verifications` table to store codes (10-min expiry, 3 attempts max). Two new API endpoints: `send-verification` and `verify-email`.
- **Add Stripe payment method deduplication**: store the card fingerprint from Stripe in `draw_authorised_payment_data`, enforce uniqueness per draw so the same physical card can't be used for multiple entries.
- **Add IP logging**: store client IP in `draw_buyers` for admin review (no blocking).
- **Fix SUCCESS phase and auto-close**: remove the password display block, auto-close the modal after 2 seconds, and show a `BannerNotification` confirming successful entry.

## Capabilities

### New Capabilities
- `draw-anti-fraud`: DNI validation and uniqueness enforcement, email OTP verification, Stripe payment method fingerprint deduplication, and IP address logging to prevent one real person from entering a draw multiple times.

### Modified Capabilities
- `draw-participation`: Remove returning participant flow (CHOOSE/VERIFY phases), remove `bid_password` from registration and email, simplify modal to direct TERMS→PERSONAL→DELIVERY→INVOICING→PAYMENT→CONFIRM→SUCCESS flow, add auto-close on SUCCESS with BannerNotification.
- `draw-management`: Remove `bid_password` column from `draw_buyers` schema, add `dni` and `ip_address` columns, add `stripe_fingerprint` column to `draw_authorised_payment_data`, add `draw_email_verifications` table.

## Impact

- **Database**: schema changes to `draw_buyers` (remove `bid_password`, add `dni`, `ip_address`), `draw_authorised_payment_data` (add `stripe_fingerprint`), new `draw_email_verifications` table with indexes.
- **API routes**: remove `POST /api/draws/:id/verify-buyer`, add `POST /api/draws/:id/check-dni`, `POST /api/draws/:id/send-verification`, `POST /api/draws/:id/verify-email`. Modify `POST /api/draws/:id/register-buyer` to accept `dni` and `ipAddress`, remove `bid_password` from response. Modify `POST /api/draws/:id/confirm-payment` to check card fingerprint uniqueness.
- **Services**: `drawService.js` (remove password logic, add DNI check, email OTP, fingerprint check), `emailService.js` (remove password from draw confirmation email, add OTP email template).
- **Frontend**: `DrawParticipationModal.js` (major rewrite: remove 2 phases, add DNI field, add email verification sub-step, auto-close + banner), `lib/api.js` (add new API client functions).
- **Validators**: `drawSchemas.js` (add schemas for new endpoints, add DNI to registerBuyer schema).
