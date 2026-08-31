## MODIFIED Requirements

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

The `SendcloudProvider.getDeliveryOptions()` method SHALL call `POST /v3/shipping-options` with seller configuration (from address, functionalities) and buyer destination expressed through the non-deprecated `from_address` and `to_address` objects, and return a normalized array of delivery options including rates, excluding any option that carries no usable rate.

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

#### Scenario: Normalized response format
- **WHEN** Sendcloud returns shipping options
- **THEN** each option SHALL be normalized to: `{ id, type ('home_delivery' | 'service_point'), carrier: { name, code, logoUrl }, price, currency, estimatedDays: { min, max }, shippingOptionCode, requiresServicePoint }`

### Requirement: Environment configuration for Sendcloud

The system SHALL maintain Sendcloud-related environment variables in `api/config/env.js` under a `sendcloud` configuration group.

#### Scenario: Existing variables maintained
- **WHEN** the application starts
- **THEN** `SENDCLOUD_API_KEY`, `SENDCLOUD_API_SECRET`, `SENDCLOUD_WEBHOOK_SECRET`, `SENDCLOUD_ENABLED_ART`, `SENDCLOUD_ENABLED_OTHERS`, and `SENDCLOUD_AUTO_CONFIRM_DAYS` SHALL be available via `config.sendcloud.*`

#### Scenario: New retry configuration
- **WHEN** the application starts
- **THEN** `SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES` SHALL default to `3` and be available via `config.sendcloud.maxAnnouncementRetries`

#### Scenario: Authentication mode configuration
- **WHEN** the application starts
- **THEN** `SENDCLOUD_AUTH_MODE` SHALL be available via `config.sendcloud.authMode`, SHALL accept only `auto`, `oauth2` or `basic`, and SHALL default to `auto`

#### Scenario: Invalid authentication mode rejected at startup
- **WHEN** `SENDCLOUD_AUTH_MODE` is set to any other value
- **THEN** startup validation SHALL fail loudly rather than silently selecting a default
