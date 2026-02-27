## Context

The draw (sorteo) participation system was scaffolded from the auction module. It inherited a returning-participant flow (CHOOSE/VERIFY phases with a `bid_password`) and lacks any identity verification. Currently, the only uniqueness constraint is email per draw — trivially bypassed with multiple email addresses. The modal also has a UI glitch where password info flashes during the CONFIRM→SUCCESS transition.

The draw flow is fundamentally different from auctions: a user enters once and either wins or doesn't. There is no reason to "return" to a draw, so the two-button entry, password generation, and verification endpoint are dead weight.

## Goals / Non-Goals

**Goals:**
- Remove all auction-inherited patterns that don't apply to draws (CHOOSE/VERIFY phases, bid_password)
- Prevent one real person from entering a draw multiple times through DNI uniqueness, email OTP verification, and Stripe card fingerprint deduplication
- Fix the SUCCESS phase UI glitch and add a clean auto-close with BannerNotification
- Keep the anti-fraud validations fast and early (PERSONAL step) so users don't waste time filling address/payment before being rejected

**Non-Goals:**
- CAPTCHA integration (can be added later if bot traffic is detected)
- IP-based blocking (logged for admin review only, too many false positives with shared IPs)
- Automated winner selection (remains a manual admin action)
- Changes to the auction system's password flow (auctions keep their existing pattern)

## Decisions

### 1. DNI as primary identity anchor

**Decision:** Use Spanish DNI/NIF as the unique identifier per draw, validated with the NIF checksum algorithm.

**Alternatives considered:**
- Phone number verification (SMS OTP) — more expensive, requires SMS provider, slower
- Passport number — no checksum validation possible, less common
- No identity check (just email) — too easy to bypass

**Rationale:** DNI is universally held by Spanish residents, has a built-in checksum (letter derived from number mod 23), and is the standard identity document. The checksum prevents typos and most fabricated numbers. Combined with the email OTP, this creates a strong identity verification without external services.

**Validation algorithm:**
```
DNI: 8 digits + 1 letter
Letter = "TRWAGMYFPDXBNJZSQVHLCKE"[number % 23]
Also accept NIE format: X/Y/Z prefix replaced by 0/1/2 before calculation
```

### 2. Email OTP flow embedded in PERSONAL step

**Decision:** After submitting PERSONAL data (name, email, DNI), the frontend calls a single endpoint that validates DNI uniqueness AND sends an OTP in one request. The user enters the 6-digit code inline before proceeding to DELIVERY.

**Flow:**
```
PERSONAL form (name, email, DNI)
    │
    ▼
POST /api/draws/:id/send-verification
    ├── Validate DNI format
    ├── Check DNI uniqueness for this draw → 409 if duplicate
    ├── Generate 6-digit OTP, store in draw_email_verifications
    ├── Send email with OTP
    └── Return success
    │
    ▼
User enters code in same step (inline input appears)
    │
    ▼
POST /api/draws/:id/verify-email
    ├── Check code matches, not expired, attempts < 3
    └── Mark as verified
    │
    ▼
Proceed to DELIVERY
```

**Alternatives considered:**
- Separate DNI check and email verification into two steps — adds friction, two API calls
- Email verification link (click-to-confirm) — user leaves the modal, complex flow

**Rationale:** Combining DNI check + OTP send into one call minimizes round trips. The user stays in the modal the whole time. The inline code input keeps the UI simple — no new phase needed, just a sub-state within PERSONAL.

### 3. OTP storage in dedicated table

**Decision:** New `draw_email_verifications` table with columns: `id`, `email`, `draw_id`, `code`, `attempts`, `expires_at`, `verified`, `created_at`.

**Rationale:** Using a dedicated table (vs. in-memory or Redis) keeps the stack simple — no new dependencies. OTP rows are lightweight and can be cleaned up periodically. The `attempts` counter prevents brute-force (3 max). Expiry is 10 minutes.

### 4. Stripe card fingerprint deduplication

**Decision:** After `confirmSetup`, retrieve the PaymentMethod from Stripe, extract `pm.card.fingerprint`, and store it in `draw_authorised_payment_data.stripe_fingerprint`. Before saving, check if this fingerprint already exists for another buyer in the same draw.

**Flow:**
```
POST /api/draws/:id/confirm-payment
    ├── Retrieve SetupIntent from Stripe
    ├── Retrieve PaymentMethod → get pm.card.fingerprint
    ├── Query: SELECT FROM draw_authorised_payment_data
    │   JOIN draw_buyers ON draw_buyer_id = draw_buyers.id
    │   WHERE stripe_fingerprint = ? AND draw_buyers.draw_id = ?
    │   AND draw_buyers.id != current_buyer_id
    ├── If match found → 409 "Este método de pago ya está asociado a otra inscripción"
    └── If no match → save payment data with fingerprint
```

**Rationale:** Stripe generates a stable fingerprint per physical card across all customers. This catches the case where someone registers with different email + different DNI (e.g., family member's) but uses the same card. The check is done at confirm-payment time — before the user reaches CONFIRM phase.

### 5. Modal auto-close + BannerNotification

**Decision:** After `enterDraw` succeeds, the SUCCESS phase shows a brief checkmark animation, then auto-closes after 2 seconds. On close, `showBanner("Te has inscrito correctamente en el sorteo")` is called.

**Rationale:** The user doesn't need to manually dismiss — the banner persists for 5 seconds (existing BannerNotification behavior) giving them confirmation even after the modal is gone. This also eliminates the password flash glitch since there's no password to display.

### 6. IP address logging

**Decision:** Store `req.ip` (or `x-forwarded-for` header) in `draw_buyers.ip_address` at registration time. No blocking logic.

**Rationale:** Useful for admin review of suspicious patterns (many entries from same IP). Not used for blocking because shared IPs (offices, universities, mobile carriers with CGNAT) would cause false positives.

## Risks / Trade-offs

- **DNI can be shared** — a determined person could use a family member's DNI. Mitigated by the combination with card fingerprint deduplication. Using someone else's DNI + someone else's card is a much higher barrier.
- **OTP email delivery delays** — SMTP delivery can take seconds to minutes. Mitigated by showing a clear "Revisa tu email" message and a "Reenviar código" button after 30 seconds.
- **Stripe fingerprint not always available** — some payment methods (e.g., wallets) may not expose a card fingerprint. Mitigated by falling back gracefully: if no fingerprint, log a warning but allow the payment. The DNI uniqueness is the primary gate.
- **draw_email_verifications table growth** — rows accumulate over time. Low risk given draw volume, but a cleanup job could purge expired rows periodically.
- **SQLite concurrency on uniqueness checks** — race condition if two requests with same DNI arrive simultaneously. Mitigated by adding a UNIQUE index on `(dni, draw_id)` which lets the DB enforce uniqueness atomically.
