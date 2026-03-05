## Why

When a seller marks the last pending item in an order as "sent", the backend correctly updates the global order status to "sent" in the database via `checkAndUpdateOrderStatus()`. However, the API response is built using the `order` object fetched at the beginning of the handler — before the global status update ran — so the response returns the stale status ("paid"). The frontend calls `setOrder(data.order)` with this stale data, causing the order status badge at the top of the detail page to remain outdated until a full page reload.

## What Changes

- The `updateItemStatus` endpoint in `ordersController.js` will re-read the order status from the database after calling `checkAndUpdateOrderStatus()` / `checkAndUpdateOrderStatusConfirmed()`, so the response always reflects the current global order status.
- The same fix applies to the `updateItemStatusPublic` endpoint which has the identical stale-read pattern for buyer-side status updates.

## Capabilities

### New Capabilities

_None — this is a bug fix within existing capabilities._

### Modified Capabilities

_None — the existing spec-level requirements are unchanged. The API already states it SHALL return the updated order object; this fix ensures it actually does._

## Impact

- **Backend**: `api/controllers/ordersController.js` — `updateItemStatus` and `updateItemStatusPublic` functions. Adds one lightweight `SELECT status` query after the status-check helpers run.
- **Frontend**: No changes needed. The existing `setOrder(data.order)` call will automatically display the correct status once the API returns the fresh value.
- **Risk**: Minimal. The added query is a single-row primary-key lookup on the `orders` table, and only executes when a status update is performed.
