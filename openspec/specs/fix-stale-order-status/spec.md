### Requirement: Seller item status update returns fresh global order status
The `updateItemStatus` endpoint SHALL return the current global order status in the response after processing item-level status changes that may trigger a cascade update to the order's global status.

#### Scenario: Last item marked as sent triggers order status update
- **WHEN** a seller marks the last pending item in an order as "sent" via `PATCH /api/orders/:orderId/items/:itemId/status`
- **AND** `checkAndUpdateOrderStatus()` updates the order's global status to "sent" in the database
- **THEN** the response `order.status` field SHALL be "sent" (not the stale pre-update value)

#### Scenario: Item marked as sent but other items still pending
- **WHEN** a seller marks an item as "sent" but other items in the order still have a non-"sent" status
- **AND** the order's global status remains unchanged
- **THEN** the response `order.status` field SHALL reflect the current global status (e.g., "paid")

#### Scenario: Last item confirmed triggers order status update
- **WHEN** a seller confirms the last pending item in an order via `PATCH /api/orders/:orderId/items/:itemId/status`
- **AND** `checkAndUpdateOrderStatusConfirmed()` updates the order's global status to "confirmed"
- **THEN** the response `order.status` field SHALL be "confirmed"
