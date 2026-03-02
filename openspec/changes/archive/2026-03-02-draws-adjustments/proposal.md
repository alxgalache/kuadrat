## Why

The draws feature launched with several hardcoded values and missing validations that need to be addressed before going live. Edition units and minimum participants are hardcoded on the detail page, postal codes are accepted without shipping-zone validation, duplicate registrations via email reuse are possible, and the FAQ page lacks any mention of draws.

## What Changes

- **Add `min_participants` column to `draws` table** to store the minimum number of participants per draw (currently hardcoded as 30 on the detail page). Update the draw detail page to display the value from the database.
- **Use existing `units` column** for edition units display on the draw detail page. If `units` equals 1, display "Edición única" instead of "Edición de X unidades".
- **Add draws FAQ section** alongside the existing auctions FAQ entry in the FAQ page (`/preguntas-frecuentes`). Separate into distinct sections for auctions and draws.
- **Add postal code validation in draw participation modal** during the DELIVERY step. Validate the entered postal code against the draw product author's shipping zones, reusing the existing `usePostalCodeValidation` hook pattern.
- **Prevent duplicate email registrations per draw.** Currently, a user can register a second time with a different DNI but the same email. Add a uniqueness check on `(email, draw_id)` in the `send-verification` endpoint.
- **Move IP validation to the first step** (PERSONAL phase, during `send-verification`). Currently, IP is only captured during `register-buyer`. Capturing and logging the IP earlier enables anti-fraud checks from the very first interaction.

## Capabilities

### New Capabilities
- `draw-postal-code-validation`: Postal code validation against author's shipping zones during draw registration delivery step.
- `draws-faq`: FAQ section specifically for draws, explaining how they work, participation rules, and payment mechanics.

### Modified Capabilities
- `draw-detail-page`: Display `min_participants` and `units` from database instead of hardcoded values. Show "Edición única" when units = 1.
- `draw-anti-fraud`: Add email uniqueness check per draw. Move IP capture to the `send-verification` step.
- `draw-management`: Add `min_participants` column to `draws` table schema.

## Impact

- **Database**: `draws` table gains `min_participants INTEGER NOT NULL DEFAULT 30` column. New unique index on `(email, draw_id)` in `draw_buyers` table.
- **Backend**: `drawController.js` — email uniqueness check in `sendVerification`, IP capture moved earlier. `drawService.js` — new `checkEmailUniqueness()` method, postal code validation endpoint. `database.js` — schema update.
- **Frontend**: `DrawDetail.js` — dynamic edition/participants text. `DrawParticipationModal.js` — postal code validation in DELIVERY step. `preguntas-frecuentes/page.js` — new draws FAQ section.
- **API**: New `POST /api/draws/:id/validate-postal-code` endpoint (or reuse existing shipping validation).
