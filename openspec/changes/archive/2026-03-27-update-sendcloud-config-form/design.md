## Context

The `SendcloudConfigSection` component (`client/components/admin/SendcloudConfigSection.js`) currently has form fields that don't align with the `user_sendcloud_configuration` DB table. Carrier options are hardcoded in a `CARRIER_OPTIONS` constant. The `excluded_carriers` column has no UI, `vat_number` is missing from the form, and `first_mile` only offers two options instead of three.

The backend controller (`api/controllers/sendcloudConfigController.js`) and Zod schema (`api/validators/sendcloudConfigSchemas.js`) already support all the DB columns, but the `first_mile` enum in the Zod schema uses `['drop_off', 'collection']` instead of the DB's `['pickup', 'dropoff', 'pickup_dropoff', 'fulfilment']`.

## Goals / Non-Goals

**Goals:**
- Align the SendcloudConfigSection form fields exactly with the requested DB columns.
- Move carrier options from a hardcoded constant to a server-side env var (not `NEXT_PUBLIC_`).
- Add `excluded_carriers` checkbox group to the form.
- Add `vat_number` text field.
- Update `first_mile` to offer three options matching DB values: `pickup`, `dropoff`, `pickup_dropoff`.
- Fix the Zod schema `first_mile` enum to match DB CHECK constraint values.

**Non-Goals:**
- Exposing `require_signature`, `fragile_goods`, `insurance_type`, `insurance_fixed_amount`, `last_mile`, `default_hs_code`, `origin_country`, `eori_number` in the form.
- Changing the DB schema.
- Changing the backend controller logic beyond the `first_mile` default value alignment.

## Decisions

### 1. Carrier list delivery mechanism: Next.js Route Handler

**Decision:** Create a Next.js Route Handler at `client/app/api/carriers/route.js` that reads a server-side env var and returns the carrier list as JSON.

**Rationale:** The `SendcloudConfigSection` is a `'use client'` component, so it cannot directly access server-side env vars. A Route Handler keeps the carrier data server-side (not bundled into the client JS) while making it fetchable. This is simpler than restructuring the component tree to pass props from a Server Component.

**Alternatives considered:**
- `NEXT_PUBLIC_` env var: Rejected — user explicitly wants the list not publicly exposed in browser JS bundles.
- Server Component wrapper passing props: Rejected — the parent `AuthorEditPageContent` is `'use client'`, which would require significant refactoring.
- Backend API endpoint: Rejected — unnecessary round-trip to Express when Next.js can serve it directly.

### 2. Env var format: comma-separated `code:label` pairs

**Decision:** Store carriers as `SENDCLOUD_CARRIER_OPTIONS=correos:Correos,correos_express:Correos Express,dhl:DHL,...` in the client `.env` file.

**Rationale:** Simple, human-readable, easy to parse. One env var serves both `preferred_carriers` and `excluded_carriers` checkbox groups (same list of options for both).

### 3. Single env var for both preferred and excluded carriers

**Decision:** Use one env var `SENDCLOUD_CARRIER_OPTIONS` for both fields. Both checkboxes groups render the same carrier list; they differ only in which carriers are checked.

**Rationale:** The user specified both fields use the same set of available carriers. Having one list avoids duplication and inconsistency.

### 4. Form field mapping

| DB Column | Form Field | UI Control |
|-----------|-----------|------------|
| `sender_name` | `sender_name` | text input |
| `sender_company_name` | `sender_company_name` | text input |
| `sender_address_1` | `sender_address_1` | text input |
| `sender_address_2` | `sender_address_2` | text input |
| `sender_house_number` | `sender_house_number` | text input |
| `sender_city` | `sender_city` | text input |
| `sender_postal_code` | `sender_postal_code` | text input |
| `sender_country` | `sender_country` | text input (default `ES`) |
| `sender_phone` | `sender_phone` | tel input |
| `sender_email` | `sender_email` | email input |
| `first_mile` | `first_mile` | select (3 options) |
| `preferred_carriers` | `preferred_carriers` | checkbox group |
| `excluded_carriers` | `excluded_carriers` | checkbox group |
| `vat_number` | `vat_number` | text input |
| `self_packs` | `self_packs` | checkbox |

### 5. Fix `first_mile` values across the stack

**Decision:** Align everything to the DB CHECK constraint values: `pickup`, `dropoff`, `pickup_dropoff`.

- Zod schema: change enum from `['drop_off', 'collection']` to `['pickup', 'dropoff', 'pickup_dropoff']`.
- Frontend form default: `dropoff`.
- Controller default: already aligns (uses `drop_off` string, will update to `dropoff`).

## Risks / Trade-offs

- **[Risk] Existing configs with old `first_mile` values** → The DB CHECK constraint already uses `pickup`/`dropoff`/`pickup_dropoff`, so existing data should already be valid. The Zod schema was the only misaligned piece. Low risk.
- **[Risk] Route Handler caching** → The carrier list is static config; Next.js will cache the Route Handler response by default. This is actually desirable. No mitigation needed.
- **[Trade-off] Extra fetch on component mount** → The `SendcloudConfigSection` will need to fetch `/api/carriers` on mount to get the carrier list. This adds one small request but keeps the data server-side as requested.
