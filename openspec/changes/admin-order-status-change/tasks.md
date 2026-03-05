## 1. Backend Validation Schema

- [x] 1.1 Add Zod validation schema `adminUpdateItemStatusSchema` in `api/validators/orderSchemas.js` — validate `status` is one of `[pending_payment, paid, sent, arrived, confirmed, cancelled, reimbursed]` and `product_type` is one of `[art, other]`
- [x] 1.2 Add Zod validation schema `adminUpdateOrderStatusSchema` in `api/validators/orderSchemas.js` — validate `status` is one of the 7 valid statuses

## 2. Backend Controller Functions

- [x] 2.1 Add `updateItemStatusAdmin` function in `api/controllers/ordersController.js` — changes a single item's status with `available_withdrawal` accounting: (a) if old status ≠ confirmed AND new = confirmed → credit seller; (b) if old = confirmed AND new ≠ confirmed → debit seller; (c) use `createBatch()` for atomicity; (d) log all withdrawal adjustments including warnings for negative balances; (e) return updated order with all items ⚠️ HIGH-RISK: touches `users.available_withdrawal`
- [x] 2.2 Add `updateOrderStatusAdmin` function in `api/controllers/ordersController.js` — changes order status AND all items' statuses with per-item `available_withdrawal` accounting: iterate all art_order_items and other_order_items, collect credit/debit adjustments per seller, execute all updates in a single `createBatch()`, log all changes ⚠️ HIGH-RISK: touches `users.available_withdrawal` for multiple sellers
- [x] 2.3 Export `updateItemStatusAdmin` and `updateOrderStatusAdmin` from `api/controllers/ordersController.js` module.exports

## 3. Backend Routes

- [x] 3.1 Add `PATCH /:orderId/items/:itemId/status` route in `api/routes/admin/orderRoutes.js` — wire to `updateItemStatusAdmin` with `validate(adminUpdateItemStatusSchema)` middleware
- [x] 3.2 Add `PATCH /:orderId/status` route in `api/routes/admin/orderRoutes.js` — wire to `updateOrderStatusAdmin` with `validate(adminUpdateOrderStatusSchema)` middleware
- [x] 3.3 Import new controller functions and validation schemas in `api/routes/admin/orderRoutes.js`

## 4. Frontend API Client

- [x] 4.1 Add `adminAPI.orders.updateItemStatus(orderId, itemId, status, productType)` method in `client/lib/api.js` — sends `PATCH /api/admin/orders/:orderId/items/:itemId/status` with `{ status, product_type: productType }`
- [x] 4.2 Add `adminAPI.orders.updateOrderStatus(orderId, status)` method in `client/lib/api.js` — sends `PATCH /api/admin/orders/:orderId/status` with `{ status }`

## 5. Frontend Status Change Modal Component

- [x] 5.1 Add `StatusChangeModal` component in `client/app/admin/pedidos/[id]/page.js` — Dialog with select dropdown showing all 7 statuses (Spanish labels), confirm/cancel buttons, loading state; accepts `open`, `onClose`, `onConfirm`, `confirming`, `title` props

## 6. Frontend Admin Order Detail Page

- [x] 6.1 Update status badge function in `client/app/admin/pedidos/[id]/page.js` — replace placeholder `getStatusBadge` with the full 7-status config matching the seller page pattern (pending_payment, paid, sent, arrived, confirmed, cancelled, reimbursed with proper colors)
- [x] 6.2 Add per-item status badge in `client/app/admin/pedidos/[id]/page.js` — display item-level status badges next to each product
- [x] 6.3 Add popover menu per product item in `client/app/admin/pedidos/[id]/page.js` — with "Cambiar estado" action that opens the status change modal
- [x] 6.4 Add order-level "Cambiar estado del pedido" button in `client/app/admin/pedidos/[id]/page.js` — in the order header area, opens the status change modal for the entire order
- [x] 6.5 Wire item-level status change handler in `client/app/admin/pedidos/[id]/page.js` — calls `adminAPI.orders.updateItemStatus()`, updates local state, shows banner notification
- [x] 6.6 Wire order-level status change handler in `client/app/admin/pedidos/[id]/page.js` — calls `adminAPI.orders.updateOrderStatus()`, updates local state, shows banner notification

## 7. Frontend Admin Orders List Page

- [x] 7.1 Add order-level "Cambiar estado" action per order row in `client/app/admin/pedidos/page.js` — button/icon in the order row that opens the status change modal
- [x] 7.2 Wire order status change handler in `client/app/admin/pedidos/page.js` — calls `adminAPI.orders.updateOrderStatus()`, reloads orders list, shows banner notification
- [x] 7.3 Import StatusChangeModal (or inline) in `client/app/admin/pedidos/page.js` and manage dialog state
