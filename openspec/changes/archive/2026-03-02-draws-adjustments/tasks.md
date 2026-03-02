## 1. Database Schema Changes

- [x] 1.1 Add `min_participants INTEGER NOT NULL DEFAULT 30` to the `draws` CREATE TABLE in `api/config/database.js`. Add corresponding `safeAlter` fallback for existing databases.
- [x] 1.2 Add `ip_address TEXT` column to the `draw_email_verifications` CREATE TABLE in `api/config/database.js`. Add corresponding `safeAlter` fallback.
- [x] 1.3 Add UNIQUE index `idx_draw_buyers_email_draw` on `(email, draw_id)` in `draw_buyers` in `api/config/database.js`.

## 2. Backend: Email Uniqueness Check

- [x] 2.1 Add `checkEmailUniqueness(drawId, email)` function in `api/services/drawService.js` that queries `draw_buyers` for existing records with the same email and draw_id.
- [x] 2.2 Add email uniqueness check in `sendVerification` handler in `api/controllers/drawController.js`, returning 409 with "Este email ya está registrado en este sorteo" if duplicate found. Check must run alongside existing DNI uniqueness check.

## 3. Backend: IP Capture at send-verification

- [x] 3.1 Capture IP address (`req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip`) in the `sendVerification` handler in `api/controllers/drawController.js` and store it in `draw_email_verifications.ip_address`.
- [x] 3.2 Update `drawService.createVerificationCode()` in `api/services/drawService.js` to accept and store `ip_address` in the `draw_email_verifications` INSERT.

## 4. Backend: Postal Code Validation Endpoint

- [x] 4.1 Add `validatePostalCodeSchema` to `api/validators/drawSchemas.js` requiring `postalCode` (non-empty string) and `country` (2-char string, default "ES").
- [x] 4.2 Add `validatePostalCodeForDraw(drawId, postalCode, country)` function in `api/services/drawService.js`. Resolve draw → product → seller, then query `shipping_zones` + `shipping_zones_postal_codes` for matching zones (same polymorphic logic as `shippingController.getAvailableForProduct`). Return `{ valid: boolean }`.
- [x] 4.3 Add `validatePostalCode` handler in `api/controllers/drawController.js` that calls the service function and returns the result via `sendSuccess()`.
- [x] 4.4 Add `POST /:id/validate-postal-code` route in `api/routes/drawRoutes.js` with `validate(validatePostalCodeSchema)` middleware.

## 5. Backend: Draw Detail API Update

- [x] 5.1 Update `getDrawById()` in `api/services/drawService.js` to include `min_participants` in the SELECT query and returned object.
- [x] 5.2 Update admin draw creation/update endpoints in `api/controllers/drawAdminController.js` (if applicable) to accept and persist `min_participants`.

## 6. Frontend: Draw Detail Page

- [x] 6.1 Update `DrawDetail.js` (`client/app/eventos/sorteo/[id]/DrawDetail.js`) to replace the hardcoded "Edición de 999 unidades. Mínimo 30 participantes." text with dynamic values: show "Edición única" when `draw.units === 1`, "Edición de {units} unidades" otherwise, and "Mínimo {min_participants} participantes" from `draw.min_participants`.

## 7. Frontend: Postal Code Validation in Draw Modal

- [x] 7.1 Add `validatePostalCode(drawId, postalCode, country)` function to the `drawsAPI` object in `client/lib/api.js`.
- [x] 7.2 Integrate `usePostalCodeValidation` hook in the DELIVERY step of `DrawParticipationModal.js`. Pass a `validateFn` that calls `drawsAPI.validatePostalCode(draw.id, postalCode, 'ES')`. Display validation feedback (loading spinner, green check, red error "No realizamos envíos a este código postal").
- [x] 7.3 Disable the "Siguiente" button in the DELIVERY step when postal code validation returns `isValid === false` or `isChecking === true`.

## 8. Frontend: FAQ Page Update

- [x] 8.1 Update `faqData` in `client/app/preguntas-frecuentes/page.js` to organize entries into sections (General, Subastas, Sorteos). Add a new draws FAQ entry with question "¿Qué son los sorteos de 140d?" and answer explaining draw mechanics (random selection, fixed price, email + payment authorization, only winners charged, one participation per person).
- [x] 8.2 Update the FAQ page rendering to display section headers above each group of FAQ entries.
