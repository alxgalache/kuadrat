## MODIFIED Requirements

### Requirement: Pickup endpoint creates pickup in Sendcloud

The system SHALL provide a `POST /api/seller/orders/:orderId/pickup` endpoint that creates a pickup request in Sendcloud via `POST /v3/pickups`. The endpoint SHALL be accessible only to authenticated sellers who own 'other' type items in the specified order. The endpoint SHALL only consider items from the `other_order_items` table; art items SHALL be excluded from pickup scheduling entirely.

#### Scenario: Successful pickup creation
- **WHEN** an authenticated seller POSTs to `/api/seller/orders/1023/pickup` with valid address, time slots, and the seller has 'other' items with status 'paid' and a valid sendcloud_carrier_code
- **THEN** the system calls Sendcloud `POST /v3/pickups` with the carrier code, address, time slots, items (quantity: 1, container_type: parcel, total weight as sum of 'other' product weights only), and special_instructions, stores the result in `sendcloud_pickups`, updates only the seller's 'other' items in that order to status 'sent', and returns the pickup data

#### Scenario: Seller does not own 'other' items in order
- **WHEN** a seller tries to create a pickup for an order that contains none of their 'other' products (even if it contains their art products)
- **THEN** the system returns HTTP 404

#### Scenario: Order with only art items
- **WHEN** a seller tries to create a pickup for an order that contains only art items belonging to this seller
- **THEN** the system returns HTTP 404 with message indicating no eligible items were found

#### Scenario: Order items already sent
- **WHEN** a seller tries to create a pickup for an order where their 'other' items already have status 'sent' or later
- **THEN** the system returns HTTP 400 with an appropriate error message

#### Scenario: Pickup already exists for this order+seller
- **WHEN** a seller tries to create a pickup for an order that already has a record in `sendcloud_pickups` for this seller
- **THEN** the system returns HTTP 400 indicating a pickup is already scheduled

#### Scenario: Sendcloud API error
- **WHEN** Sendcloud returns a validation error (e.g., missing carrier-specific field)
- **THEN** the system returns the Sendcloud error message to the seller without creating a local record or changing item statuses

### Requirement: Weight calculation for pickup

The pickup items total weight SHALL be calculated as the sum of weights of only the seller's 'other' products in the order. Art product weights SHALL NOT be included. Weights are stored in grams in the `others.weight` column and SHALL be converted to kilograms for the Sendcloud API. Products without a weight SHALL default to 1000g (1kg).

#### Scenario: Order with only 'other' products that have weights
- **WHEN** the seller has 2 'other' products in the order: one weighing 500g and another weighing 1500g
- **THEN** the pickup API is called with `total_weight: { value: "2.00", unit: "kg" }`

#### Scenario: Mixed order with art and other products
- **WHEN** the seller has 1 art product weighing 3000g and 1 'other' product weighing 500g in the order
- **THEN** the pickup API is called with `total_weight: { value: "0.50", unit: "kg" }` (only the 'other' product weight)

#### Scenario: Product without weight
- **WHEN** an 'other' product has null/0 weight
- **THEN** it defaults to 1000g (1kg) for the weight calculation

### Requirement: Pickup button visibility

The "Programar recogida" button SHALL be visible on an order card only when ALL of the following conditions are met:
1. The seller's `first_mile` config is `'pickup'` OR is null/empty/undefined
2. The order's status is `'paid'`
3. No pickup record exists for this order+seller combination
4. The order contains at least one item with `productType === 'others'`

#### Scenario: Eligible seller with paid order containing 'other' items
- **WHEN** seller has `first_mile='pickup'`, order status is 'paid', no existing pickup, and the order has at least one 'other' item
- **THEN** "Programar recogida" button is visible

#### Scenario: Order with only art items
- **WHEN** seller has `first_mile='pickup'`, order status is 'paid', no existing pickup, but the order contains only 'art' items
- **THEN** "Programar recogida" button is NOT visible

#### Scenario: Mixed order with art and other items
- **WHEN** seller has `first_mile='pickup'`, order status is 'paid', no existing pickup, and the order has both 'art' and 'other' items
- **THEN** "Programar recogida" button is visible

#### Scenario: Seller with first_mile=dropoff
- **WHEN** seller has `first_mile='dropoff'`, order status is 'paid'
- **THEN** "Programar recogida" button is NOT visible

#### Scenario: Seller with empty first_mile
- **WHEN** seller has `first_mile=null` or empty, order status is 'paid', no existing pickup, and the order has 'other' items
- **THEN** "Programar recogida" button is visible

#### Scenario: Order already sent
- **WHEN** seller has `first_mile='pickup'`, order status is 'sent'
- **THEN** "Programar recogida" button is NOT visible

### Requirement: Status change to sent on pickup

When a pickup is successfully created, only the 'other' order items belonging to the seller in that order SHALL have their `status` updated to `'sent'` and `status_modified` updated to `CURRENT_TIMESTAMP`. Art order items SHALL remain unchanged.

#### Scenario: Successful pickup changes status of 'other' items only
- **WHEN** a pickup is created for order #1023 and the seller has 2 art items and 3 'other' items in that order
- **THEN** only the 3 'other' items have status='sent'; the 2 art items remain at their current status

### Requirement: Bulk pickup only processes 'other' items

The `POST /api/seller/orders/bulk-pickup` endpoint SHALL only load and process items from the `other_order_items` table for each selected order. Art items SHALL be excluded from weight calculation, Sendcloud API calls, and status transitions.

#### Scenario: Bulk pickup with mixed orders
- **WHEN** the seller selects 3 orders for bulk pickup, each containing both art and 'other' items
- **THEN** the weight calculation and status transitions only apply to 'other' items; art items remain unchanged

#### Scenario: Bulk pickup order with only art items
- **WHEN** one of the selected orders contains only art items for this seller
- **THEN** the system returns a 404 error for that order indicating no eligible items were found

### Requirement: Bulk pickup button visibility

The bulk "Programar recogida masiva" button in the "Pagados" tab SHALL only appear when there are paid orders that have a carrier code, no existing pickup, AND contain at least one 'other' item.

#### Scenario: All paid orders are art-only
- **WHEN** all paid orders contain only art items
- **THEN** the bulk "Programar recogida masiva" button SHALL NOT be displayed

#### Scenario: Some paid orders have 'other' items
- **WHEN** at least one paid order contains 'other' items, has a carrier code, and no existing pickup
- **THEN** the bulk "Programar recogida masiva" button SHALL be displayed
