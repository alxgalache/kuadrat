## ADDED Requirements

### Requirement: Shipping provider abstraction layer

The system SHALL provide a `ShippingProviderFactory` that returns the appropriate shipping provider (`LegacyProvider` or `SendcloudProvider`) based on product type and environment configuration. Controllers and routes MUST interact only with the provider interface, never directly with Sendcloud or legacy shipping logic.

#### Scenario: Factory returns Sendcloud provider for art when enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and a shipping operation is requested for product type `art`
- **THEN** the factory SHALL return an instance of `SendcloudProvider`

#### Scenario: Factory returns legacy provider when Sendcloud is disabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `false` and a shipping operation is requested for product type `art`
- **THEN** the factory SHALL return an instance of `LegacyProvider`

#### Scenario: Independent configuration per product type
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and `SENDCLOUD_ENABLED_OTHERS` is `false`
- **THEN** art products SHALL use `SendcloudProvider` and others products SHALL use `LegacyProvider`

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

### Requirement: Sendcloud delivery options retrieval

The `SendcloudProvider.getDeliveryOptions()` method SHALL call `POST /v3/shipping-options` with seller configuration (from address, functionalities) and buyer destination, and return a normalized array of delivery options including rates.

#### Scenario: Fetching delivery options with seller preferences
- **WHEN** `getDeliveryOptions()` is called with a seller who has `require_signature: true` and `fragile_goods: true` in their Sendcloud configuration
- **THEN** the request to `POST /v3/shipping-options` SHALL include `functionalities: { signature: true, fragile_goods: true }` and use the seller's `sender_postal_code` and `sender_country` as `from_postal_code` and `from_country_code`

#### Scenario: Normalized response format
- **WHEN** Sendcloud returns shipping options
- **THEN** each option SHALL be normalized to: `{ id, type ('home_delivery' | 'service_point'), carrier: { name, code, logoUrl }, price, currency, estimatedDays: { min, max }, shippingOptionCode, requiresServicePoint }`

#### Scenario: Multi-parcel rate query
- **WHEN** a seller group has multiple parcels (e.g., 2 art pieces)
- **THEN** the `parcels` array in the request SHALL contain one entry per parcel with individual weight and dimensions, and `calculate_quotes: true` SHALL be set

#### Scenario: Seller missing Sendcloud configuration
- **WHEN** `getDeliveryOptions()` is called for a seller without a `user_sendcloud_configuration` record
- **THEN** the method SHALL throw an `ApiError(400)` with message indicating the seller needs shipping configuration

### Requirement: Sendcloud service points retrieval

The `SendcloudProvider.getServicePoints()` method SHALL call `GET /v2/service-points` and return nearby carrier pickup locations for the buyer's destination.

#### Scenario: Search by postal code and carrier
- **WHEN** `getServicePoints()` is called with `{ carrier: 'correos_express', country: 'ES', postalCode: '28001' }`
- **THEN** the system SHALL call `GET /v2/service-points?country=ES&carrier=correos_express&postal_code=28001` and return an array of service points with `{ id, name, address, city, postalCode, country, carrier, openingTimes, distance }`

#### Scenario: Legacy provider returns empty service points
- **WHEN** `getServicePoints()` is called on `LegacyProvider`
- **THEN** it SHALL return an empty array

### Requirement: Sendcloud shipment creation

The `SendcloudProvider.createShipments()` method SHALL call `POST /v3/shipments/announce` for each parcel group and return shipment IDs and label URLs.

#### Scenario: Creating shipment with service point
- **WHEN** a shipment is created for an order where the buyer selected a service point (ID 12345)
- **THEN** the request to Sendcloud SHALL include `to_service_point: 12345` in the shipment data

#### Scenario: Shipment includes parcel items for customs
- **WHEN** a shipment is created
- **THEN** each parcel SHALL include a `parcel_items` array with item descriptions, quantities, weights, prices, and `hs_code` and `origin_country` from the seller's Sendcloud configuration

#### Scenario: Label URL returned
- **WHEN** Sendcloud successfully creates a shipment
- **THEN** the response SHALL include the `sendcloud_shipment_id`, `tracking_number`, `tracking_url`, and `label_url` which are stored on the corresponding order items

### Requirement: Legacy provider compatibility

The `LegacyProvider` SHALL wrap the existing database-based shipping logic, returning the same normalized response format as `SendcloudProvider`.

#### Scenario: Legacy delivery options use database queries
- **WHEN** `LegacyProvider.getDeliveryOptions()` is called
- **THEN** it SHALL query `shipping_methods`, `shipping_zones`, and `shipping_zones_postal_codes` tables using the existing zone-matching logic and return normalized options with `type: 'home_delivery'` or `type: 'seller_pickup'`

#### Scenario: Legacy createShipments is a no-op
- **WHEN** `LegacyProvider.createShipments()` is called
- **THEN** it SHALL return success without making any external API calls (legacy flow has no automatic shipment creation)

### Requirement: Environment configuration for Sendcloud

The system SHALL add Sendcloud-related environment variables to `api/config/env.js` under a `sendcloud` configuration group.

#### Scenario: Required variables when Sendcloud is enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` or `SENDCLOUD_ENABLED_OTHERS` is `true`
- **THEN** `SENDCLOUD_API_KEY` and `SENDCLOUD_API_SECRET` MUST be non-empty, or the application SHALL log a warning at startup

#### Scenario: Default values for optional variables
- **WHEN** `SENDCLOUD_AUTO_CONFIRM_DAYS` is not set
- **THEN** it SHALL default to `14`
- **WHEN** `SENDCLOUD_WEBHOOK_SECRET` is not set
- **THEN** it SHALL default to an empty string
