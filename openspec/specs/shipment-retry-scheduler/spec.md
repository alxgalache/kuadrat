## ADDED Requirements

### Requirement: Shipment retry scheduler

The system SHALL run a scheduled job that periodically retries failed Sendcloud shipment announcements and notifies the admin when retries are exhausted.

#### Scenario: Scheduler runs every 15 minutes
- **WHEN** the server is running
- **THEN** the shipment retry scheduler SHALL execute every 15 minutes using `node-cron`

#### Scenario: Identifies items needing retry
- **WHEN** the scheduler runs
- **THEN** it SHALL query both `art_order_items` and `other_order_items` for items where `sendcloud_shipment_id IS NOT NULL AND sendcloud_parcel_id IS NULL AND sendcloud_announcement_retries < 3`

#### Scenario: Retries shipment creation
- **WHEN** an item needing retry is found
- **THEN** the scheduler SHALL rebuild the shipment request body (from order + seller config data) and call `POST /v3/shipments` via `sendcloudProvider.createShipments()`

#### Scenario: Successful retry updates order item
- **WHEN** the retry shipment creation succeeds
- **THEN** the scheduler SHALL update the order item with the new `sendcloud_shipment_id` and `sendcloud_parcel_id`, and reset `sendcloud_announcement_retries` to 0

#### Scenario: Failed retry increments counter
- **WHEN** the retry shipment creation fails
- **THEN** the scheduler SHALL increment `sendcloud_announcement_retries` and set `sendcloud_announcement_failed_at` to the current timestamp on the order item

#### Scenario: Admin notified after max retries
- **WHEN** an order item reaches `sendcloud_announcement_retries = 3`
- **THEN** the scheduler SHALL call `sendShipmentFailedAdminEmail()` with the order ID, item details, and error information

#### Scenario: Error isolation per item
- **WHEN** a retry fails for one order item
- **THEN** the error SHALL be logged with Pino and other items SHALL continue processing (no batch failure)

#### Scenario: Uses external_reference_id for idempotency
- **WHEN** the scheduler retries a shipment creation
- **THEN** it SHALL use a new `external_reference_id` that includes the retry attempt number to avoid Sendcloud's uniqueness constraint rejection

### Requirement: Admin notification for shipment failure

The system SHALL send an email to the admin when a Sendcloud shipment announcement fails after all retry attempts.

#### Scenario: Admin failure email content
- **WHEN** `sendShipmentFailedAdminEmail()` is called
- **THEN** the email SHALL include: order ID, order item ID, product name, seller name, buyer name, number of retry attempts, last error message, and timestamp of last failure

#### Scenario: Admin failure email recipient
- **WHEN** a shipment failure admin email is sent
- **THEN** it SHALL be sent to the configured admin email address (from `config.email.from` or a dedicated admin address)

#### Scenario: Email function signature
- **WHEN** `sendShipmentFailedAdminEmail()` is called
- **THEN** it SHALL accept `{ orderId, orderItemId, productName, sellerName, buyerEmail, retryCount, lastError }` as parameters
