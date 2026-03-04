## Context

The seller orders dashboard (`/orders`) currently has a "Monedero" (wallet) section with hardcoded placeholder values for commission percentage (15%) and available balance (2338.99 EUR). Sellers have no mechanism to request withdrawals of their earnings. The stats section includes a "Disponible para retirar" card that will become redundant once the wallet section displays the real balance.

Currently, the `users` table has no field to track seller earnings. The `getSellerStats` controller computes the "available" amount on the fly by summing confirmed order items minus commission, and the "withdrawn" value is hardcoded to 0.

**Order status architecture:** Statuses are tracked at two levels:
- **Order level** (`orders.status`): The overall order status.
- **Item level** (`art_order_items.status`, `other_order_items.status`): Per-item status, critical because a single order can contain products from multiple sellers.

The status flow is: `pending` → `paid` → `sent` → `arrived` → `confirmed`. Currently, only `pending` → `paid` → `sent` transitions are implemented in the backend. The `updateItemStatus` endpoint (`PATCH /api/orders/:orderId/items/:itemId/status`) accepts any status string via its Zod schema (`z.string().min(1)`), but there is no explicit handler for the `confirmed` transition — no balance update logic, no guard, no side effects. This is where the wallet balance hook must be added.

## Goals / Non-Goals

**Goals:**
- Persistently track each seller's available balance in the database (`available_withdrawal` on `users`)
- Atomically update the balance when order items reach `confirmed` status (after commission deduction)
- Provide a complete withdrawal request flow (IBAN collection, confirmation, record creation, admin notification)
- Display real commission percentage and balance in the Monedero section
- Replace the redundant "Disponible para retirar" stat card with "Número de pedidos"
- Add informational tooltips to all stat cards

**Non-Goals:**
- Automated bank transfers (future — the `withdrawals` table schema supports it)
- Partial withdrawal amounts (full balance withdrawal only, unless clarified otherwise)
- Seller IBAN storage/management beyond the withdrawal record
- Admin dashboard for managing withdrawals (future)
- Automated bank transfers (deferred — the `withdrawals` table and status field support future automation)
- Admin dashboard for managing/completing withdrawals (future)
- Partial withdrawal amounts (full balance withdrawal only for now)

## Decisions

### 1. Balance tracking: Denormalized column on `users` vs. computed from transactions

**Decision:** Add `available_withdrawal REAL NOT NULL DEFAULT 0` to the `users` table.

**Rationale:** Computing the balance from order items and withdrawals on every page load would require scanning potentially large datasets with JOINs. A denormalized column provides O(1) reads and is updated atomically alongside the status change using `createBatch()`. The `withdrawals` table serves as an audit trail to reconcile if needed.

**Alternative considered:** A separate `seller_balances` table. Rejected because it adds complexity for a single-column need and the `users` table already holds seller-specific fields (pickup address, etc.).

### 2. Withdrawals table

**Decision:** Create a `withdrawals` table with columns: `id`, `user_id` (FK to users), `amount`, `iban`, `status` (pending/completed/failed), `created_at`, `completed_at`, `admin_notes`.

**Rationale:** A dedicated table provides withdrawal history, supports future automated transfers (status transitions), and decouples the withdrawal audit trail from the balance column. The `status` field allows the admin to track manual processing and enables future automation. `admin_notes` provides a free-text field for the admin to record transfer reference numbers or issues.

### 3. Balance update hook location

**Decision:** The `available_withdrawal` balance MUST be updated inside the `updateItemStatus` function in `api/controllers/ordersController.js` (lines 1457-1594), specifically when `status === 'confirmed'`.

**Rationale:** `updateItemStatus` is the single code path that transitions individual order items between statuses. It is called via `PATCH /api/orders/:orderId/items/:itemId/status` and is used by both sellers and admins. By hooking into this function, we ensure every `confirmed` transition triggers a balance update regardless of who initiates it.

