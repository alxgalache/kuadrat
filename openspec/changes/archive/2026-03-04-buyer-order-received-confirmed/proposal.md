## Why

Buyers currently have no way to update the status of their orders after a seller marks them as sent. The order lifecycle stalls at "sent" until an admin or automated process advances it. Adding "mark as received" and "confirm reception" actions on the buyer's public order page (`/pedido/[token]`) completes the order lifecycle, enables buyer accountability, and triggers seller payouts upon confirmation.

## What Changes

- **New buyer actions on public order page** (`/pedido/[token]/page.js`):
  - "Marcar como recibido" — available per-item (when item status is `sent`) or per-order (when ALL items are `sent`). Changes status to `arrived`.
  - "Confirmar recepcion" — available per-item (when item status is `arrived`) or per-order (when ALL items are `arrived`). Changes status to `confirmed` and credits the seller's `available_withdrawal` balance with `price_at_purchase - commission_amount`.
- **New public API endpoints** (token-authenticated, no JWT):
  - `PATCH /api/orders/public/token/:token/items/:itemId/status` — update a single item status (arrived or confirmed).
  - `PATCH /api/orders/public/token/:token/status` — update all items in the order (arrived or confirmed).
- **Confirmation modal for "Confirmar recepcion"** warns the buyer that:
  - They confirm the product arrived in good condition.
  - They will not be able to claim damages after confirming.
  - The product will be auto-confirmed after 10 days if no issues are reported (auto-confirm not implemented in this change — documented for future work).
- **Simple confirmation modal for "Marcar como recibido"** asks buyer to confirm they have received the product(s).
- **Seller balance update**: on `confirmed`, the seller's `available_withdrawal` is atomically incremented by `price_at_purchase - commission_amount` (product price only, no shipping). Per-seller amounts when order has items from multiple sellers.
- **Email notifications**: buyer and seller receive email notifications on status changes.
- **Note for future implementation**: 10-day auto-confirm timer starts when status changes to `arrived`. This will be implemented in a separate change.

## Capabilities

### New Capabilities
- `buyer-order-status-update`: Buyer-initiated order item and order status transitions (arrived, confirmed) via public token-based endpoints, including seller balance crediting on confirmation.

### Modified Capabilities
_(none — existing seller/admin status update flows remain unchanged)_

## Impact

- **Backend**:
  - `api/controllers/ordersController.js` — new public status update functions
  - `api/routes/ordersRoutes.js` — new public PATCH routes
  - `api/validators/orderSchemas.js` — new Zod schemas for public status updates
  - `api/services/emailService.js` — new email templates for received/confirmed notifications
- **Frontend**:
  - `client/app/pedido/[token]/page.js` — new action buttons, confirmation modals, API calls
  - `client/lib/api.js` — new ordersAPI methods for public status updates
- **Database**: No schema changes (uses existing `status`, `available_withdrawal`, `commission_amount` columns)
