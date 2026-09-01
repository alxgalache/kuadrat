# sendcloud-provider

## Purpose

The provider layer that isolates the rest of the application from Sendcloud. `ShippingProviderFactory` returns either `SendcloudProvider` or `LegacyProvider` per product type, so controllers and routes never talk to a carrier API directly and either flow can be switched off by configuration alone.

Below the factory sit the low-level `sendcloudApiClient` (OAuth2 client credentials with Basic Auth as a degradation path, token cache, single retry on 401/403) and the four provider operations: quoting delivery options, listing service points, announcing shipments and downloading labels. Two invariants cut across them — every parcel travels insured for the value of its goods, and an option without a usable rate is never returned.

## Requirements

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

The system SHALL provide a low-level HTTP client (`sendcloudApiClient.js`) that handles authentication (OAuth2 client credentials, with HTTP Basic Auth as fallback), token lifecycle, retry on authentication failure, request formatting, error handling, and structured logging for all Sendcloud API calls.

#### Scenario: Authentication with Sendcloud API
- **WHEN** any Sendcloud API call is made and `SENDCLOUD_AUTH_MODE` is `auto` or `oauth2`
- **THEN** the client SHALL obtain an OAuth2 access token from `https://account.sendcloud.com/oauth2/token` using `grant_type=client_credentials` and `scope=api`, authenticating that token request with `SENDCLOUD_API_KEY` as client id and `SENDCLOUD_API_SECRET` as client secret, and SHALL send it as `Authorization: Bearer <access_token>`

#### Scenario: Token cached and renewed before expiry
- **WHEN** a token has been obtained with `expires_in` seconds of validity
- **THEN** the client SHALL reuse it for subsequent calls and SHALL request a new one once fewer than 60 seconds of validity remain

#### Scenario: Concurrent calls share a single token request
- **WHEN** several Sendcloud calls are issued concurrently while no valid token is cached
- **THEN** exactly one request SHALL be made to the token endpoint and all callers SHALL await its result

#### Scenario: Retry once on authentication failure
- **WHEN** a Sendcloud API call returns HTTP 401 or 403 and the call has not already been retried
- **THEN** the client SHALL discard the cached token, obtain a new one, and repeat the request exactly once with the identical serialized body

#### Scenario: Fallback to Basic Auth in auto mode
- **WHEN** `SENDCLOUD_AUTH_MODE` is `auto` and a request still returns 401 or 403 after the retry
- **THEN** the client SHALL resolve that request using HTTP Basic Auth, SHALL log a warning including the status and response body, and SHALL suppress further OAuth2 attempts for five minutes

#### Scenario: No fallback in oauth2 mode
- **WHEN** `SENDCLOUD_AUTH_MODE` is `oauth2` and a request still returns 401 or 403 after the retry
- **THEN** the client SHALL NOT fall back to Basic Auth and SHALL throw an `ApiError`

#### Scenario: Basic-only mode bypasses OAuth2 entirely
- **WHEN** `SENDCLOUD_AUTH_MODE` is `basic`
- **THEN** no request SHALL be made to the token endpoint and every call SHALL use HTTP Basic Auth

#### Scenario: Non-authentication failures do not trigger fallback
- **WHEN** a Sendcloud API call returns HTTP 429 or a 5xx status
- **THEN** the client SHALL NOT discard the token, SHALL NOT retry for authentication reasons, and SHALL NOT fall back to Basic Auth

#### Scenario: Credentials never reach the logs
- **WHEN** any Sendcloud API request is issued at any log level
- **THEN** no log record SHALL contain the `Authorization` header value, the API secret, or the access token

#### Scenario: API error handling
- **WHEN** the Sendcloud API returns a non-2xx response
- **THEN** the client SHALL log the error with Pino (including status code and response body) and throw an `ApiError` with an appropriate HTTP status code

#### Scenario: Request timeout
- **WHEN** a Sendcloud API call does not respond within 10 seconds
- **THEN** the client SHALL abort the request and throw an `ApiError` with status 504

### Requirement: Sendcloud delivery options retrieval

The `SendcloudProvider.getDeliveryOptions()` method SHALL call `POST /v3/shipping-options` with seller configuration (from address, functionalities) and buyer destination expressed through the non-deprecated `from_address` and `to_address` objects, and return a normalized array of delivery options including rates, excluding any option that carries no usable rate. The rate of an option SHALL be the sum of the quotes it carries, one per parcel in the request, and never only the first.

#### Scenario: Option price is the sum of all its parcel quotes
- **WHEN** a request carries 3 parcels and Sendcloud returns an option whose `quotes` array holds 3 entries of 4.35 € each, labelled `Label (1/3)`, `Label (2/3)` and `Label (3/3)`
- **THEN** the normalized option's price SHALL be 13.05 €, not 4.35 €

#### Scenario: Single-parcel behaviour is unchanged
- **WHEN** a request carries exactly 1 parcel
- **THEN** the summed total SHALL equal the first quote's total, so the price of every existing single-parcel flow — the co-packed store cart and the art shipping calculator — is bit-for-bit what it was

