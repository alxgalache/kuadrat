## ADDED Requirements

### Requirement: Asynchronous shipment creation via Sendcloud V3 API

The system SHALL create Sendcloud shipments using the asynchronous endpoint `POST /v3/shipments` instead of the synchronous `POST /v3/shipments/announce`. The request body is identical; the response returns immediately with status `ANNOUNCING` and empty tracking/label fields.

#### Scenario: Shipment created via async endpoint
- **WHEN** `sendcloudProvider.createShipments()` is called after payment confirmation
- **THEN** the system SHALL send the request to `POST /v3/shipments` (not `/v3/shipments/announce`)

#### Scenario: Async response has empty tracking and label fields
- **WHEN** the async endpoint returns a 201 response
- **THEN** the response SHALL have `tracking_number: ""`, `tracking_url: null`, and `documents: []` on each parcel, and the status SHALL be `ANNOUNCING`

#### Scenario: Shipment ID and parcel ID extracted from response
- **WHEN** the async endpoint returns successfully
- **THEN** the system SHALL extract `shipment.id` as the shipment ID and `shipment.parcels[0].id` as the parcel ID from the unwrapped response envelope (`response.data`)

### Requirement: Response envelope unwrapping fix

The `sendcloudProvider.createShipments()` function SHALL correctly unwrap the Sendcloud V3 API response envelope before extracting shipment data.

#### Scenario: V3 response envelope unwrapped
- **WHEN** the Sendcloud API returns `{ "data": { "id": "shp_123", "parcels": [...] } }`
- **THEN** `createShipments()` SHALL access the inner object via `response.data` to extract `id`, `parcels`, `tracking_number`, and `tracking_url`

#### Scenario: Fallback for non-enveloped responses
- **WHEN** the API response does not contain a `data` wrapper (unexpected format)
- **THEN** the system SHALL fall back to using the response object directly (`response.data || response`)

### Requirement: Store both shipment ID and parcel ID on order items

After shipment creation, the system SHALL store both the shipment-level ID and the parcel-level ID on the corresponding order item records.

#### Scenario: Both IDs stored after successful shipment creation
- **WHEN** a Sendcloud shipment is created successfully
- **THEN** the system SHALL update the order item with `sendcloud_shipment_id` (from `shipment.id`) AND `sendcloud_parcel_id` (from `shipment.parcels[0].id`)

#### Scenario: Tracking fields initially empty for async shipments
- **WHEN** a shipment is created via the async endpoint
- **THEN** `tracking` and `sendcloud_tracking_url` on the order item SHALL be `null` initially, as these values arrive later via webhook

### Requirement: Database schema includes sendcloud_parcel_id

Both `art_order_items` and `other_order_items` tables SHALL include a `sendcloud_parcel_id TEXT` column with a database index.

#### Scenario: Column exists in CREATE TABLE
- **WHEN** the database is initialized
- **THEN** both `art_order_items` and `other_order_items` SHALL include `sendcloud_parcel_id TEXT` in their schema definition

#### Scenario: Index created for parcel ID
- **WHEN** the database is initialized
- **THEN** indexes `idx_art_oi_sendcloud_parcel` and `idx_other_oi_sendcloud_parcel` SHALL be created on the `sendcloud_parcel_id` column

#### Scenario: Manual migration SQL for existing databases
- **WHEN** the column is added to an existing database
- **THEN** the following SQL SHALL be executed manually:
  `ALTER TABLE art_order_items ADD COLUMN sendcloud_parcel_id TEXT;`
  `ALTER TABLE other_order_items ADD COLUMN sendcloud_parcel_id TEXT;`

### Requirement: Retry tracking columns on order items

Both `art_order_items` and `other_order_items` tables SHALL include columns for tracking shipment announcement retry state.

#### Scenario: Retry columns exist in schema
- **WHEN** the database is initialized
- **THEN** both tables SHALL include `sendcloud_announcement_retries INTEGER DEFAULT 0` and `sendcloud_announcement_failed_at DATETIME`

#### Scenario: Manual migration SQL for retry columns
- **WHEN** the columns are added to an existing database
- **THEN** the following SQL SHALL be executed manually:
  `ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0;`
  `ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0;`
  `ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME;`
  `ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME;`

### Requirement: Use external_reference_id for shipment idempotency

The system SHALL include an `external_reference_id` in the shipment creation request to prevent duplicate shipments during retries.

#### Scenario: External reference ID set on shipment
- **WHEN** `createShipments()` builds the shipment body
- **THEN** the `external_reference_id` field SHALL be set to a unique value derived from the order ID, seller ID, and parcel index (e.g., `"order-{orderId}-seller-{sellerId}-parcel-{index}"`)

#### Scenario: Duplicate shipment prevented on retry
- **WHEN** the retry scheduler re-creates a shipment with the same `external_reference_id`
- **THEN** Sendcloud SHALL reject the duplicate (the `external_reference_id` must be unique across shipments)
