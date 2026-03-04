## ADDED Requirements

### Requirement: Seller balance persistence
The system SHALL store each seller's available withdrawal balance in the `users` table as a `available_withdrawal` column of type `REAL NOT NULL DEFAULT 0`. This column represents the total funds available for the seller to withdraw at any given time.

#### Scenario: New seller has zero balance
- **WHEN** a new seller account is created
- **THEN** their `available_withdrawal` value SHALL be `0`

#### Scenario: Balance is readable via API
- **WHEN** an authenticated seller requests `GET /api/seller/wallet`
- **THEN** the system SHALL return their current `available_withdrawal` value and the dealer commission percentage

### Requirement: Balance increment on item confirmation
The system SHALL increment a seller's `available_withdrawal` when an individual order item (in `art_order_items` or `other_order_items`) transitions to `confirmed` status via the `updateItemStatus` endpoint. The balance update and status change MUST occur within the same atomic transaction/batch. The seller is determined by joining the item with its product table (`art.seller_id` or `others.seller_id`).

#### Scenario: Single item confirmed
- **WHEN** an order item's status is changed to `confirmed` via `PATCH /api/orders/:orderId/items/:itemId/status`
- **THEN** the item's seller's `available_withdrawal` SHALL increase by `(price_at_purchase - commission_amount)` for that specific item

#### Scenario: Multi-seller order — items confirmed independently
- **WHEN** an order contains items from sellers A and B, and only seller A's item is confirmed
- **THEN** only seller A's `available_withdrawal` SHALL increase; seller B's balance SHALL remain unchanged

#### Scenario: All items confirmed promotes order status
- **WHEN** all items in an order (across all sellers) have reached `confirmed` status
- **THEN** the order-level status (`orders.status`) SHALL also be updated to `confirmed`

#### Scenario: Duplicate confirmation prevention
- **WHEN** an item that is already in `confirmed` status receives another `confirmed` status update
- **THEN** the system SHALL NOT increment the seller's balance a second time (guard against the item's previous status)

#### Scenario: Only the specific confirmed item affects balance
- **WHEN** an order has multiple items and only one is being confirmed
- **THEN** only that item's `(price_at_purchase - commission_amount)` SHALL be added to the seller's balance; other items in the order are not affected

### Requirement: Commission rate exposure
The system SHALL expose the dealer commission percentage to the frontend via the `NEXT_PUBLIC_DEALER_COMMISSION` environment variable, defaulting to `15` if not set.

#### Scenario: Commission displayed from environment variable
- **WHEN** a seller views the Monedero section
- **THEN** the commission percentage text SHALL display the value from `NEXT_PUBLIC_DEALER_COMMISSION`

#### Scenario: Default commission when variable is not set
- **WHEN** `NEXT_PUBLIC_DEALER_COMMISSION` is not defined in the environment
- **THEN** the system SHALL use `15` as the default commission percentage
