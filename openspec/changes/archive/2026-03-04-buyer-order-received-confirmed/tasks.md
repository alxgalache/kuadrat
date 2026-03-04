## 1. Backend Validation Schemas

- [x] 1.1 Add `publicUpdateItemStatusSchema` Zod schema in `api/validators/orderSchemas.js` — validates `status` (enum: `arrived`, `confirmed`) and `product_type` (enum: `art`, `other`)
- [x] 1.2 Add `publicUpdateOrderStatusSchema` Zod schema in `api/validators/orderSchemas.js` — validates `status` (enum: `arrived`, `confirmed`)

## 2. Backend Controller — Public Item Status Update

- [x] 2.1 Add `updateItemStatusPublic` function in `api/controllers/ordersController.js` — token-based lookup, validates item belongs to order, enforces status transition rules (`sent` → `arrived`, `arrived` → `confirmed`)
- [x] 2.2 Implement atomic balance crediting in `updateItemStatusPublic` for `confirmed` status — use `createBatch()` to atomically update item status AND increment seller `available_withdrawal` by `price_at_purchase - commission_amount`, with double-credit guard (`WHERE status != 'confirmed'`)
- [x] 2.3 Add `checkAndUpdateOrderStatusArrived` helper in `api/controllers/ordersController.js` — checks if all items have `arrived` status and promotes order status to `arrived` (mirrors existing `checkAndUpdateOrderStatus` pattern)
- [x] 2.4 Wire per-item status changes to call the appropriate order-level status promotion helpers (`checkAndUpdateOrderStatusArrived` for `arrived`, existing `checkAndUpdateOrderStatusConfirmed` for `confirmed`)

## 3. Backend Controller — Public Order Status Update

- [x] 3.1 Add `updateOrderStatusPublic` function in `api/controllers/ordersController.js` — token-based lookup, validates ALL items have the prerequisite status (`sent` for `arrived`, `arrived` for `confirmed`)
- [x] 3.2 Implement bulk `arrived` transition — update all art_order_items and other_order_items to `arrived`, then update order status
- [x] 3.3 Implement bulk `confirmed` transition with per-seller balance crediting — group items by seller_id, calculate `SUM(price_at_purchase - commission_amount)` per seller, atomically update all items and increment each seller's `available_withdrawal` in a single batch

## 4. Backend Routes

- [x] 4.1 Add `PATCH /api/orders/public/token/:token/items/:itemId/status` route in `api/routes/ordersRoutes.js` with `validate(publicUpdateItemStatusSchema)` middleware and rate limiting
- [x] 4.2 Add `PATCH /api/orders/public/token/:token/status` route in `api/routes/ordersRoutes.js` with `validate(publicUpdateOrderStatusSchema)` middleware and rate limiting

## 5. Backend Email Notifications

- [x] 5.1 Add `sendItemReceivedEmail` function in `api/services/emailService.js` — notifies seller that buyer marked item as received
- [x] 5.2 Add `sendItemConfirmedEmail` function in `api/services/emailService.js` — notifies seller that buyer confirmed reception and payment credited to balance
- [x] 5.3 Wire email sending in `updateItemStatusPublic` and `updateOrderStatusPublic` controllers

## 6. Frontend API Client

- [x] 6.1 Add `updateItemStatusPublic(token, itemId, status, productType)` method to `ordersAPI` in `client/lib/api.js` — sends `PATCH /api/orders/public/token/:token/items/:itemId/status` with `skipAuthHandling: true`
- [x] 6.2 Add `updateOrderStatusPublic(token, status)` method to `ordersAPI` in `client/lib/api.js` — sends `PATCH /api/orders/public/token/:token/status` with `skipAuthHandling: true`

## 7. Frontend — Buyer Order Page UI

- [x] 7.1 Add `ReceivedConfirmationDialog` component in `client/app/pedido/[token]/page.js` — simple confirmation modal for "Marcar como recibido" with "Cancelar"/"Confirmar" buttons
- [x] 7.2 Add `ConfirmReceptionDialog` component in `client/app/pedido/[token]/page.js` — warning modal for "Confirmar recepcion" with damage disclaimer, 10-day auto-confirm note, and "Cancelar"/"Confirmar" buttons
- [x] 7.3 Add per-item popover menu with three-dot icon on each item card in `PublicOrderContent` — shows "Marcar como recibido" (visible when item status is `sent`) and "Confirmar recepcion" (visible when item status is `arrived`)
- [x] 7.4 Add order-level "Marcar como recibido" action in order header — visible only when ALL items have `sent` status
- [x] 7.5 Add order-level "Confirmar recepcion" action in order header — visible only when ALL items have `arrived` status
- [x] 7.6 Add state management and handlers in `PublicOrderContent` for item-level and order-level status updates (modal state, loading state, API calls, error handling, banner notifications, order state refresh)
