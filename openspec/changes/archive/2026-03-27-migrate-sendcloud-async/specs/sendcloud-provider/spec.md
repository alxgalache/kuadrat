## MODIFIED Requirements

### Requirement: Sendcloud shipment creation

The `SendcloudProvider.createShipments()` method SHALL call `POST /v3/shipments` (asynchronous) for each parcel group and return shipment IDs and parcel IDs. The response envelope SHALL be correctly unwrapped.

#### Scenario: Async endpoint used for shipment creation
- **WHEN** `createShipments()` is called
- **THEN** it SHALL send the request to `POST /v3/shipments` (not `/v3/shipments/announce`)

#### Scenario: Response envelope correctly unwrapped
- **WHEN** the Sendcloud V3 API returns `{ "data": { "id": "...", "parcels": [...] } }`
- **THEN** `createShipments()` SHALL unwrap the envelope via `response.data || response` before extracting shipment fields

#### Scenario: Shipment ID and parcel ID extracted
- **WHEN** a shipment is created successfully
- **THEN** the result SHALL include `sendcloudShipmentId` from the unwrapped `data.id`, and `sendcloudParcelId` from `data.parcels[0].id`

#### Scenario: Tracking fields empty for async response
- **WHEN** the async endpoint returns successfully
- **THEN** `trackingNumber` and `trackingUrl` in the result SHALL be null (these arrive later via webhook), and `labelUrl` SHALL be null

#### Scenario: Creating shipment with service point
- **WHEN** a shipment is created for an order where the buyer selected a service point (ID 12345)
- **THEN** the request to Sendcloud SHALL include `to_service_point: 12345` in the shipment data

#### Scenario: Shipment includes parcel items for customs
- **WHEN** a shipment is created
- **THEN** each parcel SHALL include a `parcel_items` array with item descriptions, quantities, weights, prices, and `hs_code` and `origin_country` from the seller's Sendcloud configuration

#### Scenario: External reference ID included for idempotency
- **WHEN** a shipment is created
- **THEN** the request body SHALL include `external_reference_id` with a value derived from order ID, seller ID, and parcel index

#### Scenario: Shipment creation failure returns error result
- **WHEN** the Sendcloud API call fails for a parcel
- **THEN** `createShipments()` SHALL NOT throw; it SHALL push an error result with `sendcloudShipmentId: null`, `sendcloudParcelId: null`, and `error: <message>`, allowing other parcels in the batch to continue

### Requirement: Sendcloud API client

The system SHALL provide a low-level HTTP client (`sendcloudApiClient.js`) that handles authentication (HTTP Basic Auth with API key + secret), request formatting, error handling, and structured logging for all Sendcloud API calls.

#### Scenario: Authentication with Sendcloud API
- **WHEN** any Sendcloud API call is made
- **THEN** the client SHALL authenticate using HTTP Basic Auth with `SENDCLOUD_API_KEY` as username and `SENDCLOUD_API_SECRET` as password from `config.sendcloud.*`

#### Scenario: API error handling
- **WHEN** the Sendcloud API returns a non-2xx response
- **THEN** the client SHALL log the error with Pino (including status code and response body) and throw an `ApiError` with an appropriate HTTP status code

#### Scenario: Request timeout
- **WHEN** a Sendcloud API call does not respond within 10 seconds
- **THEN** the client SHALL abort the request and throw an `ApiError` with status 504

### Requirement: Label document retrieval

The `SendcloudProvider` SHALL provide a method to download label documents using the parcel ID.

#### Scenario: Label PDF downloaded by parcel ID
- **WHEN** `getLabelPdf(parcelId)` is called
- **THEN** the system SHALL call `GET /v3/parcels/{parcelId}/documents/label` with `Accept: application/pdf` header and return the raw binary buffer

#### Scenario: Label not available yet
- **WHEN** the label document endpoint returns a 404 or error (parcel still announcing)
- **THEN** the method SHALL return null and log the condition

### Requirement: Sendcloud delivery options retrieval

The `SendcloudProvider.getDeliveryOptions()` method SHALL call `POST /v3/shipping-options` with seller configuration (from address, functionalities) and buyer destination, and return a normalized array of delivery options including rates.

#### Scenario: Fetching delivery options with seller preferences
- **WHEN** `getDeliveryOptions()` is called with a seller who has `require_signature: true` and `fragile_goods: true` in their Sendcloud configuration
- **THEN** the request to `POST /v3/shipping-options` SHALL include `functionalities: { signature: true, fragile_goods: true }` and use the seller's `sender_postal_code` and `sender_country` as `from_postal_code` and `from_country_code`

#### Scenario: Normalized response format
- **WHEN** Sendcloud returns shipping options
- **THEN** each option SHALL be normalized to: `{ id, type ('home_delivery' | 'service_point'), carrier: { name, code, logoUrl }, price, currency, estimatedDays: { min, max }, shippingOptionCode, requiresServicePoint }`

### Requirement: Sendcloud service points retrieval

The `SendcloudProvider.getServicePoints()` method SHALL call `GET /v2/service-points` and return nearby carrier pickup locations for the buyer's destination.

#### Scenario: Search by postal code and carrier
- **WHEN** `getServicePoints()` is called with `{ carrier: 'correos_express', country: 'ES', postalCode: '28001' }`
- **THEN** the system SHALL call `GET /v2/service-points?country=ES&carrier=correos_express&postal_code=28001` and return an array of service points

### Requirement: Environment configuration for Sendcloud

The system SHALL maintain Sendcloud-related environment variables in `api/config/env.js` under a `sendcloud` configuration group.

#### Scenario: Existing variables maintained
- **WHEN** the application starts
- **THEN** `SENDCLOUD_API_KEY`, `SENDCLOUD_API_SECRET`, `SENDCLOUD_WEBHOOK_SECRET`, `SENDCLOUD_ENABLED_ART`, `SENDCLOUD_ENABLED_OTHERS`, and `SENDCLOUD_AUTO_CONFIRM_DAYS` SHALL be available via `config.sendcloud.*`

#### Scenario: New retry configuration
- **WHEN** the application starts
- **THEN** `SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES` SHALL default to `3` and be available via `config.sendcloud.maxAnnouncementRetries`
