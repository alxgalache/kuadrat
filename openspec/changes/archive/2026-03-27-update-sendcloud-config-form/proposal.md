## Why

The current SendcloudConfigSection form fields don't match the actual `user_sendcloud_configuration` database schema. Fields like `sender_address` (should be `sender_address_1` + `sender_address_2`), `sender_house_number`, and `vat_number` are missing, while fields not required for now (e.g., `signature`, `fragile_goods`, `insurance_value`, `customs_hs_code`) are exposed. Additionally, carrier options are hardcoded in the component and should be configurable via environment variables, and `excluded_carriers` has no UI at all.

## What Changes

- **Align form fields** to match the DB columns the user requested: `sender_name`, `sender_company_name`, `sender_address_1`, `sender_address_2`, `sender_house_number`, `sender_city`, `sender_postal_code`, `sender_country`, `sender_phone`, `sender_email`, `first_mile`, `preferred_carriers`, `excluded_carriers`, `vat_number`, `self_packs`.
- **Remove form fields** not needed for now: `signature`, `fragile_goods`, `insurance_value`, `customs_shipment_type`, `customs_hs_code`.
- **Update `first_mile` options** to three values: "Recogida a domicilio" (`pickup`), "Entrega en oficina" (`dropoff`), "Ambos" (`pickup_dropoff`).
- **Move carrier list to server-side env vars**: Replace the hardcoded `CARRIER_OPTIONS` constant with a non-public environment variable (without `NEXT_PUBLIC_` prefix) parsed at build/runtime via a server component or API route.
- **Add `excluded_carriers` field**: New checkbox group below `preferred_carriers`, using the same carrier list from the env var.
- **Add `vat_number` field**: New text input in the form.
- **Update Zod validation schema**: Align `first_mile` enum to `['pickup', 'dropoff', 'pickup_dropoff']` to match the DB CHECK constraint.

## Capabilities

### New Capabilities

- `sendcloud-config-form`: Aligns the SendcloudConfigSection form fields with the DB schema, adds excluded_carriers and vat_number fields, moves carrier list to env vars, and updates first_mile options.

### Modified Capabilities

_(none — no existing spec-level requirements are changing)_

## Impact

- **Frontend**: `client/components/admin/SendcloudConfigSection.js` — full rework of form fields and state.
- **Frontend**: `client/.env.example` and `client/.env` — new server-side env var for carrier list.
- **Frontend**: Possibly a Next.js server action or API route to expose the carrier list to the client component (since the env var won't be `NEXT_PUBLIC_`).
- **Backend**: `api/validators/sendcloudConfigSchemas.js` — update `first_mile` enum values.
- **Backend**: `api/controllers/sendcloudConfigController.js` — minor: ensure `first_mile` default aligns with new values.
