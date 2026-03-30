## 1. Backend - Bulk Pickup Endpoint

- [x] 1.1 Add Zod validation schema for bulk pickup request in `api/validators/pickupSchemas.js` — validate `orderIds` (array of positive integers, min 1), `address` (reuse existing address schema), `timeSlotStart`, `timeSlotEnd`, and optional `specialInstructions`
- [x] 1.2 Add `scheduleBulkPickup` controller in `api/controllers/sellerOrdersController.js` — validate all order IDs belong to seller, all items are 'paid' status, all share same carrier code, no existing pickups; aggregate weights per order; call `sendcloudProvider.createPickup` with one item per order; insert one `sendcloud_pickups` row per order sharing same `sendcloud_pickup_id`; update all items to 'sent' status
- [x] 1.3 Add route `POST /orders/bulk-pickup` in `api/routes/sellerRoutes.js` with `validate(bulkPickupSchema)` middleware
- [x] 1.4 Add `scheduleBulkPickup` method to `sellerAPI` in `client/lib/api.js` — `POST /seller/orders/bulk-pickup` with `{ orderIds, address, timeSlotStart, timeSlotEnd, specialInstructions }`

## 2. Frontend - Carrier Display on Order Cards

- [x] 2.1 Add carrier formatting utility function `formatCarrierName(code)` in `client/app/seller/pedidos/page.js` — replaces underscores with spaces and capitalizes each word (e.g., `correos_express` → "Correos Express")
- [x] 2.2 Add carrier name line to each order card in `client/app/seller/pedidos/page.js` — display "Empresa de envío: {formatted carrier}" below the delivery address, only when `getCarrierCode(order)` returns a value

## 3. Frontend - Global Actions Bar

- [x] 3.1 Add helper functions in `client/app/seller/pedidos/page.js` to extract unique carriers from paid orders eligible for pickup (have carrier code, no existing pickup) and eligible for service point lookup (have carrier code)
- [x] 3.2 Add global actions bar in `client/app/seller/pedidos/page.js` — render between tab bar and orders list, only visible when `statusFilter === 'paid'`; show "Programar recogida" button when eligible pickup carriers exist; show "Consultar puntos de entrega" button when any carriers exist

## 4. Frontend - Bulk Pickup Modal

- [x] 4.1 Create `client/components/seller/BulkPickupModal.js` — multi-step modal component with three steps: (1) carrier select dropdown, (2) order selection with checkboxes, (3) address + time slot form
- [x] 4.2 Implement Step 1 (carrier selection) — dropdown populated from `availableCarriers` prop, formatted with `formatCarrierName`; "Siguiente" button to proceed
- [x] 4.3 Implement Step 2 (order selection) — list of orders for selected carrier with checkboxes, "Seleccionar todos" toggle, order ID and address summary per row; "Siguiente" button enabled when at least one order selected
- [x] 4.4 Implement Step 3 (pickup form) — reuse same address fields, time slot inputs, default address toggle, and validation logic as existing `PickupModal.js`; submit calls `sellerAPI.scheduleBulkPickup` with selected order IDs
- [x] 4.5 Wire `BulkPickupModal` into `client/app/seller/pedidos/page.js` — manage modal state, pass carriers/orders/defaultAddress props, handle success callback with notification and orders reload

## 5. Frontend - Bulk Service Points Modal

- [x] 5.1 Create `client/components/seller/BulkServicePointsModal.js` — modal with carrier select dropdown; after selection, renders `ServicePointsInfoModal` content (reuse existing component) with carrier and initial postal code from first matching order
- [x] 5.2 Wire `BulkServicePointsModal` into `client/app/seller/pedidos/page.js` — manage modal state, pass carriers and orders data, handle close
