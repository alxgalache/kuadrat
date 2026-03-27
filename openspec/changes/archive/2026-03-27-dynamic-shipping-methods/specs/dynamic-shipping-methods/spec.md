## ADDED Requirements

### Requirement: Admin endpoint returns shipping methods from Sendcloud
The backend SHALL expose `GET /api/admin/shipping-methods` that calls Sendcloud's `POST /api/v3/shipping-options` with `{from_country_code: "ES", to_country_code: "ES"}` and returns `[{code, name}]` extracted from `response.data`.

#### Scenario: Successful fetch
- **WHEN** admin calls `GET /api/admin/shipping-methods`
- **THEN** the response contains an array of `{code, name}` objects from Sendcloud's shipping options

#### Scenario: Sendcloud API error
- **WHEN** Sendcloud API returns an error or is unreachable
- **THEN** the endpoint returns a 502 error with a descriptive message

### Requirement: Form uses dynamic shipping methods for checkboxes
The `SendcloudConfigSection` SHALL fetch shipping methods from the backend endpoint and use them for both `preferred_carriers` and `excluded_carriers` checkbox groups. Each checkbox SHALL display the `name` as label and store the `code` as value.

#### Scenario: Shipping methods loaded and matched with existing config
- **WHEN** the form loads with existing `preferred_carriers: ["correos_express:epaq24"]` and Sendcloud returns a method with `code: "correos_express:epaq24"`
- **THEN** that checkbox is checked in the preferred carriers group

#### Scenario: Stored code not found in Sendcloud response
- **WHEN** the form loads with `preferred_carriers: ["old_carrier_code"]` and Sendcloud does not return a method with that code
- **THEN** the stored code is silently ignored (checkbox not shown)

### Requirement: Cleanup static carrier infrastructure
The Next.js Route Handler at `client/app/api/carriers/route.js` SHALL be removed. The `SENDCLOUD_CARRIER_OPTIONS` env var SHALL be removed from `client/.env.example` and `client/.env.local`.

#### Scenario: No static carrier references remain
- **WHEN** the codebase is searched for `SENDCLOUD_CARRIER_OPTIONS` or `/api/carriers`
- **THEN** no references are found
