## Context

Currently, order/product status changes are restricted by role:
- **Sellers** can only mark items as `sent` (via `PATCH /api/orders/:orderId/items/:itemId/status` and `PATCH /api/orders/:orderId/status`). The order must be in `paid` status.
- **Buyers** can mark items as `arrived` (from `sent`) and `confirmed` (from `arrived`) via token-based public endpoints.
- **Admin** has read-only access to orders via `GET /api/admin/orders` and `GET /api/admin/orders/:id`.

The `available_withdrawal` column on the `users` table tracks seller earnings. It is incremented when a product is confirmed (`price_at_purchase - commission_amount`). There is currently no mechanism to reverse this credit.

The existing `updateItemStatus` and `updateOrderStatus` controller functions already handle admin checks (`req.user.role === 'admin'`) for scoping queries (all items vs seller's items), but they restrict status values and transitions.

## Goals / Non-Goals

**Goals:**
- Allow admin to change any single product's status to any of the 7 valid statuses.
- Allow admin to change an entire order's status (and all its products) to any valid status.
- Correctly handle `available_withdrawal` accounting on every status transition involving `confirmed`.
- Reuse existing UI patterns (modals, popovers) consistent with the seller "Marcar como enviado" flow.
- Add admin endpoints under `/api/admin/orders/` namespace (auth already applied at router level).

**Non-Goals:**
- Changing seller or buyer status change permissions (those remain unchanged).
- Adding email notifications for admin-initiated status changes.
- Adding audit/history log for status changes (future enhancement).
- Restricting which status transitions are allowed for admin (all transitions are permitted).

## Decisions

### 1. New dedicated admin controller functions vs extending existing ones

**Decision**: Create two new controller functions (`updateItemStatusAdmin`, `updateOrderStatusAdmin`) in `ordersController.js` rather than extending the existing seller-facing functions with more `isAdmin` branches.

**Rationale**: The existing functions have complex seller-scoping, order-status validation, and email notification logic that don't apply to admin. Separate functions are cleaner and avoid breaking existing seller flows. The admin functions are simpler: no ownership checks, no status transition validation, no email notifications.

**Alternative considered**: Adding more `isAdmin` conditionals to existing functions — rejected due to increased complexity and risk to existing flows.

### 2. `available_withdrawal` accounting approach

**Decision**: Use `createBatch()` for atomic operations. For each product status change:
- If old status ≠ `confirmed` AND new status = `confirmed`: ADD `price_at_purchase - commission_amount` to seller's `available_withdrawal`.
- If old status = `confirmed` AND new status ≠ `confirmed`: SUBTRACT `price_at_purchase - commission_amount` from seller's `available_withdrawal`.
- If old status = `confirmed` AND new status = `confirmed`: no-op (no change).
- Otherwise: no `available_withdrawal` change.

For bulk order status changes, iterate all items and collect all withdrawal adjustments, then execute as a single batch.

**Rationale**: This covers all edge cases including admin reverting a confirmed item. The batch ensures atomicity — either all status changes and balance adjustments succeed or none do.

### 3. Admin routes namespace

**Decision**: Add `PATCH /api/admin/orders/:orderId/items/:itemId/status` and `PATCH /api/admin/orders/:orderId/status` to `api/routes/admin/orderRoutes.js`. Auth (JWT + admin role) is already applied at the `routes/admin/index.js` level.

**Rationale**: Follows existing project convention. No need for additional middleware.

### 4. Frontend: Modal with status select

**Decision**: Create a reusable `StatusChangeModal` component used in both admin order detail and admin orders list pages. The modal contains a `<select>` dropdown with all 7 statuses and a confirm button.

**Rationale**: Consistent with existing `ConfirmationDialog` pattern. The select dropdown is simpler than radio buttons and fits the minimalist design.

### 5. No status transition validation for admin

**Decision**: Admin can set any status from any status. The only "validation" is the `available_withdrawal` accounting logic.

**Rationale**: Per user requirements — admin is a privileged role that needs full flexibility for support and correction cases.

## Risks / Trade-offs

- **[Risk] Negative `available_withdrawal`**: If admin reverts a confirmed item and the seller has already withdrawn funds, the balance could go negative. → **Mitigation**: Allow negative balance (it represents a debt). The withdrawal endpoint already checks `balance > 0` before allowing withdrawals, so no unauthorized withdrawals can occur. Log a warning when balance goes negative.
- **[Risk] Bulk status change atomicity**: Changing all items in a large order atomically via `createBatch()` could be a large batch. → **Mitigation**: Orders typically have few items (1-5). Turso batch supports this scale easily.
- **[Risk] No audit trail**: Admin status changes are not logged beyond Pino structured logs. → **Mitigation**: Structured logging with `logger.info` captures admin user ID, order ID, item ID, old status, new status, and withdrawal amount changes. A formal audit table is a future enhancement.