**Implementation details:**
- After the item status is updated to `confirmed`, query the item's `price_at_purchase` and `commission_amount`.
- Determine the seller: for `art_order_items`, JOIN with `art` table to get `seller_id`; for `other_order_items`, JOIN with `others` table to get `seller_id`.
- Calculate `sellerEarning = price_at_purchase - commission_amount`.
- Atomically increment the seller's `available_withdrawal` by `sellerEarning` using `createBatch()` — the item status update and balance increment MUST be in the same batch.
- Add a guard: only increment if the item's **previous** status was NOT already `confirmed` (prevents double-crediting on retries).
- After updating the item, also check if ALL items in the order are now `confirmed`, and if so, update the order-level status to `confirmed` (similar to the existing `checkAndUpdateOrderStatus` pattern for `sent`).

### 4. Commission source for frontend display

**Decision:** Use `NEXT_PUBLIC_DEALER_COMMISSION` client environment variable (default: 15). This mirrors the backend's `DEALER_COMMISSION` but follows Next.js conventions for client-side env vars.

**Rationale:** The commission percentage is a business configuration value. Using an environment variable (rather than an API call) avoids an extra network request for a rarely-changing value. The `NEXT_PUBLIC_` prefix makes it available in the browser bundle per Next.js conventions.

**Alternative considered:** Fetching from a `/api/config` endpoint. Rejected as over-engineered for a single static value.

### 5. Withdrawal validation strategy

**Decision:** Server-side validation only. The backend MUST verify that the requested withdrawal amount does not exceed the user's `available_withdrawal` at the time of the request, using an atomic read-and-update within a batch.

**Rationale:** Client-side balance display could be stale. The backend is the single source of truth. The atomic batch prevents race conditions from concurrent withdrawal attempts.

### 6. API endpoint placement

**Decision:** Add withdrawal endpoints to `api/routes/sellerRoutes.js` since they are seller-specific operations:
- `POST /api/seller/withdrawals` — Create a withdrawal request
- `GET /api/seller/wallet` — Get current balance and commission rate

**Rationale:** Seller routes already handle seller-specific product operations and are protected with `authenticate + requireSeller`. This groups all seller operations together.

### 7. Order count for the new stat card

**Decision:** Add an `orderCount` field to the existing `getSellerStats` response. This avoids a separate API call and keeps all stats in one request.

**Rationale:** The stats endpoint already filters by date range and queries order data. Adding a COUNT is trivial within the existing query logic.

## Risks / Trade-offs

- **[Risk] Balance drift if `confirmed` transition is triggered outside `updateItemStatus`** → Mitigation: `updateItemStatus` is the only item-status mutation endpoint. Add logging when balance is updated (seller ID, order ID, item ID, amount credited) to detect anomalies. If future code paths are added that change item status, they MUST also handle the balance hook.

- **[Risk] Concurrent withdrawal requests could overdraw balance** → Mitigation: Use atomic batch (read balance + create withdrawal + update balance in single transaction). Turso/SQLite serializes writes, providing natural concurrency protection.

- **[Risk] `available_withdrawal` column added to existing `users` table with data** → Mitigation: Default value of 0 is safe for existing rows. Existing sellers start with 0 balance, which is correct since no withdrawals have been processed before.

- **[Trade-off] Full balance withdrawal only (no partial)** → Simplifies the UI (no amount input needed) and reduces validation complexity. Can be extended later if needed.

- **[Trade-off] Denormalized balance column** → Requires discipline to update it in every relevant code path. The `withdrawals` table serves as a reconciliation source.

### 8. Admin notification email recipient

**Decision:** Send the withdrawal notification email to `config.registrationEmail` (env var `REGISTRATION_EMAIL`).

**Rationale:** This is consistent with how other admin notifications are sent in the codebase — both new order notifications (`emailService.js` line 641) and artist registration notifications (`emailService.js` line 673) use this same address. It is already configured in the environment and validated at startup via `api/config/env.js`.

## Open Questions

_(All previously open questions have been resolved — see proposal.md "Clarifications" section.)_