#### Scenario: Lead time is the slowest parcel
- **WHEN** an option carries several quotes with different `lead_time` values
- **THEN** `estimatedDays` SHALL be derived from the greatest of them, because the order is not delivered until its last parcel arrives

#### Scenario: Quote count mismatch is reported
- **WHEN** the number of quotes returned for an option differs from the number of parcels sent
- **THEN** the system SHALL log a warning identifying the option and both counts, so a change in the API's response shape surfaces instead of silently mispricing

#### Scenario: An option is usable only if its summed rate is chargeable
- **WHEN** every quote of an option totals `"0"`, as `sendcloud:letter` does
- **THEN** the summed total SHALL be 0 and the option SHALL be discarded, preserving the existing filter

#### Scenario: Fetching delivery options with seller preferences
- **WHEN** `getDeliveryOptions()` is called with a seller who has `require_signature: true` and `fragile_goods: true` in their Sendcloud configuration
- **THEN** the request to `POST /v3/shipping-options` SHALL include `functionalities: { signature: true, fragile_goods: true }` and SHALL carry the seller's origin as `from_address: { country_code, postal_code }` and the buyer's destination as `to_address: { country_code, postal_code }`

#### Scenario: Deprecated address fields are not sent
- **WHEN** any request to `POST /v3/shipping-options` is built
- **THEN** it SHALL NOT contain `from_country_code`, `from_postal_code`, `to_country_code`, `to_postal_code` or `to_service_point_id`

#### Scenario: Service point expressed with the current field
- **WHEN** a request targets a specific service point
- **THEN** it SHALL use the `to_service_point` object rather than the deprecated `to_service_point_id`

#### Scenario: Every parcel is always insured
- **WHEN** delivery options are requested for any parcel, of any product type
- **THEN** `additional_insured_price` SHALL be present on every parcel, set to the total value of the goods it carries

#### Scenario: Seller insurance configuration is not consulted
- **WHEN** the request is built
- **THEN** `user_sendcloud_configuration.insurance_type` and `insurance_fixed_amount` SHALL NOT be read, and their values SHALL have no effect on the insured amount

#### Scenario: Insured value sent as an integer on shipping-options
- **WHEN** `additional_insured_price` is sent to `POST /v3/shipping-options`
- **THEN** it SHALL be a JSON number with no fractional part, rounded and clamped to the range 2–5000, and SHALL NOT be sent as an object

#### Scenario: Insured value clamped rather than rejected
- **WHEN** the goods value is below 2 € or above 5000 €
- **THEN** the value sent SHALL be clamped to 2 or 5000 respectively, matching the range Sendcloud actually prices — outside that range the API does not error, it silently charges the boundary premium

#### Scenario: Options without a usable rate are discarded
- **WHEN** an option's quote total is absent, non-numeric, or parses to zero or less
- **THEN** the option SHALL be excluded from the returned array

#### Scenario: Options with an empty quotes array are discarded
- **WHEN** an option is returned with `quotes: []`
- **THEN** the option SHALL be excluded from the returned array, since no price can be charged for it

#### Scenario: Multi-parcel rate query
- **WHEN** a seller group has multiple parcels (e.g., 2 art pieces)
- **THEN** the `parcels` array in the request SHALL contain one entry per parcel with individual weight and dimensions, and `calculate_quotes: true` SHALL be set

#### Scenario: Seller missing Sendcloud configuration
- **WHEN** `getDeliveryOptions()` is called for a seller without a `user_sendcloud_configuration` record
- **THEN** the method SHALL throw an `ApiError(400)` with message indicating the seller needs shipping configuration

#### Scenario: Normalized response format
- **WHEN** Sendcloud returns shipping options
- **THEN** each option SHALL be normalized to: `{ id, type ('home_delivery' | 'service_point'), carrier: { name, code, logoUrl }, price, currency, estimatedDays: { min, max }, shippingOptionCode, requiresServicePoint }`

### Requirement: Sendcloud service points retrieval

The `SendcloudProvider.getServicePoints()` method SHALL call `GET /v2/service-points` and return nearby carrier pickup locations for the buyer's destination.

#### Scenario: Search by postal code and carrier
- **WHEN** `getServicePoints()` is called with `{ carrier: 'correos_express', country: 'ES', postalCode: '28001' }`
- **THEN** the system SHALL call `GET /v2/service-points?country=ES&carrier=correos_express&postal_code=28001` and return an array of service points with `{ id, name, address, city, postalCode, country, carrier, openingTimes, distance }`

#### Scenario: Legacy provider returns empty service points
- **WHEN** `getServicePoints()` is called on `LegacyProvider`
- **THEN** it SHALL return an empty array

### Requirement: Sendcloud shipment creation

The `SendcloudProvider.createShipments()` method SHALL call `POST /v3/shipments` (asynchronous) for each parcel group and return shipment IDs and parcel IDs. The response envelope SHALL be correctly unwrapped. Every announced parcel SHALL carry the same insured amount that was quoted for it, so that a buyer who paid for insurance receives an insured shipment.

