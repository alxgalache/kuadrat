## Why

The current carrier selection uses a static env var (`SENDCLOUD_CARRIER_OPTIONS`) with carrier-level codes (e.g., `correos_express`). This is too coarse — each carrier has multiple shipping methods (e.g., `correos_express:epaq24`, `correos_express:ecommerce`) and the admin needs granular control over which specific methods to prefer or exclude per seller.

## What Changes

- **New backend endpoint** `GET /api/admin/shipping-methods` that calls Sendcloud's `POST /api/v3/shipping-options` with `{from_country_code: "ES", to_country_code: "ES"}` and returns a simplified `[{code, name}]` list.
- **Frontend**: `SendcloudConfigSection` fetches shipping methods from the new backend endpoint instead of the Next.js Route Handler.
- **Remove**: Next.js Route Handler `client/app/api/carriers/route.js` and `SENDCLOUD_CARRIER_OPTIONS` env var.
- **Stored values change**: `preferred_carriers` and `excluded_carriers` now store shipping method codes (e.g., `correos_express:epaq24`) instead of carrier codes (e.g., `correos_express`).

## Capabilities

### New Capabilities

- `dynamic-shipping-methods`: Fetch shipping methods from Sendcloud API and use them for preferred/excluded selection in the seller config form.

### Modified Capabilities

_(none)_

## Impact

- **Backend**: New controller + route for `GET /api/admin/shipping-methods`, uses existing `sendcloudApiClient.js`.
- **Frontend**: `SendcloudConfigSection.js` changes fetch source.
- **Cleanup**: Remove `client/app/api/carriers/route.js`, remove `SENDCLOUD_CARRIER_OPTIONS` from env files.
