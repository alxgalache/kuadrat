## MODIFIED Requirements

### Requirement: Atomic inventory reservation for art items

The `placeOrder` endpoint SHALL atomically check and reserve one edition copy per art item using a conditional counter increment within a Turso batch transaction:

```sql
UPDATE art
SET editions_sold = editions_sold + 1,
    is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
WHERE id = ? AND editions_sold < edition_size
```

The system SHALL verify `rowsAffected === 1` to confirm successful reservation. If `rowsAffected === 0`, the system SHALL reject the order with an appropriate error indicating the item is no longer available, rolling back any copies already reserved in the same batch via the guarded decrement. `is_sold` SHALL only be written together with `editions_sold` in the same statement (it means "edition sold out"; for `edition_size = 1` the behavior is identical to the previous binary flag).

#### Scenario: Single buyer purchases available art item
- **WHEN** a buyer submits a placeOrder request containing an art item with `editions_sold < edition_size`
- **THEN** the system SHALL atomically increment `editions_sold` and create the order successfully
- **AND** `is_sold` SHALL become 1 only if this reservation consumed the last copy

#### Scenario: Two concurrent buyers attempt to purchase the last remaining copy
- **WHEN** two buyers submit placeOrder requests for the same art item with exactly one copy remaining
- **THEN** exactly one request SHALL succeed (the one whose UPDATE executes first with `rowsAffected = 1`) and the other SHALL fail with a 409 Conflict error indicating the item has already been sold

#### Scenario: Two concurrent buyers purchase copies of an edition with copies to spare
- **WHEN** two buyers submit placeOrder requests for the same art item with `edition_size = 15` and `editions_sold = 3`
- **THEN** both requests SHALL succeed and `editions_sold` SHALL end at 5

#### Scenario: Buyer attempts to purchase a sold-out edition
- **WHEN** a buyer submits a placeOrder request for an art item with `editions_sold >= edition_size`
- **THEN** the system SHALL reject the order with a 409 Conflict error and NOT create any order records

### Requirement: Reservation rollback on payment failure

The system SHALL release reserved inventory when an order's payment fails or is cancelled. For art items, this means the guarded decrement `UPDATE art SET editions_sold = MAX(editions_sold - 1, 0), is_sold = 0 WHERE id = ? AND editions_sold > 0`. For other product variants, this means incrementing `stock` by the reserved quantity.

Release SHALL happen at most once per order: `releaseOrderInventory` SHALL first claim the release by setting `orders.inventory_released_at = CURRENT_TIMESTAMP` conditionally (`WHERE id = ? AND inventory_released_at IS NULL`) and SHALL only proceed when that claim succeeds (`rowsAffected = 1`). The `orders` table SHALL include the `inventory_released_at DATETIME` column (idempotent schema + `safeAlter`).

#### Scenario: Stripe payment intent expires without payment
- **WHEN** a Stripe payment intent associated with an order expires or is cancelled
- **THEN** the system SHALL decrement `editions_sold` and reset `is_sold = 0` for any art items in that order and increment `stock` for any variant items

#### Scenario: Order is manually cancelled before payment
- **WHEN** an order with reserved inventory is cancelled before payment completes
- **THEN** the system SHALL release all reserved inventory atomically via a batch transaction

#### Scenario: Double release attempt for the same order
- **WHEN** `releaseOrderInventory` is invoked twice for the same order (e.g., webhook plus TTL cleanup)
- **THEN** only the first invocation SHALL modify inventory; the second SHALL detect `inventory_released_at` already set and perform no inventory changes

## ADDED Requirements

### Requirement: Legacy payment verification does not consume inventory again

The legacy `verifyPayment` path SHALL NOT mark art inventory on payment success: the reservation performed by `placeOrder` is the single point of consumption for checkout, and re-marking (`is_sold = 1`, formerly idempotent as a flag) would double-count with a counter. The variant-stock handling of that path remains unchanged.

#### Scenario: Payment verified for an order with a reserved art item
- **WHEN** `verifyPayment` confirms payment for an order whose art items were reserved at `placeOrder`
- **THEN** the order and item statuses are updated to `paid`
- **AND** `editions_sold` and `is_sold` of the art rows are NOT modified by this path
