## ADDED Requirements

### Requirement: Form fields match DB schema subset
The SendcloudConfigSection form SHALL display exactly these fields: `sender_name`, `sender_company_name`, `sender_address_1`, `sender_address_2`, `sender_house_number`, `sender_city`, `sender_postal_code`, `sender_country`, `sender_phone`, `sender_email`, `first_mile`, `preferred_carriers`, `excluded_carriers`, `vat_number`, `self_packs`. Fields previously in the form that are not in this list (`signature`, `fragile_goods`, `insurance_value`, `customs_shipment_type`, `customs_hs_code`) SHALL be removed.

#### Scenario: Admin loads the Sendcloud config form
- **WHEN** admin navigates to `/admin/authors/:id/edit` and the Sendcloud config section renders
- **THEN** the form displays input fields for all 15 listed columns and no others

### Requirement: first_mile offers three options
The `first_mile` select field SHALL offer three options: "Recogida a domicilio" (value `pickup`), "Entrega en oficina" (value `dropoff`), and "Ambos" (value `pickup_dropoff`). The default value for new configs SHALL be `dropoff`.

#### Scenario: Admin creates a new Sendcloud config without setting first_mile
- **WHEN** admin saves a new config without changing the first_mile dropdown
- **THEN** the saved value is `dropoff`

#### Scenario: Admin selects "Ambos"
- **WHEN** admin selects "Ambos" from the first_mile dropdown and saves
- **THEN** the saved value is `pickup_dropoff`

### Requirement: Carrier options loaded from server-side env var
The available carrier list for `preferred_carriers` and `excluded_carriers` SHALL be loaded from a server-side environment variable (`SENDCLOUD_CARRIER_OPTIONS`), not hardcoded in the component. The env var SHALL NOT use the `NEXT_PUBLIC_` prefix. The component SHALL fetch the carrier list via a Next.js Route Handler at `/api/carriers`.

#### Scenario: Carrier list is configured in env var
- **WHEN** `SENDCLOUD_CARRIER_OPTIONS` is set to `correos:Correos,dhl:DHL`
- **THEN** the preferred_carriers and excluded_carriers checkbox groups display exactly "Correos" and "DHL" as options

#### Scenario: Carrier list env var is empty or missing
- **WHEN** `SENDCLOUD_CARRIER_OPTIONS` is not set or empty
- **THEN** both checkbox groups display no carrier options (empty list)

### Requirement: Excluded carriers checkbox group
The form SHALL display an `excluded_carriers` checkbox group below `preferred_carriers`. It SHALL use the same carrier options list. Selected carriers are stored as a JSON array in the DB.

#### Scenario: Admin selects excluded carriers
- **WHEN** admin checks "DHL" and "SEUR" in the excluded_carriers group and saves
- **THEN** the API receives `excluded_carriers: ["dhl", "seur"]` and stores `["dhl","seur"]` in the DB

#### Scenario: Admin loads form with existing excluded carriers
- **WHEN** the DB has `excluded_carriers` = `["dhl","seur"]` for this seller
- **THEN** the "DHL" and "SEUR" checkboxes are checked in the excluded_carriers group

### Requirement: VAT number field
The form SHALL include a `vat_number` text input field. It SHALL be optional and allow up to 30 characters.

#### Scenario: Admin enters a VAT number
- **WHEN** admin types "ESB12345678" in the vat_number field and saves
- **THEN** the API receives `vat_number: "ESB12345678"` and stores it in the DB

### Requirement: Zod schema alignment for first_mile
The backend Zod validation schema for `first_mile` SHALL accept exactly `['pickup', 'dropoff', 'pickup_dropoff']`, matching the DB CHECK constraint.

#### Scenario: API receives first_mile = "pickup_dropoff"
- **WHEN** a POST/PUT request includes `first_mile: "pickup_dropoff"`
- **THEN** the request passes Zod validation

#### Scenario: API receives invalid first_mile value
- **WHEN** a POST/PUT request includes `first_mile: "drop_off"` (old value)
- **THEN** the request fails Zod validation with a 400 error

### Requirement: Form populates with existing DB values on load
When a seller already has a saved `user_sendcloud_configuration` row, the form SHALL populate all fields with the stored values. Field name mapping SHALL use the exact DB column names (e.g., `sender_company_name`, `sender_address_1`, not legacy aliases like `sender_company` or `sender_address`). The `preferred_carriers` and `excluded_carriers` columns are stored as JSON strings in SQLite; the form SHALL parse them into arrays before rendering checkboxes.

#### Scenario: Admin loads form for a seller with existing config
- **WHEN** admin navigates to `/admin/authors/:id/edit` and the seller has a saved Sendcloud config with `sender_company_name = "Acme SL"`, `sender_address_1 = "Calle Mayor 5"`, `preferred_carriers = '["correos","dhl"]'`
- **THEN** the form displays "Acme SL" in the company name field, "Calle Mayor 5" in the address 1 field, and the "Correos" and "DHL" checkboxes are checked in the preferred carriers group

#### Scenario: Carrier fields are JSON strings from DB
- **WHEN** the API returns `preferred_carriers` as the string `'["correos","seur"]'` and `excluded_carriers` as `'["dhl"]'`
- **THEN** the form parses them into arrays `["correos","seur"]` and `["dhl"]` respectively, and checks the corresponding checkboxes

#### Scenario: Carrier fields are null in DB
- **WHEN** the API returns `preferred_carriers` as `null` and `excluded_carriers` as `null`
- **THEN** both checkbox groups have no checkboxes checked

### Requirement: Carrier options not exposed in client JS bundle
The carrier options list SHALL NOT be included in the client-side JavaScript bundle. It SHALL only be served via a server-side route.

#### Scenario: Inspecting client bundle
- **WHEN** the built client JS files are inspected
- **THEN** they do not contain the carrier list strings from the `SENDCLOUD_CARRIER_OPTIONS` env var
