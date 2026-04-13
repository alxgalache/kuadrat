## 1. Backend — Modify schedulePickup endpoint

- [x] 1.1 In `api/controllers/sellerOrdersController.js` `schedulePickup`: remove the `art_order_items` query (lines ~299-305). Only query `other_order_items` for the order.
- [x] 1.2 Update the `allItems` variable to use only `otherItems.rows` (remove art items from the array).
- [x] 1.3 Update the status-change loop to only iterate over `otherItems.rows` — remove the art items status update loop entirely.
- [x] 1.4 Adjust the error message for the 404 case to say "No se encontraron productos (tipo 'otros') tuyos en este pedido" to clarify that only 'other' products are eligible.

## 2. Backend — Modify scheduleBulkPickup endpoint

- [x] 2.1 In `api/controllers/sellerOrdersController.js` `scheduleBulkPickup`: for each orderId in the loop, remove the `art_order_items` query. Only query `other_order_items`.
- [x] 2.2 Update `allItems` to use only `otherItems.rows`.
- [x] 2.3 Remove `artRows` from the `orderItems` push — only store `otherRows`.
- [x] 2.4 Update the status-change loop inside the bulk pickup to only iterate over `otherRows`.

## 3. Frontend — Update pickup button visibility

- [x] 3.1 In `client/app/seller/pedidos/page.js`: add a helper function `hasOtherItems(order)` that returns `true` if `order.items?.some(i => i.productType === 'others')`.
- [x] 3.2 Update `canShowPickup` to also require `hasOtherItems(order)` — the button should only show when the order has at least one 'other' item.
- [x] 3.3 Update the `pickupEligibleOrders` filter to also check `hasOtherItems(o)` so art-only orders are excluded from the bulk pickup eligible list.
