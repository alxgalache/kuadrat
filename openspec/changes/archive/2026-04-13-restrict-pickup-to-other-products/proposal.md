## Why

The pickup scheduling feature currently treats all order items equally (both 'art' and 'other' products), but pickups should only apply to 'other' products. Art products will be managed with a more personalized, manual shipping process. This causes two problems: (1) the "Programar recogida" button appears on orders that contain only art products, where it has no purpose, and (2) the backend pickup endpoint incorrectly includes art items in the weight calculation and status transitions when scheduling a Sendcloud pickup.

## What Changes

- **Hide "Programar recogida" button on art-only orders**: On the seller orders page (`/seller/pedidos`), the pickup button should only appear when the order contains at least one 'other' product. Orders with only 'art' products should not show the pickup button.
- **Exclude art items from pickup scheduling API**: The `POST /api/seller/orders/:orderId/pickup` endpoint should only load and process 'other' order items. Art items should not be included in weight calculation, should not be sent to Sendcloud, and should not have their status changed to 'sent' when a pickup is scheduled.
- **Exclude art items from bulk pickup scheduling API**: The `POST /api/seller/orders/bulk-pickup` endpoint should apply the same restriction — only 'other' items are considered for pickup weight and status transitions.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `seller-order-pickup`: Pickup scheduling must only consider 'other' product items, excluding 'art' items from weight calculation and status transitions. The frontend must hide the pickup button when an order has no 'other' items.

## Impact

- **Frontend**: `client/app/seller/pedidos/page.js` — update `canShowPickup` logic and `pickupEligibleOrders` filter to check for 'other' items in the order.
- **Backend**: `api/controllers/sellerOrdersController.js` — modify `schedulePickup` and `scheduleBulkPickup` to only query and process `other_order_items`, skip `art_order_items` entirely.
- **No database changes required.**
- **No changes to `sendcloudProvider.js` needed** — the provider receives whatever items the controller sends; the filtering happens at controller level.
