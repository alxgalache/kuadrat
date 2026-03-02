## Context

The draws feature is functional but has several gaps before production readiness. Hardcoded values on the detail page, missing postal code validation, an email-reuse loophole, and no FAQ coverage for draws need to be addressed. All changes are incremental refinements to existing code — no new architectural patterns are introduced.

## Goals / Non-Goals

**Goals:**
- Make edition units and minimum participants configurable per draw (database-driven)
- Validate delivery postal codes against the author's shipping zones during draw registration
- Close the duplicate-email registration loophole
- Add draws FAQ section to the existing FAQ page
- Capture IP address earlier in the registration flow (at send-verification)

**Non-Goals:**
- Automated IP-based blocking (IP remains informational only)
- Changing the draw participation modal flow/phases (DELIVERY step stays where it is)
- Admin UI for setting `min_participants` (admin API already supports draw updates)
- Postal code validation for invoicing address (only delivery address)

## Decisions

### 1. Add `min_participants` to `draws` table

Add `min_participants INTEGER NOT NULL DEFAULT 30` to the draws CREATE TABLE statement in `database.js`. The column already has a natural companion `units` (edition units, default 1) which is already in the schema but displayed as hardcoded "999" on the detail page.

**Why not a separate config table?** These values are per-draw and already sit alongside `max_participations` and `units`. A separate table adds unnecessary complexity.

**Frontend display logic:**
- If `units === 1` → "Edición única"
- If `units > 1` → "Edición de {units} unidades"
- Always show: "Mínimo {min_participants} participantes"

### 2. Postal code validation: reuse shipping zone query via a new draw endpoint

**Approach:** Create `POST /api/draws/:id/validate-postal-code` on the draw controller. This endpoint receives `{ postalCode, country }` and queries the seller's shipping zones (via `shipping_zones` + `shipping_zones_postal_codes`) to check if any active delivery method covers the given postal code. This mirrors the logic in `shippingController.getAvailableForProduct()` but simplified: we only need a boolean `valid` result, not the full method list.

**Why a draw endpoint instead of reusing the shipping endpoint directly?** The shipping endpoint (`/api/shipping/available/:productId/:productType`) requires `sellerId`, `country`, and `postalCode`. For draws, we want to encapsulate this by resolving the seller from the draw's product automatically. A draw-specific endpoint also allows draws to remain self-contained.

**Frontend:** Use the existing `usePostalCodeValidation` hook in the DELIVERY step of `DrawParticipationModal`. The hook accepts a `validateFn` — we'll pass a function that calls the new draw endpoint. Postal code validation will be debounced (400ms) and shown as inline feedback (green check / red X) on the postal code field. The user MUST NOT be able to proceed to the INVOICING step if the postal code is invalid.

**Country assumption:** Draws currently operate in Spain only. The country will default to "ES" in the frontend but could be extended later.

### 3. Email uniqueness: check + database constraint

**Approach:** Add an email uniqueness check in the `send-verification` endpoint (alongside the existing DNI uniqueness check). Also add a UNIQUE index on `(email, draw_id)` in `draw_buyers` for database-level enforcement.

**Why at send-verification?** This is the earliest point where we have both the email and draw_id. Blocking here prevents the user from even receiving an OTP code if they've already registered with that email. This is consistent with how DNI uniqueness is checked at the same step.

**Error message:** "Este email ya está registrado en este sorteo" (409).

**Alternative considered:** Checking at `register-buyer` — rejected because the user would go through OTP verification only to be blocked later, which is a poor UX.

### 4. IP capture at send-verification

**Approach:** Move IP address capture from `register-buyer` to `send-verification`. The IP will be stored in a new optional column on `draw_email_verifications` (or passed through to be stored when the buyer is finally created).

**Chosen approach:** Store IP in `draw_email_verifications` table (new column `ip_address TEXT`). When the buyer is later created in `register-buyer`, copy the IP from the verification record. This way, the IP is captured at the earliest interaction without changing the `draw_buyers` schema.

**Alternative considered:** Storing in a separate audit table — rejected as over-engineering for an informational field.

### 5. FAQ structure

**Approach:** Modify the `faqData` array in `preguntas-frecuentes/page.js` to use sections. Add a new FAQ entry about draws. The structure will group FAQs by topic (General, Subastas, Sorteos) using section headers within the existing accordion pattern.

**Content for draws FAQ:** Explain what draws are, how participation works, payment authorization mechanics, and winner selection process. Mirror the information in `DrawHowWorksModal` but adapted for the FAQ format.

## Risks / Trade-offs

- **Postal code validation adds a network call per keystroke (debounced):** The 400ms debounce and minimum 4-character threshold mitigate excessive API calls. The query is lightweight (single boolean result).

- **Email uniqueness index on existing data:** If existing `draw_buyers` records have duplicate `(email, draw_id)` pairs, the UNIQUE index creation will fail. → Mitigation: Since the `register-buyer` endpoint already returns existing records for duplicate emails (upsert behavior), duplicates are unlikely. But we should check before adding the index.

- **IP at send-verification vs register-buyer:** The IP captured during verification may differ from the IP during registration (e.g., network change). → Acceptable trade-off since IP is informational only and both are recorded.
