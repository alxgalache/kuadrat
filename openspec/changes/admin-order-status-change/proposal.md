## Why

Admin users currently cannot change order or product statuses from the admin dashboard. They can only view order details. The existing status change functionality (`updateOrderStatus`, `updateItemStatus`) is restricted to sellers (who can only mark items as "sent") and buyers (who can mark as "arrived"/"confirmed"). Admin needs full status management to handle exceptions, corrections, and customer support cases — including reversals of confirmed items that must debit the seller's `available_withdrawal`.

## What Changes

- **New admin API endpoints** for changing a single product's status and an entire order's status (all products) to any valid status (`pending_payment`, `paid`, `sent`, `arrived`, `confirmed`, `cancelled`, `reimbursed`).
- **`available_withdrawal` accounting logic** for admin status changes:
  - Changing a product TO `confirmed`: add `price_at_purchase - commission_amount` to seller's `available_withdrawal` (same as existing logic, guard against double-credit).
  - Changing a product FROM `confirmed` to any other status: subtract `price_at_purchase - commission_amount` from seller's `available_withdrawal`.
  - Bulk order status changes must apply this logic per-product atomically.
- **No status transition validation** for admin: unlike sellers/buyers, admin can change from any status to any status without restrictions (except the `available_withdrawal` accounting rules above).
- **Admin order detail page** (`client/app/admin/pedidos/[id]/page.js`): add per-product status change action (popover menu with "Cambiar estado" option) and order-level status change action, both opening a modal with a status select dropdown.
- **Admin orders list page** (`client/app/admin/pedidos/page.js`): add order-level status change action in each order row (same modal pattern).
- **New `adminAPI.orders` client methods**: `updateItemStatus` and `updateOrderStatus` for the new admin endpoints.

## Capabilities

### New Capabilities
- `admin-order-status-change`: Admin ability to change product and order statuses to any valid status, with proper `available_withdrawal` accounting for confirmed status transitions. Covers API endpoints, validation logic, and frontend UI (modal with status selector).

### Modified Capabilities
<!-- No existing spec requirements are changing. The seller "mark as sent" and buyer "mark as arrived/confirmed" flows remain unchanged. -->

## Impact

- **Backend**: New controller functions (or extension of existing `ordersController.js`), new admin routes in `api/routes/admin/orderRoutes.js`, possible new Zod validation schemas in `api/validators/orderSchemas.js`.
- **Frontend**: Modified `client/app/admin/pedidos/[id]/page.js` (add status change UI), modified `client/app/admin/pedidos/page.js` (add order-level action), new admin API methods in `client/lib/api.js`.
- **Database**: No schema changes required — uses existing `orders`, `art_order_items`, `other_order_items`, and `users.available_withdrawal` columns.
- **Financial**: The `available_withdrawal` debit logic on confirmed→other transitions is economically critical and must be atomic (using `createBatch()`).
