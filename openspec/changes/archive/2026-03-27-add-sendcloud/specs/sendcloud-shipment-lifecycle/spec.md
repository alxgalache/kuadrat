## ADDED Requirements

### Requirement: Post-payment shipment creation

After a successful payment (Stripe or Revolut webhook), the system SHALL automatically create Sendcloud shipments for all order items that use the Sendcloud provider.

#### Scenario: Shipments created after payment confirmation
- **WHEN** `processOrderConfirmation()` completes successfully and the order contains items with Sendcloud shipping
- **THEN** the system SHALL call `SendcloudProvider.createShipments()` for each seller/parcel group, creating one shipment per parcel via `POST /v3/shipments/announce`

#### Scenario: Shipment data stored on order items
- **WHEN** Sendcloud shipments are created successfully
- **THEN** the `sendcloud_shipment_id`, `tracking` (tracking number), and `sendcloud_tracking_url` SHALL be stored on the corresponding `art_order_items` or `other_order_items` records

#### Scenario: Shipment creation failure does not block order
- **WHEN** Sendcloud shipment creation fails (API error, timeout)
- **THEN** the order SHALL remain in `paid` status, the error SHALL be logged with Pino, and an admin alert SHALL be triggered. The order is NOT rolled back — payment is already captured.

#### Scenario: From address uses seller Sendcloud config
- **WHEN** a shipment is created
- **THEN** the `from_address` SHALL use the seller's `user_sendcloud_configuration` sender fields (sender_name, sender_address_1, sender_city, etc.)

#### Scenario: To address uses buyer delivery address
- **WHEN** a shipment is created
- **THEN** the `to_address` SHALL use the buyer's delivery address from the order

#### Scenario: Service point included when selected
- **WHEN** the buyer selected a service point for a seller group during checkout
- **THEN** the shipment creation request SHALL include `to_service_point` with the selected service point ID

#### Scenario: Insurance based on seller config
- **WHEN** the seller's `insurance_type` is `'full_value'`
- **THEN** the parcel's `additional_insured_price` SHALL be set to the total product value in that parcel
- **WHEN** the seller's `insurance_type` is `'fixed'`
- **THEN** the parcel's `additional_insured_price` SHALL be set to `insurance_fixed_amount`

### Requirement: Sendcloud webhook endpoint

The system SHALL provide a `POST /api/shipping/webhook` endpoint that receives Sendcloud event notifications and updates order item statuses accordingly.

#### Scenario: Webhook receives status update
- **WHEN** Sendcloud sends a webhook notification with a shipment status change
- **THEN** the system SHALL look up the order item by `sendcloud_shipment_id`, map the Sendcloud status to the internal status, and update the order item

#### Scenario: Status mapping — shipment in transit
- **WHEN** the webhook reports Sendcloud status code 3 (en route to sorting center) or equivalent transit status
- **THEN** the order item status SHALL be updated to `sent` and `status_modified` SHALL be set to current timestamp

#### Scenario: Status mapping — delivered
- **WHEN** the webhook reports Sendcloud delivered status
- **THEN** the order item status SHALL be updated to `arrived` and `status_modified` SHALL be set to current timestamp

#### Scenario: Status mapping — cancelled
- **WHEN** the webhook reports Sendcloud status 2000 (cancelled)
- **THEN** the system SHALL log a warning, NOT automatically update the order item status, and trigger an admin notification for manual handling

#### Scenario: Webhook signature validation
- **WHEN** `SENDCLOUD_WEBHOOK_SECRET` is configured
- **THEN** the webhook endpoint SHALL validate the request signature and reject requests with invalid signatures with a 401 response

#### Scenario: Unknown shipment ID
- **WHEN** the webhook receives a notification for a `sendcloud_shipment_id` not found in the database
- **THEN** the system SHALL log a warning and return 200 (acknowledge receipt to prevent retries)

### Requirement: Buyer notification on shipment status change

The system SHALL send email notifications to the buyer when significant shipment status changes occur.

#### Scenario: Shipment sent notification
- **WHEN** an order item status changes to `sent` via webhook
- **THEN** the system SHALL send a "Tu pedido ha sido enviado" email to the buyer with tracking number and tracking URL

#### Scenario: Shipment delivered notification
- **WHEN** an order item status changes to `arrived` via webhook
- **THEN** the system SHALL send a "Tu pedido ha sido entregado" email to the buyer

### Requirement: Auto-confirm delivery scheduler

The system SHALL run a scheduled job that automatically confirms delivery after a configurable number of days, crediting the seller's earnings.

#### Scenario: Auto-confirm after X days
- **WHEN** an order item has status `arrived` and `status_modified` is older than `SENDCLOUD_AUTO_CONFIRM_DAYS` days
- **THEN** the scheduler SHALL update the status to `confirmed` and increment the seller's `available_withdrawal` by the item's sale price minus commission

#### Scenario: Scheduler runs hourly
- **WHEN** the server is running
- **THEN** the confirmation scheduler SHALL execute every hour using `node-cron`

#### Scenario: Error isolation per item
- **WHEN** auto-confirmation fails for one item (e.g., database error)
- **THEN** the error SHALL be logged and other items SHALL continue processing (no batch failure)

#### Scenario: Only Sendcloud-managed items auto-confirm
- **WHEN** the scheduler runs
- **THEN** it SHALL only process order items that have a non-null `sendcloud_shipment_id` (legacy items are confirmed manually by sellers)

### Requirement: Seller notification on new order

The system SHALL send an email notification to the seller when a new order is placed containing their products.

#### Scenario: Seller receives order notification with label info
- **WHEN** a Sendcloud shipment is created for a seller's products
- **THEN** the system SHALL send an email to the seller with order details, item list, and a link to download the shipping label from their seller dashboard

### Requirement: Database schema changes for shipment tracking

The `art_order_items` and `other_order_items` tables SHALL include columns for Sendcloud shipment tracking data.

#### Scenario: New columns on order items tables
- **WHEN** the database is initialized
- **THEN** both `art_order_items` and `other_order_items` tables SHALL include `sendcloud_shipment_id TEXT` and `sendcloud_tracking_url TEXT` columns

#### Scenario: Tracking data populated after shipment creation
- **WHEN** a Sendcloud shipment is created for an order item
- **THEN** `sendcloud_shipment_id` SHALL contain the Sendcloud shipment identifier, `tracking` SHALL contain the carrier tracking number, and `sendcloud_tracking_url` SHALL contain the public tracking URL
