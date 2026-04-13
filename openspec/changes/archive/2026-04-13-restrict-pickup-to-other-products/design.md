## Context

The seller orders page (`/seller/pedidos`) displays orders containing the seller's products and provides shipping actions like scheduling pickups via Sendcloud. Currently, the pickup feature treats all product types equally — both 'art' and 'other' items are included in pickup scheduling. However, art products require a more personalized, manual shipping process and should be excluded from automated Sendcloud pickups.

The relevant code paths are:
- **Frontend**: `client/app/seller/pedidos/page.js` — renders the pickup button based on `canShowPickup()` and filters `pickupEligibleOrders` for the bulk action.
- **Backend**: `api/controllers/sellerOrdersController.js` — `schedulePickup` and `scheduleBulkPickup` both query `art_order_items` and `other_order_items`, combining them for weight calculation and status updates.

## Goals / Non-Goals

**Goals:**
- Hide the "Programar recogida" button on orders that contain only 'art' products (no 'other' items).
- Ensure the backend pickup endpoints only process 'other' order items — weight calculation, Sendcloud API call, and status transitions should exclude art items.
- Apply the same restriction to both single-order pickup and bulk pickup endpoints.

**Non-Goals:**
- Changing how art products are shipped (that's a future, separate initiative).
- Modifying the `getSellerOrders` query or the order data shape — art items should still appear in the order card visually; only the pickup action is restricted.
- Changing the Sendcloud provider (`sendcloudProvider.js`) — it already accepts whatever items the controller passes; the filtering is purely at the controller level.

## Decisions

### 1. Frontend: Check for 'other' items to control pickup button visibility

**Decision**: Add a helper function `hasOtherItems(order)` that checks if any item in `order.items` has `productType === 'others'`. Use this as an additional condition in `canShowPickup()` and in the `pickupEligibleOrders` filter.

**Rationale**: This is the simplest approach — the item data already includes `productType` from the API response, so no additional API calls are needed. The check is local and instant.

**Alternative considered**: Adding a server-side flag like `order.pickupEligible` — rejected because it would change the API contract unnecessarily and the frontend already has the data to determine this.

### 2. Backend: Remove art item queries from pickup endpoints

**Decision**: In `schedulePickup`, remove the `art_order_items` query entirely. Only query `other_order_items` for the order. If no 'other' items exist, return a 404. Only 'other' items contribute to weight and only 'other' items get their status set to 'sent'.

Same approach for `scheduleBulkPickup`.

**Rationale**: Clean separation — the art items query was only there because the original implementation treated all items uniformly. Removing it entirely (rather than querying and filtering) is simpler and more efficient.

**Alternative considered**: Query both tables but filter to only process 'other' items — rejected because there's no reason to load art data at all in the pickup context.

### 3. Art item status remains unchanged during pickup

**Decision**: When a pickup is scheduled, art item statuses remain at 'paid'. Only 'other' items transition to 'sent'.

**Rationale**: Art items have a separate manual shipping process. Their status should only change when that manual process is executed (out of scope for this change).

## Risks / Trade-offs

- **Mixed orders with only art items having carrier codes**: If an order has both art and 'other' items but only the art items have a `sendcloud_carrier_code`, the pickup button could still appear (due to the carrier code check) but the backend would return 404 because there are no 'other' items eligible for pickup. This is acceptable — the 404 error message will explain the situation. In practice, carrier codes are assigned at shipment creation time and both item types in the same order would have them. → Mitigation: The frontend `canShowPickup` now also requires 'other' items to be present, so this edge case is handled.

- **Existing pickups for mixed orders**: If a seller previously scheduled a pickup for a mixed order (before this change), the existing pickup record includes weight from art items. This is a data inconsistency in historical records only and does not affect future behavior. → Mitigation: No action needed; historical records are informational.
