## Context

Kuadrat is a minimalist online art marketplace where unique art items (`art` table, `is_sold` flag) and stock-based products (`others` table, variant stock) are sold. The purchase flow follows a two-phase pattern: order creation via `placeOrder` → payment confirmation via Stripe/Revolut webhook → inventory update via `processOrderConfirmation`.

**Current state:**
- The `placeOrder` endpoint checks `is_sold` before creating an order, but this check and the subsequent order creation are **not atomic** — creating a race condition window where two concurrent buyers can both pass the check and create orders for the same item.
- Stripe payment flow correctly re-computes prices server-side via `buildLineItems()` and `computeShippingTotal()`, but shipping costs from `req.body.items[].shipping.cost` are included without independent server-side verification against the shipping rules database.
- All database queries use parameterized statements. SQL injection is not a concern.
- JWT-based auth correctly uses `req.user.id` throughout; user ID spoofing is not possible.
- Auction bids have optimistic concurrency control (`WHERE current_price = ?`).
- Security middleware covers prototype pollution, command injection, and suspicious paths.

## Goals / Non-Goals

**Goals:**
- Eliminate the race condition in concurrent purchases of the same art item or last-stock variant
- Validate shipping costs server-side at payment intent creation time (not trusting client values)
- Verify payment amounts match computed totals at order confirmation time
- Ensure no endpoint allows unauthorized modification of `is_sold`, `stock`, or monetary values
- Document the audit findings so the team understands the security posture

**Non-Goals:**
- Adding row-level security or database-level access control (Turso/SQLite doesn't support it)
- Implementing CSRF protection (API is stateless JWT, not cookie-based)
- Adding WAF or DDoS protection (infrastructure concern, not application-level)
- Changing the frontend — all hardening is server-side
- Reworking the two-phase order/payment architecture

## Decisions

### 1. Atomic inventory reservation via Turso batch with conditional UPDATE

**Decision:** Use `UPDATE ... WHERE is_sold = 0` (for art) and `UPDATE ... WHERE stock > 0` (for others variants) inside a Turso batch transaction during `placeOrder`. Check `rowsAffected` to detect if another request already claimed the item.

**Why not other approaches:**
- **Pessimistic locking (SELECT FOR UPDATE):** Turso/SQLite does not support row-level locks. Not applicable.
- **Version column (optimistic locking):** Would require schema changes and an extra SELECT. The conditional UPDATE approach achieves the same atomicity with fewer round-trips and no schema change.
- **Application-level mutex (in-memory lock):** Would break in multi-instance deployments and adds complexity.

**How it works:**
1. In `placeOrder`, instead of SELECT → check → INSERT, use a batch that:
   - Updates `art SET is_sold = 1 WHERE id = ? AND is_sold = 0` (returns `rowsAffected`)
   - If `rowsAffected === 0`, the item was already claimed → rollback with error
2. If payment fails or order is cancelled, a compensating transaction resets `is_sold = 0`.
3. For `others` variants: `UPDATE ... SET stock = stock - 1 WHERE id = ? AND stock > 0`.

### 2. Server-side shipping cost re-computation

**Decision:** At payment intent creation (`createPaymentIntentEndpoint`), look up shipping costs from the database using the shipping method ID and zone, rather than trusting `item.shipping.cost` from the client request.

**Why:** The current flow includes `item.shipping.cost` from the client in the total. A malicious client could set `shipping.cost = 0` to avoid shipping charges. The shipping rules exist in the database and should be the authoritative source.

### 3. Payment amount verification at order confirmation

**Decision:** In `processOrderConfirmation`, after receiving the Stripe/Revolut webhook, re-compute the expected total from the order's items and compare it against the payment amount. If mismatched, log a security alert and flag the order for manual review rather than rejecting it (to avoid losing legitimate payments due to rounding).

**Why:** This is a defense-in-depth measure. Even though prices are computed server-side at payment intent creation, verifying again at confirmation catches edge cases (e.g., price changed between intent creation and confirmation).

### 4. Strict field filtering on mutation endpoints

**Decision:** Add `.strip()` (Zod's equivalent of dropping unknown keys) to all Zod schemas for mutation endpoints (POST/PUT/PATCH). This ensures that even if a client sends `is_sold`, `stock`, `role`, or other sensitive fields, they are silently dropped before reaching the controller.

**Why:** While no current endpoint blindly spreads `req.body` into SQL, this is a preventive measure. Zod's `.strict()` was considered but would return errors to the client, potentially revealing schema information. `.strip()` silently removes unknown fields.

## Risks / Trade-offs

**[Risk] Inventory reserved at order creation but payment never completes** → Mitigation: Implement a TTL-based reservation cleanup. A scheduled job (or extension of `auctionScheduler.js`) will release reservations for orders that remain unpaid after a configurable timeout (e.g., 30 minutes). The `placeOrder` endpoint will record a `reserved_at` timestamp.

**[Risk] Compensating transaction fails after payment cancellation** → Mitigation: Log all reservation state changes. The cleanup job will also handle orphaned reservations based on order status and age.

**[Risk] Shipping cost lookup adds latency to payment intent creation** → Mitigation: Shipping rules are a small dataset. The lookup is a single indexed query, adding negligible latency (~1-2ms).

**[Risk] Amount mismatch at confirmation flags legitimate orders** → Mitigation: Use a tolerance threshold (±1 cent) for rounding differences. Only flag orders with significant mismatches. Never auto-reject — always flag for manual review.

## Open Questions

1. What should the reservation timeout be? Suggested default: 30 minutes (configurable via `config.orderReservationTtlMinutes`).
2. Should the reservation cleanup job be a new scheduler or an extension of `auctionScheduler.js`? Leaning toward a new dedicated scheduler for separation of concerns.
