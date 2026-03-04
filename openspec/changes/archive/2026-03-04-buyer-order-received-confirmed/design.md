## Context

The buyer's public order page (`/pedido/[token]`) currently allows viewing order details and contacting the seller. The order lifecycle requires buyers to mark items as received and confirm reception to complete the flow and trigger seller payouts.

The existing seller-side status update pattern (`updateItemStatus`, `updateOrderStatus` in `ordersController.js`) already handles `confirmed` status transitions with atomic balance crediting. The new buyer endpoints follow the same architectural patterns but operate via token-based authentication (no JWT required).

The `commission_amount` is pre-calculated at purchase time and stored in `art_order_items` and `other_order_items`, so the balance credit calculation is straightforward: `price_at_purchase - commission_amount`.

## Goals / Non-Goals

**Goals:**
- Allow buyers to advance order items from `sent` → `arrived` and `arrived` → `confirmed` via token-authenticated public endpoints.
- Atomically credit seller `available_withdrawal` on confirmation, preventing double-crediting.
- Provide both per-item and per-order bulk actions with proper validation (all items must be in the required status for bulk actions).
- Show confirmation modals with appropriate warnings (especially for the irreversible `confirmed` action).
- Send email notifications to buyer and seller on status changes.

**Non-Goals:**
- Auto-confirm timer (10-day lapse after `arrived`). Documented in specs for future implementation.
- Damage/dispute claim system. Out of scope for this change.
- Changes to existing seller/admin status update flows.
- Database schema changes (all necessary columns already exist).

## Decisions

### 1. Public token-based endpoints (no JWT)

**Decision:** New endpoints at `PATCH /api/orders/public/token/:token/items/:itemId/status` and `PATCH /api/orders/public/token/:token/status`.

**Rationale:** The buyer order page is accessed via a unique token sent by email — no login required. This follows the existing pattern (`GET /api/orders/public/token/:token`, `POST .../contact`). The token serves as the authentication mechanism. Rate limiting on these endpoints mitigates abuse.

**Alternative considered:** Requiring buyer authentication. Rejected because the existing buyer flow is token-based and adding auth would break the established UX pattern.

### 2. Strict status transition validation

**Decision:** Backend enforces:
- `arrived` only from `sent`
- `confirmed` only from `arrived`
- Bulk order actions require ALL items to be in the prerequisite status

**Rationale:** Prevents invalid state transitions and ensures data consistency. The seller-side flow allows more flexibility (e.g., marking `sent` only from `paid`), but buyer transitions are more constrained.

### 3. Atomic balance crediting on confirmation (reuse existing pattern)

**Decision:** Use `createBatch()` to atomically update item status to `confirmed` AND increment seller's `available_withdrawal` in a single transaction, identical to the existing pattern in `updateItemStatus`.

**Rationale:** Prevents double-crediting and ensures consistency. The guard check (`WHERE status != 'confirmed'`) ensures idempotency.

### 4. Per-seller balance calculation for bulk order confirmation

**Decision:** When confirming all items in an order, group items by seller and issue one `available_withdrawal` increment per seller within the same batch.

**Rationale:** Orders can contain items from multiple sellers. Each seller must receive only their earnings.

### 5. Frontend modal patterns mirror seller page

**Decision:** Use the same `ConfirmationDialog` pattern from `orders/[id]/page.js` for the buyer modals. "Marcar como recibido" gets a simple confirmation. "Confirmar recepcion" gets a warning modal about irreversibility and the 10-day auto-confirm note.

**Rationale:** Consistent UI patterns across the app. Reusing the dialog structure keeps the code familiar.

### 6. Buyer actions in popover menus + order-level actions

**Decision:** Per-item actions appear in a popover menu (three-dot icon) on each item card, matching the seller page pattern. Order-level actions appear in the order header area, visible only when all items meet the prerequisite status.

**Rationale:** Mirrors the seller page UX. Order-level actions provide convenience for single-seller orders or when all items are at the same stage.

## Risks / Trade-offs

- **[Token-based auth is weaker than JWT]** → Mitigation: Rate limiting on public endpoints. Tokens are unique UUIDs, not guessable. This is the same security model already used for order viewing and seller contact.

- **[Double-crediting on concurrent requests]** → Mitigation: Atomic batch with `WHERE status != 'confirmed'` guard. If a race condition occurs, the second request will find the item already confirmed and skip the credit (or fail gracefully).

- **[Bulk confirmation with many items could be slow]** → Mitigation: Turso batch operations are efficient for the typical order size (1-5 items). No pagination needed.

- **[10-day auto-confirm not implemented]** → Mitigation: Documented in specs as future work. Status will remain `arrived` indefinitely until buyer confirms or the future scheduler is implemented.

- **[No rollback from confirmed]** → By design. The confirmation modal explicitly warns buyers. This matches the business requirement.
