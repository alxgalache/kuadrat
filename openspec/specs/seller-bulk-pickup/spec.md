## ADDED Requirements

### Requirement: Bulk pickup modal with carrier selection

The system SHALL provide a "Programar recogida" button above the orders list in the "Pagados" tab that opens a multi-step modal for scheduling a bulk pickup.

#### Scenario: Button visibility
- **WHEN** the seller is viewing the "Pagados" tab and there are orders with a carrier code and no existing pickup
- **THEN** the "Programar recogida" button SHALL be displayed above the orders list

#### Scenario: Button hidden when no eligible orders
- **WHEN** the seller is viewing the "Pagados" tab but no orders have a carrier code, or all have existing pickups
- **THEN** the "Programar recogida" button SHALL NOT be displayed

#### Scenario: Button hidden on other tabs
- **WHEN** the seller is viewing any tab other than "Pagados"
- **THEN** the bulk "Programar recogida" button SHALL NOT be displayed

### Requirement: Carrier selection step

The bulk pickup modal SHALL display a dropdown to select the carrier as its first step.

#### Scenario: Carrier dropdown populated from current orders
- **WHEN** the bulk pickup modal opens
- **THEN** the carrier dropdown SHALL list unique carrier codes from the visible paid orders that are eligible for pickup (have carrier code, no existing pickup)

#### Scenario: Carrier display format
- **WHEN** carrier codes are shown in the dropdown
- **THEN** they SHALL be displayed with underscores replaced by spaces and capitalized (e.g., `correos_express` → "Correos Express")

### Requirement: Order selection step

After selecting a carrier, the modal SHALL display a list of eligible paid orders for that carrier with checkboxes.

#### Scenario: Order list filtered by carrier
- **WHEN** the seller selects a carrier
- **THEN** the modal SHALL display only paid orders whose items have the selected carrier code and no existing pickup

#### Scenario: Order selection via checkboxes
- **WHEN** the order list is displayed
- **THEN** each order SHALL have a checkbox, and the seller SHALL be able to select or deselect individual orders

#### Scenario: Select all orders
- **WHEN** the order list is displayed
- **THEN** a "Seleccionar todos" checkbox SHALL be available to toggle selection of all listed orders

#### Scenario: Order info in selection list
- **WHEN** orders are listed for selection
- **THEN** each order row SHALL display the order ID and delivery address summary

### Requirement: Pickup form after order selection

After selecting orders, the modal SHALL display the same address and time slot form as the individual PickupModal.

#### Scenario: Form fields match individual pickup
- **WHEN** orders are selected and the seller proceeds to the form
- **THEN** the form SHALL include: name, company, address line 1, address line 2, house number, city, postal code, country code, phone, email, time slot start/end, and special instructions

#### Scenario: Default address auto-fill
- **WHEN** the seller has a default address configured in their Sendcloud settings
- **THEN** a "Rellenar con la dirección por defecto" checkbox SHALL be available to auto-fill the address fields

#### Scenario: Same validation rules as individual pickup
- **WHEN** the seller submits the bulk pickup form
- **THEN** the same validation rules SHALL apply: required fields, email format, country code length, time slot ordering, and 48-hour max window

### Requirement: Bulk pickup API endpoint

The system SHALL provide a `POST /api/seller/orders/bulk-pickup` endpoint that schedules a single Sendcloud pickup for multiple orders.

#### Scenario: Successful bulk pickup
- **WHEN** the seller submits a valid bulk pickup request with order IDs, address, and time slot
- **THEN** the system SHALL create a single Sendcloud pickup via `POST /v3/pickups` with one item per selected order and update all items' status to 'sent'

#### Scenario: Items aggregation in Sendcloud request
- **WHEN** the pickup request is sent to Sendcloud
- **THEN** the `items` array SHALL contain one entry per selected order, each with `quantity: 1`, `container_type: "parcel"`, and `total_weight` calculated from the order's items. The top-level `quantity` SHALL equal the number of selected orders.

#### Scenario: Pickup records stored per order
- **WHEN** the bulk pickup is successfully created
- **THEN** the system SHALL insert one row in `sendcloud_pickups` per selected order, all sharing the same `sendcloud_pickup_id`

#### Scenario: Validation - all orders must be paid
- **WHEN** any selected order's items are not in 'paid' status
- **THEN** the system SHALL return a 400 error

#### Scenario: Validation - all orders must share same carrier
- **WHEN** the selected orders have items with different carrier codes
- **THEN** the system SHALL return a 400 error

#### Scenario: Validation - no duplicate pickups
- **WHEN** any selected order already has a pickup record for this seller
- **THEN** the system SHALL return a 400 error indicating which orders already have pickups

#### Scenario: Request body structure
- **WHEN** the frontend calls `POST /api/seller/orders/bulk-pickup`
- **THEN** the request body SHALL include `orderIds` (array of integers), `address` (object), `timeSlotStart` (ISO string), `timeSlotEnd` (ISO string), and optional `specialInstructions` (string)
