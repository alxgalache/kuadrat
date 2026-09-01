## MODIFIED Requirements

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

#### Scenario: Every parcel is always insured
- **WHEN** delivery options are requested for any parcel, of any product type
- **THEN** `additional_insured_price` SHALL be present on every parcel, set to the total value of the goods it carries

#### Scenario: Seller insurance configuration is not consulted
- **WHEN** the request is built
- **THEN** `user_sendcloud_configuration.insurance_type` and `insurance_fixed_amount` SHALL NOT be read, and their values SHALL have no effect on the insured amount
