## ADDED Requirements

### Requirement: Admin can change a single product status to any valid status
The system SHALL allow an admin user to change the status of a single order item (art or other) to any of the 7 valid statuses: `pending_payment`, `paid`, `sent`, `arrived`, `confirmed`, `cancelled`, `reimbursed` — regardless of the item's current status or the order's current status.

#### Scenario: Successfully change item status
- **WHEN** admin sends `PATCH /api/admin/orders/:orderId/items/:itemId/status` with `{ status: "<valid_status>", product_type: "art"|"other" }`
- **AND** the order and item exist
- **THEN** the item's status SHALL be updated to the requested status
- **AND** the response SHALL return the updated order with all items

#### Scenario: Reject with invalid status value
- **WHEN** admin sends a status value not in `[pending_payment, paid, sent, arrived, confirmed, cancelled, reimbursed]`
- **THEN** the system SHALL return a 400 error

#### Scenario: Reject with invalid product_type
- **WHEN** admin sends a `product_type` not in `[art, other]`
- **THEN** the system SHALL return a 400 error

#### Scenario: Reject when order does not exist
- **WHEN** admin sends a request for a non-existent order ID
- **THEN** the system SHALL return a 404 error

#### Scenario: Reject when item does not exist in order
- **WHEN** admin sends a request for an item that does not belong to the specified order
- **THEN** the system SHALL return a 404 error

### Requirement: Admin can change all products in an order to any valid status
The system SHALL allow an admin user to change the status of an entire order and ALL its products (art and other) to any of the 7 valid statuses, regardless of any item's current status or the order's current status.

#### Scenario: Successfully change order and all items status
- **WHEN** admin sends `PATCH /api/admin/orders/:orderId/status` with `{ status: "<valid_status>" }`
- **AND** the order exists
- **THEN** the order's status SHALL be updated to the requested status
- **AND** ALL art_order_items and other_order_items belonging to the order SHALL be updated to the requested status
- **AND** the response SHALL return the updated order with all items

#### Scenario: Change status when items have mixed statuses
- **WHEN** the order has items with different statuses (e.g., one `arrived`, one `confirmed`)
- **AND** admin sends a new status
- **THEN** ALL items SHALL be updated to the new status regardless of their current individual statuses

#### Scenario: Reject with invalid status value
- **WHEN** admin sends a status value not in the valid statuses list
- **THEN** the system SHALL return a 400 error

#### Scenario: Reject when order does not exist
- **WHEN** admin sends a request for a non-existent order ID
- **THEN** the system SHALL return a 404 error

### Requirement: available_withdrawal is credited when product status changes TO confirmed
The system SHALL atomically increment the seller's `available_withdrawal` by `price_at_purchase - commission_amount` when an admin changes a product's status from any non-confirmed status TO `confirmed`.

#### Scenario: Credit seller on item confirmation via single item update
- **WHEN** admin changes an item's status TO `confirmed`
- **AND** the item's current status is NOT `confirmed`
- **THEN** the seller's `available_withdrawal` SHALL be atomically incremented by `price_at_purchase - commission_amount`
- **AND** the operation SHALL be logged with seller ID, order ID, item ID, and credited amount

#### Scenario: Credit seller on item confirmation via bulk order update
- **WHEN** admin changes an order's status to `confirmed`
- **AND** one or more items' current status is NOT `confirmed`
- **THEN** for each such item, the seller's `available_withdrawal` SHALL be atomically incremented by `price_at_purchase - commission_amount`

#### Scenario: No double-credit on already confirmed item
- **WHEN** admin changes an item's status TO `confirmed`
- **AND** the item's current status is already `confirmed`
- **THEN** the seller's `available_withdrawal` SHALL NOT be modified for that item

### Requirement: available_withdrawal is debited when product status changes FROM confirmed
The system SHALL atomically decrement the seller's `available_withdrawal` by `price_at_purchase - commission_amount` when an admin changes a product's status FROM `confirmed` to any other status.

#### Scenario: Debit seller on item status reversal from confirmed via single item update
- **WHEN** admin changes an item's status FROM `confirmed` to any other status
- **THEN** the seller's `available_withdrawal` SHALL be atomically decremented by `price_at_purchase - commission_amount`
- **AND** the operation SHALL be logged with seller ID, order ID, item ID, and debited amount

#### Scenario: Debit seller on item status reversal from confirmed via bulk order update
- **WHEN** admin changes an order's status to a non-confirmed status
- **AND** one or more items' current status IS `confirmed`
- **THEN** for each such item, the seller's `available_withdrawal` SHALL be atomically decremented by `price_at_purchase - commission_amount`

#### Scenario: Allow negative available_withdrawal
- **WHEN** the debit would cause `available_withdrawal` to go below zero
- **THEN** the system SHALL still apply the debit (allowing negative balance)
- **AND** the system SHALL log a warning indicating the negative balance

### Requirement: All status and balance changes are atomic
The system SHALL use batch/transaction operations (`createBatch()`) to ensure that all item status updates and `available_withdrawal` adjustments within a single request are applied atomically.

#### Scenario: Atomic bulk update with mixed withdrawal adjustments
- **WHEN** admin changes an order to `cancelled`
- **AND** the order has 3 items: one `confirmed` (needs debit), one `paid` (no withdrawal change), one `confirmed` (needs debit)
- **THEN** ALL status updates and both withdrawal debits SHALL be committed in a single atomic batch
- **AND** if any part fails, no changes SHALL be persisted

### Requirement: Admin order detail page shows status change actions
The admin order detail page (`/admin/pedidos/:id`) SHALL display a status change action for each individual product item and an order-level status change action.

#### Scenario: Change single product status from order detail
- **WHEN** admin clicks the status change action on a product item
- **THEN** a modal SHALL appear with a select dropdown showing all 7 statuses with Spanish labels
- **AND** admin selects a status and confirms
- **THEN** the system SHALL call `PATCH /api/admin/orders/:orderId/items/:itemId/status`
- **AND** the page SHALL update to reflect the new status

#### Scenario: Change all products status from order detail
- **WHEN** admin clicks the order-level status change action
- **THEN** a modal SHALL appear with a select dropdown showing all 7 statuses
- **AND** admin selects a status and confirms
- **THEN** the system SHALL call `PATCH /api/admin/orders/:orderId/status`
- **AND** the page SHALL update to reflect the new status for the order and all items

### Requirement: Admin orders list page shows order-level status change action
The admin orders list page (`/admin/pedidos`) SHALL display a status change action for each order row.

#### Scenario: Change order status from orders list
- **WHEN** admin clicks the status change action on an order row
- **THEN** a modal SHALL appear with a select dropdown showing all 7 statuses
- **AND** admin selects a status and confirms
- **THEN** the system SHALL call `PATCH /api/admin/orders/:orderId/status`
- **AND** the orders list SHALL reload to reflect the updated status

### Requirement: Admin API client methods for status changes
The frontend API client SHALL expose admin-specific methods for order and item status changes under `adminAPI.orders`.

#### Scenario: Call admin item status update
- **WHEN** `adminAPI.orders.updateItemStatus(orderId, itemId, status, productType)` is called
- **THEN** it SHALL send `PATCH /api/admin/orders/:orderId/items/:itemId/status` with `{ status, product_type }`

#### Scenario: Call admin order status update
- **WHEN** `adminAPI.orders.updateOrderStatus(orderId, status)` is called
- **THEN** it SHALL send `PATCH /api/admin/orders/:orderId/status` with `{ status }`
