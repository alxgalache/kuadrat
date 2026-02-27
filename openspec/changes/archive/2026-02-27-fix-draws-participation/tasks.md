## 1. Database Schema Changes

- [x] 1.1 Update `draw_buyers` table in `api/config/database.js`: remove `bid_password` column, add `dni TEXT NOT NULL`, add `ip_address TEXT` [HIGH-RISK: shared schema file]
- [x] 1.2 Add UNIQUE index on `(dni, draw_id)` in `draw_buyers` table in `api/config/database.js`
- [x] 1.3 Add `stripe_fingerprint TEXT` column to `draw_authorised_payment_data` table in `api/config/database.js`
- [x] 1.4 Create `draw_email_verifications` table in `api/config/database.js` with columns: id, email, draw_id, code, attempts, expires_at, verified, created_at
- [x] 1.5 Add index on `draw_email_verifications(email, draw_id)` in `api/config/database.js`

## 2. Backend: Remove Password Logic

- [x] 2.1 Remove `generateBidPassword()` function from `api/services/drawService.js`
- [x] 2.2 Remove `verifyDrawBuyerPassword()` function from `api/services/drawService.js`
- [x] 2.3 Update `createOrGetDrawBuyer()` in `api/services/drawService.js` to accept `dni` and `ipAddress` instead of generating `bid_password`
- [x] 2.4 Remove `verifyBuyer` controller from `api/controllers/drawController.js`
- [x] 2.5 Remove `POST /:id/verify-buyer` route from `api/routes/drawRoutes.js`
- [x] 2.6 Remove `verifyBuyerSchema` from `api/validators/drawSchemas.js`
- [x] 2.7 Update `registerBuyer` controller in `api/controllers/drawController.js` to remove `bid_password` from response and accept `dni`
- [x] 2.8 Remove password from `enterDraw` controller email call in `api/controllers/drawController.js`

## 3. Backend: Email Changes

- [x] 3.1 Update `sendDrawEntryConfirmationEmail()` in `api/services/emailService.js` to remove password from template and parameters
- [x] 3.2 Add `sendDrawVerificationEmail()` function in `api/services/emailService.js` for OTP email (subject: "Código de verificación - Kuadrat", body with 6-digit code)

## 4. Backend: DNI Validation + Email OTP Service

- [x] 4.1 Add `validateDNI(dni)` helper function in `api/services/drawService.js` implementing NIF/NIE checksum algorithm
- [x] 4.2 Add `checkDniUniqueness(drawId, dni)` function in `api/services/drawService.js` querying `draw_buyers` by dni + draw_id
- [x] 4.3 Add `createEmailVerification(email, drawId)` function in `api/services/drawService.js`: generate 6-digit code, store in `draw_email_verifications` with 10-min expiry, invalidate previous codes for same email+draw
- [x] 4.4 Add `verifyEmailCode(email, drawId, code)` function in `api/services/drawService.js`: check code match, expiry, attempts (max 3), mark as verified

## 5. Backend: Stripe Fingerprint Service

- [x] 5.1 Update `savePaymentData()` in `api/services/drawService.js` to accept and store `stripeFingerprint`
- [x] 5.2 Add `checkFingerprintUniqueness(drawId, fingerprint, excludeBuyerId)` function in `api/services/drawService.js`

## 6. Backend: New Controllers + Routes

- [x] 6.1 Add `sendVerification` controller in `api/controllers/drawController.js`: validate DNI format, check DNI uniqueness, generate and send OTP
- [x] 6.2 Add `verifyEmail` controller in `api/controllers/drawController.js`: validate code, return success/error
- [x] 6.3 Update `confirmPayment` controller in `api/controllers/drawController.js`: retrieve card fingerprint from Stripe PaymentMethod, check uniqueness, store fingerprint
- [x] 6.4 Update `registerBuyer` controller in `api/controllers/drawController.js`: capture `req.ip` and pass to service

## 7. Backend: Validators + Routes Wiring

- [x] 7.1 Add `sendVerificationSchema` to `api/validators/drawSchemas.js` (email, dni required)
- [x] 7.2 Add `verifyEmailSchema` to `api/validators/drawSchemas.js` (email, code required as 6-digit string)
- [x] 7.3 Update `registerBuyerSchema` in `api/validators/drawSchemas.js` to require `dni` field
- [x] 7.4 Add `POST /:id/send-verification` route in `api/routes/drawRoutes.js`
- [x] 7.5 Add `POST /:id/verify-email` route in `api/routes/drawRoutes.js`

## 8. Frontend: API Client Updates

- [x] 8.1 Add `drawsAPI.sendVerification(drawId, email, dni)` in `client/lib/api.js`
- [x] 8.2 Add `drawsAPI.verifyEmail(drawId, email, code)` in `client/lib/api.js`
- [x] 8.3 Remove `drawsAPI.verifyBuyer()` from `client/lib/api.js`

## 9. Frontend: DrawParticipationModal Rewrite

- [x] 9.1 Remove CHOOSE and VERIFY phases from `client/components/DrawParticipationModal.js`
- [x] 9.2 Remove all `savedPassword`, `verifyPassword`, `buyerSession.bidPassword` state and logic
- [x] 9.3 Remove localStorage session recovery that skips to CONFIRM
- [x] 9.4 Set initial phase to TERMS (modal opens directly into step 1)
- [x] 9.5 Add DNI input field to PERSONAL step with client-side NIF/NIE checksum validation
- [x] 9.6 Add email OTP sub-flow to PERSONAL step: after form submit, call `sendVerification`, show inline 6-digit code input, call `verifyEmail`, then proceed to DELIVERY
- [x] 9.7 Add "Reenviar código" button that appears after 30 seconds in the OTP sub-flow
- [x] 9.8 Update CONFIRM→SUCCESS transition: remove password display block from SUCCESS phase
- [x] 9.9 Add auto-close to SUCCESS phase: setTimeout 2 seconds then close modal
- [x] 9.10 Import and call `showBanner("Te has inscrito correctamente en el sorteo")` from BannerNotificationContext on modal close after successful entry
- [x] 9.11 Pass `dni` to `registerBuyer` API call in the INVOICING→PAYMENT transition
