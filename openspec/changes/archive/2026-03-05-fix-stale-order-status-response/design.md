## Context

In `ordersController.js`, the `updateItemStatus` handler (seller endpoint) fetches the order at the start of the request (line 1516). After updating the individual item's status, it calls `checkAndUpdateOrderStatus()` which may update the order's global status in the database. However, the response is built using the originally-fetched `order` object, which retains the pre-update status value (e.g., "paid" instead of "sent").

The public buyer endpoint (`updateItemStatusPublic`) does NOT have this bug because it re-fetches the full order via `getOrderWithAllItems(orderId)` before building the response.

## Goals / Non-Goals

**Goals:**
- Ensure the `updateItemStatus` seller endpoint returns the current global order status after item status changes trigger a cascade update.

**Non-Goals:**
- Refactoring the endpoint to use `getOrderWithAllItems()` (the seller endpoint intentionally returns only the seller's items, not all items — changing this would alter the response shape).
- Modifying any frontend code (the frontend already handles the response correctly).
- Changing `updateItemStatusPublic` (already correct).

## Decisions

**Re-read order status after cascade check**: After `checkAndUpdateOrderStatus()` and `checkAndUpdateOrderStatusConfirmed()` run, perform a single `SELECT status FROM orders WHERE id = ?` query. Mutate the in-memory `order.status` before building the response.

- **Why not re-fetch the entire order?** The seller endpoint only returns seller-scoped items. Re-fetching the full order would add unnecessary queries and risk changing the response structure.
- **Why not use `getOrderWithAllItems()`?** That helper returns all items from all sellers, which would leak other sellers' data to the requesting seller.
- **Why mutate `order.status` instead of spreading a new object?** The response already uses `...order` spread (line 1671). Updating the status property before the spread is the minimal change and keeps the existing code structure intact.

## Risks / Trade-offs

- **[Negligible performance cost]** → One additional single-row PK lookup per item status update. This is trivially fast on SQLite/Turso.
- **[Race condition window unchanged]** → If another request changes the order status between our re-read and response, the returned status could still be stale. This is the same window that exists today and is acceptable for this use case.
