## ADDED Requirements

### Requirement: Atomic inventory reservation for art items

The `placeOrder` endpoint SHALL atomically check and reserve art items using a conditional `UPDATE art SET is_sold = 1 WHERE id = ? AND is_sold = 0` statement within a Turso batch transaction. The system SHALL verify `rowsAffected === 1` to confirm successful reservation. If `rowsAffected === 0`, the system SHALL reject the order with an appropriate error indicating the item is no longer available.

#### Scenario: Single buyer purchases available art item
- **WHEN** a buyer submits a placeOrder request containing an art item with `is_sold = 0`
- **THEN** the system SHALL atomically set `is_sold = 1` for that item and create the order successfully

#### Scenario: Two concurrent buyers attempt to purchase the same art item
- **WHEN** two buyers submit placeOrder requests for the same art item simultaneously
- **THEN** exactly one request SHALL succeed (the one whose UPDATE executes first with `rowsAffected = 1`) and the other SHALL fail with a 409 Conflict error indicating the item has already been sold

#### Scenario: Buyer attempts to purchase an already-sold art item
- **WHEN** a buyer submits a placeOrder request for an art item with `is_sold = 1`
- **THEN** the system SHALL reject the order with a 409 Conflict error and NOT create any order records

### Requirement: Atomic stock reservation for other product variants

The `placeOrder` endpoint SHALL atomically decrement variant stock using a conditional `UPDATE others_variations SET stock = stock - 1 WHERE id = ? AND stock > 0` statement within a Turso batch transaction. The system SHALL verify `rowsAffected === 1` to confirm successful reservation.

#### Scenario: Buyer purchases last-in-stock variant
- **WHEN** a buyer submits a placeOrder request for an `others` variant with `stock = 1`
- **THEN** the system SHALL atomically decrement stock to 0 and create the order successfully

#### Scenario: Two concurrent buyers attempt to purchase the last-stock variant
- **WHEN** two buyers submit placeOrder requests for the same variant with `stock = 1` simultaneously
- **THEN** exactly one request SHALL succeed and the other SHALL fail with a 409 Conflict error indicating the item is out of stock

#### Scenario: Buyer attempts to purchase out-of-stock variant
- **WHEN** a buyer submits a placeOrder request for an `others` variant with `stock = 0`
- **THEN** the system SHALL reject the order with a 409 Conflict error and NOT create any order records

### Requirement: Reservation rollback on payment failure

The system SHALL release reserved inventory when an order's payment fails or is cancelled. For art items, this means setting `is_sold = 0`. For other product variants, this means incrementing `stock` by the reserved quantity.

#### Scenario: Stripe payment intent expires without payment
- **WHEN** a Stripe payment intent associated with an order expires or is cancelled
- **THEN** the system SHALL reset `is_sold = 0` for any art items in that order and increment `stock` for any variant items

#### Scenario: Order is manually cancelled before payment
- **WHEN** an order with reserved inventory is cancelled before payment completes
- **THEN** the system SHALL release all reserved inventory atomically via a batch transaction

### Requirement: Reservation TTL cleanup

The system SHALL run a periodic cleanup job that releases inventory reservations for orders that remain unpaid beyond a configurable timeout period. The order record SHALL be updated to a `cancelled` or `expired` status.

#### Scenario: Unpaid order exceeds reservation timeout
- **WHEN** an order has been in `pending` status for longer than the configured reservation TTL (default: 30 minutes)
- **THEN** the cleanup job SHALL release all reserved inventory for that order and update the order status to `expired`

#### Scenario: Paid order is not affected by cleanup
- **WHEN** an order has been paid and is in `paid` or `confirmed` status
- **THEN** the cleanup job SHALL NOT modify that order's inventory reservations

### Requirement: Inventory change logging

The system SHALL log all inventory state changes (reservation, release, confirmation) with structured Pino logging including the order ID, product ID, action type, and user context.

#### Scenario: Art item reserved during order
- **WHEN** an art item's `is_sold` is changed from 0 to 1 during order creation
- **THEN** the system SHALL log an info-level entry with `{ action: 'inventory_reserved', productId, orderId, type: 'art' }`

#### Scenario: Inventory released during cleanup
- **WHEN** reserved inventory is released by the TTL cleanup job
- **THEN** the system SHALL log a warn-level entry with `{ action: 'inventory_released', productId, orderId, reason: 'reservation_expired' }`