#### Scenario: Async endpoint used for shipment creation
- **WHEN** `createShipments()` is called
- **THEN** it SHALL send the request to `POST /v3/shipments` (not `/v3/shipments/announce`)

#### Scenario: Announced parcel carries the insured amount
- **WHEN** a shipment is announced for a parcel
- **THEN** the parcel SHALL include `additional_insured_price` derived from the same goods value used to quote it, so the parcel is not announced uninsured after the buyer was charged for insurance

#### Scenario: Insurance shape differs between the two endpoints
- **WHEN** `additional_insured_price` is sent to `POST /v3/shipments`
- **THEN** it SHALL use the object form `{ value, currency }` that this endpoint's schema requires, which is deliberately different from the plain integer that `POST /v3/shipping-options` requires

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
- **THEN** the request to Sendcloud SHALL include the service point reference in the shipment data using the non-deprecated `to_service_point` object

#### Scenario: Shipment includes parcel items for customs
- **WHEN** a shipment is created
- **THEN** each parcel SHALL include a `parcel_items` array with item descriptions, quantities, weights, prices, and `hs_code` and `origin_country` from the seller's Sendcloud configuration

#### Scenario: External reference ID included for idempotency
- **WHEN** a shipment is created
- **THEN** the request body SHALL include `external_reference_id` with a value derived from order ID, seller ID, and parcel index

#### Scenario: Shipment creation failure returns error result
- **WHEN** the Sendcloud API call fails for a parcel
- **THEN** `createShipments()` SHALL NOT throw; it SHALL push an error result with `sendcloudShipmentId: null`, `sendcloudParcelId: null`, and `error: <message>`, allowing other parcels in the batch to continue

### Requirement: Label document retrieval

The `SendcloudProvider` SHALL provide a method to download label documents using the parcel ID.

#### Scenario: Label PDF downloaded by parcel ID
- **WHEN** `getLabelPdf(parcelId)` is called
- **THEN** the system SHALL call `GET /v3/parcels/{parcelId}/documents/label` with `Accept: application/pdf` header and return the raw binary buffer

#### Scenario: Label not available yet
- **WHEN** the label document endpoint returns a 404 or error (parcel still announcing)
- **THEN** the method SHALL return null and log the condition

### Requirement: Legacy provider compatibility

The `LegacyProvider` SHALL wrap the existing database-based shipping logic, returning the same normalized response format as `SendcloudProvider`.

#### Scenario: Legacy delivery options use database queries
- **WHEN** `LegacyProvider.getDeliveryOptions()` is called
- **THEN** it SHALL query `shipping_methods`, `shipping_zones`, and `shipping_zones_postal_codes` tables using the existing zone-matching logic and return normalized options with `type: 'home_delivery'` or `type: 'seller_pickup'`

#### Scenario: Legacy createShipments is a no-op
- **WHEN** `LegacyProvider.createShipments()` is called
- **THEN** it SHALL return success without making any external API calls (legacy flow has no automatic shipment creation)

### Requirement: Environment configuration for Sendcloud

The system SHALL maintain Sendcloud-related environment variables in `api/config/env.js` under a `sendcloud` configuration group.

#### Scenario: Existing variables maintained
- **WHEN** the application starts
- **THEN** `SENDCLOUD_API_KEY`, `SENDCLOUD_API_SECRET`, `SENDCLOUD_WEBHOOK_SECRET`, `SENDCLOUD_ENABLED_ART`, `SENDCLOUD_ENABLED_OTHERS`, and `SENDCLOUD_AUTO_CONFIRM_DAYS` SHALL be available via `config.sendcloud.*`

#### Scenario: Required variables when Sendcloud is enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` or `SENDCLOUD_ENABLED_OTHERS` is `true`
- **THEN** `SENDCLOUD_API_KEY` and `SENDCLOUD_API_SECRET` MUST be non-empty, or the application SHALL log a warning at startup

#### Scenario: Default values for optional variables
- **WHEN** `SENDCLOUD_AUTO_CONFIRM_DAYS` is not set
- **THEN** it SHALL default to `14`
- **WHEN** `SENDCLOUD_WEBHOOK_SECRET` is not set
- **THEN** it SHALL default to an empty string

#### Scenario: New retry configuration
- **WHEN** the application starts
- **THEN** `SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES` SHALL default to `3` and be available via `config.sendcloud.maxAnnouncementRetries`

#### Scenario: Authentication mode configuration
- **WHEN** the application starts
- **THEN** `SENDCLOUD_AUTH_MODE` SHALL be available via `config.sendcloud.authMode`, SHALL accept only `auto`, `oauth2` or `basic`, and SHALL default to `auto`

#### Scenario: Invalid authentication mode rejected at startup
- **WHEN** `SENDCLOUD_AUTH_MODE` is set to any other value
- **THEN** startup validation SHALL fail loudly rather than silently selecting a default
