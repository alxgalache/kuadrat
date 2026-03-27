## 1. Backend: Fix Zod schema and controller defaults

- [x] 1.1 Update `first_mile` enum in `api/validators/sendcloudConfigSchemas.js` from `['drop_off', 'collection']` to `['pickup', 'dropoff', 'pickup_dropoff']`
- [x] 1.2 Update default `first_mile` value in `api/controllers/sendcloudConfigController.js` from `'drop_off'` to `'dropoff'` (createSendcloudConfig, line 92)

## 2. Frontend: Add carrier list env var and Route Handler

- [x] 2.1 Add `SENDCLOUD_CARRIER_OPTIONS` env var to `client/.env.example` with the carrier list in `code:Label` comma-separated format (e.g., `correos:Correos,correos_express:Correos Express,dhl:DHL,dpd:DPD,gls:GLS,mrw:MRW,nacex:NACEX,seur:SEUR,ups:UPS`)
- [x] 2.2 Create Next.js Route Handler at `client/app/api/carriers/route.js` that reads `SENDCLOUD_CARRIER_OPTIONS` env var, parses it into `[{code, label}]` format, and returns it as JSON

## 3. Frontend: Rework SendcloudConfigSection form

- [x] 3.1 Remove `CARRIER_OPTIONS` hardcoded constant from `client/components/admin/SendcloudConfigSection.js`
- [x] 3.2 Update form state to match the 15 DB fields: replace `sender_company` → `sender_company_name`, `sender_address` → `sender_address_1`, add `sender_address_2`, add `sender_house_number`, add `vat_number`, remove `signature`, `fragile_goods`, `insurance_value`, `customs_shipment_type`, `customs_hs_code`
- [x] 3.3 Add `useEffect` to fetch carrier options from `/api/carriers` on component mount and store in local state
- [x] 3.4 Update `first_mile` select options to three values: `pickup` ("Recogida a domicilio"), `dropoff` ("Entrega en oficina"), `pickup_dropoff` ("Ambos"); set default to `dropoff`
- [x] 3.5 Render `preferred_carriers` checkbox group using fetched carrier options
- [x] 3.6 Add `excluded_carriers` checkbox group below `preferred_carriers`, using the same fetched carrier options
- [x] 3.7 Add `vat_number` text input field
- [x] 3.8 Fix `loadConfig` to use exact DB column names (`sender_company_name`, `sender_address_1`, `sender_address_2`, `sender_house_number`, `vat_number`, etc.) and parse `preferred_carriers`/`excluded_carriers` from JSON strings to arrays via `JSON.parse(res.data.preferred_carriers || '[]')`
- [x] 3.9 Update `handleSave` payload to send all 15 fields with correct types (arrays for carriers, booleans for `self_packs`)
- [x] 3.10 Update form layout to arrange the new fields coherently (address fields grouped, carriers grouped, etc.)

## 4. Environment: Update .env files

- [x] 4.1 Add `SENDCLOUD_CARRIER_OPTIONS` to the actual `client/.env.local` file with the full carrier list
