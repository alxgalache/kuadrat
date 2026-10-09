# seller-order-pickup Specification

## Purpose

Definir la solicitud de recogida en Sendcloud desde los pedidos del vendedor: validación, transportista, tabla de recogidas, cálculo del peso, botones, modal y paso del artículo a enviado.

## Requirements

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

### Requirement: Pickup request validation

The pickup endpoint SHALL validate the request body using a Zod schema. Required fields: `address` (name, countryCode, city, addressLine1, postalCode, email, phoneNumber), `timeSlotStart` (ISO 8601 datetime), `timeSlotEnd` (ISO 8601 datetime). Optional fields: `address.companyName`, `address.addressLine2`, `address.houseNumber`, `specialInstructions`.

#### Scenario: Valid request with all fields
- **WHEN** the request includes a complete address, valid time slots where start < end and interval <= 48 hours, and special instructions
- **THEN** validation passes

#### Scenario: Missing required address field
- **WHEN** the request omits `address.city`
- **THEN** validation returns HTTP 400 with field-specific error

#### Scenario: Time slot start after end
- **WHEN** `timeSlotStart` is after `timeSlotEnd`
- **THEN** validation returns HTTP 400 with error "La fecha de inicio debe ser anterior a la fecha de fin"

#### Scenario: Time slot interval exceeds 48 hours
- **WHEN** the interval between `timeSlotStart` and `timeSlotEnd` exceeds 48 hours
- **THEN** validation returns HTTP 400 with error "El intervalo maximo de tiempo es de 2 dias"

### Requirement: Carrier code stored on order items

The `art_order_items` and `other_order_items` tables SHALL include a `sendcloud_carrier_code TEXT` column. This column SHALL be populated during shipment creation in `sendcloudProvider.createShipments` by extracting the carrier code from the Sendcloud shipment response.

#### Scenario: Shipment created with carrier code
- **WHEN** a Sendcloud shipment is created for order items and the response contains carrier information
- **THEN** the `sendcloud_carrier_code` column is updated on all affected order items

#### Scenario: Carrier code used for pickup
- **WHEN** a seller creates a pickup for an order
- **THEN** the system reads `sendcloud_carrier_code` from the order items to use as the `carrier_code` parameter in the Sendcloud pickup API call

### Requirement: Sendcloud pickups table

The database SHALL include a `sendcloud_pickups` table with columns: `id` (PK), `order_id` (FK to orders), `seller_id` (FK to users), `sendcloud_pickup_id` (from Sendcloud response), `carrier_code`, `status` (default 'ANNOUNCING'), `pickup_address` (JSON string), `time_slot_start`, `time_slot_end`, `special_instructions`, `total_weight_kg`, `created_at`.

#### Scenario: Pickup record created
- **WHEN** a pickup is successfully created in Sendcloud
- **THEN** a record is inserted into `sendcloud_pickups` with all relevant data including the Sendcloud pickup ID and status

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

### Requirement: Pickup modal form

When the seller clicks "Programar recogida", a modal SHALL open with:
1. A checkbox labeled "Rellenar con la direccion por defecto" that populates address fields from `sellerConfig.defaultAddress`
2. Address fields: name, company name, address line 1, address line 2, house number, city, postal code, country code, phone, email
3. Two datetime inputs for time slot start and end
4. A text area for special instructions (optional)
5. A "Programar recogida" submit button
6. Client-side validation: required fields filled, start < end, interval <= 48 hours

#### Scenario: Fill with default address
- **WHEN** the seller checks "Rellenar con la direccion por defecto"
- **THEN** all address fields are populated with values from `sellerConfig.defaultAddress`

#### Scenario: Uncheck default address
- **WHEN** the seller unchecks "Rellenar con la direccion por defecto"
- **THEN** address fields are cleared (reset to empty)

#### Scenario: Submit with valid data
- **WHEN** the seller fills all required fields and clicks "Programar recogida"
- **THEN** the system calls `POST /api/seller/orders/:orderId/pickup` and on success closes the modal, shows a success notification, and refreshes the orders list

#### Scenario: Submit with Sendcloud error
- **WHEN** Sendcloud returns an error
- **THEN** the error message is displayed in the modal without closing it

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

### Requirement: Pickup creation function in sendcloud provider

The `sendcloudProvider` module SHALL export a `createPickup` function that accepts `{ carrierCode, address, timeSlots, items, specialInstructions }` and calls `POST /v3/pickups` via the sendcloud API client. The function SHALL return the Sendcloud response data (id, status, etc.) on success or throw an ApiError on failure.

#### Scenario: Successful API call
- **WHEN** `createPickup` is called with valid parameters
- **THEN** it calls `sendcloud.post('pickups', { body })` and returns `{ id, status, carrierCode, createdAt }`

#### Scenario: API failure
- **WHEN** Sendcloud returns an error
- **THEN** the error is propagated as-is (the existing sendcloud API client error handling applies)
