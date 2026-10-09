# stripe-connect-fiscal-report Specification

## Purpose

Definir los informes fiscales de los pagos con Stripe Connect para la gestoría: configuración fiscal de la plataforma y explicación de la facturación por vendedor con su tipo de IVA.

## Requirements

### Requirement: Platform business config
The system SHALL expose under `config.business` the full set of fields needed for fiscal exports and invoice generation: `name` (default `'140d Galería de Arte'`), `legalName`, `taxId`, `address.{line1, line2?, city, postalCode, province, country}`, and `email`. The fields other than `name`, `address.country` and `email` have no defaults; they are provided via environment variables and are read at request time. These fields SHALL also be used by the PDF invoice engine for the issuer section of all generated invoices.

#### Scenario: Application starts with missing business config
- **GIVEN** `BUSINESS_LEGAL_NAME` is not set in the environment
- **WHEN** the API boots
- **THEN** the API starts normally (no boot failure)
- **AND** any fiscal export or invoice generation endpoint that requires the config returns 503 with a message listing the missing fields

#### Scenario: Invoice generation uses business config
- **WHEN** a PDF invoice is generated
- **THEN** the issuer section SHALL use `config.business.legalName`, `config.business.taxId`, and `config.business.address.*` for the gallery's fiscal data

### Requirement: Single-payout fiscal export
The system SHALL expose `GET /api/admin/payouts/:withdrawalId/fiscal-export?format=csv|json` (admin only, `format` defaults to `csv`) with the full fiscal detail of one payout: platform data, seller snapshot, withdrawal metadata, invoicing mode, one line per item with taxable base, VAT and total, and grand totals. Before building it, the controller SHALL check the platform business configuration (`config.assertBusinessConfigComplete()`).

#### Scenario: Export an executed payout
- **WHEN** an admin requests the export of an executed payout, as CSV or JSON
- **THEN** the response SHALL be 200 with the payout report in that format

#### Scenario: Export a failed payout
- **WHEN** the payout failed
- **THEN** the response SHALL be 404 ("El payout falló y no tiene información fiscal")

#### Scenario: Export a payout not executed yet
- **WHEN** the payout is still pending or processing
- **THEN** the response SHALL be 409 ("El payout aún no ha sido ejecutado")

#### Scenario: Export blocked by incomplete platform config
- **WHEN** any required `BUSINESS_*` variable is empty
- **THEN** the response SHALL be 503, naming the missing fields

### Requirement: Range fiscal export
The system SHALL expose `GET /api/admin/payouts/fiscal-export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json[&vat_regime=...][&sellerId=...]` (admin only) with every payout executed between `from` and `to`, both inclusive. The CSV SHALL use a long format, one row per `withdrawal_items` line with the parent withdrawal's columns repeated. The JSON SHALL include `totals_by_regime`, `totals_by_month` and the embedded payout reports. The query SHALL be validated with Zod (`rangeExportQuerySchema`).

#### Scenario: Quarterly export
- **WHEN** an admin requests a three-month range
- **THEN** the response SHALL contain every payout executed in it

#### Scenario: Filter by VAT regime or seller
- **WHEN** `vat_regime` or `sellerId` is given
- **THEN** only the matching payouts SHALL be included

#### Scenario: Range too large
- **WHEN** the range spans more than 366 days
- **THEN** the response SHALL be 400 ("El rango no puede exceder 366 días")

#### Scenario: Invalid date ordering
- **WHEN** `to` is earlier than `from`
- **THEN** the response SHALL be 400

### Requirement: Payouts summary endpoint
The system SHALL expose `GET /api/admin/payouts/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin only, always JSON) with the aggregate totals of the range, without per-item detail, under the same range rules as the range export (`summaryQuerySchema`).

#### Scenario: Quarterly summary
- **WHEN** an admin requests the summary of a quarter
- **THEN** the response SHALL contain the totals for the range and no item lines

### Requirement: Invoicing mode inference
The invoicing mode of each payout SHALL be derived from the seller's `tax_status` by `inferInvoicingMode(user)` (`api/utils/fiscalReportFormatter.js`), a pure function. Every seller is registered as `autonomo` or `sociedad` (the column's CHECK admits nothing else): both give `factura_recibida`, with a Spanish explanation that includes the seller's VAT rates (`tax_vat_art`, `tax_vat_other`, by default 10 % and 21 %). A missing or unknown `tax_status` gives `error`.

#### Scenario: Autónomo artist
- **WHEN** the seller's `tax_status` is `autonomo`
- **THEN** the mode SHALL be `factura_recibida`, explaining that the artist invoices 140d for their share of the sale with the corresponding VAT

#### Scenario: Society artist
- **WHEN** the seller's `tax_status` is `sociedad`
- **THEN** the mode SHALL be `factura_recibida`, explaining the same for the company

#### Scenario: Missing fiscal data
- **WHEN** the seller has no `tax_status`
- **THEN** the mode SHALL be `error` ("Datos fiscales incompletos para el artista.")

### Requirement: Per-item descriptions in exports
Every line of an export SHALL carry a readable `description` and a `buyer_reference` that leads back to its origin (`api/utils/itemDescription.js`): `order:<id>/art_order_item:<id>` for artworks, `order:<id>/other_order_item:<id>` for store products and `event:<id>/attendee:<id>` for event attendees.

#### Scenario: Art item description
- **WHEN** a payout includes an artwork sale
- **THEN** its line SHALL name the artwork and carry `order:<order id>/art_order_item:<item id>`

#### Scenario: Event attendee description
- **WHEN** a payout includes an event ticket
- **THEN** its line SHALL name the event and carry `event:<event id>/attendee:<attendee id>`

### Requirement: CSV Spanish locale format
CSV exports SHALL be UTF-8 with BOM, use `;` as field separator, `,` as decimal separator and `DD/MM/YYYY` dates in Europe/Madrid, and escape fields containing `;`, `"` or line breaks as RFC 4180 says, so the file opens in Excel ES without any import step.

#### Scenario: Excel ES compatibility
- **WHEN** an admin opens an exported CSV in Excel configured for Spain
- **THEN** columns, decimals and dates SHALL show correctly without an import wizard

### Requirement: Admin panel export controls
The admin payouts panel SHALL offer:
- on `/admin/payouts/[sellerId]`, "CSV" and "JSON" buttons on each completed withdrawal, which download its single-payout export;
- on `/admin/payouts`, a range toolbar with `from`, `to`, a VAT regime selector and the buttons "Exportar CSV", "Exportar JSON" and "Resumen", validating in the browser that `to` is not earlier than `from` and that the range is at most 366 days before calling the API.

#### Scenario: Admin downloads a single payout
- **WHEN** an admin presses "CSV" on a completed withdrawal
- **THEN** the browser SHALL download that payout's CSV export

#### Scenario: Admin exports a range
- **WHEN** an admin sets a valid range and presses "Exportar CSV"
- **THEN** the browser SHALL download the range export

#### Scenario: Admin requests the summary
- **WHEN** an admin sets a valid range and presses "Resumen"
- **THEN** the panel SHALL show the totals of the range

### Requirement: Gestoría handoff document
The repository SHALL keep `docs/stripe_connect/fiscal_report_for_gestoria.md`, in Spanish, explaining the fiscal flow to the accounting firm: the Merchant of Record model, REBU for art, standard 21 % VAT for store products and events, shipping VAT, artist-to-gallery invoicing (artists registered as autónomos or companies, never private individuals), IRPF recorded but not applied in v1, how to read the CSV and JSON exports, edge cases and traceability. `docs/stripe_connect/master_plan.md` SHALL link to it.

#### Scenario: Master plan links to the handoff doc
- **WHEN** someone reads `docs/stripe_connect/master_plan.md`
- **THEN** it SHALL link to `fiscal_report_for_gestoria.md`

#### Scenario: Handoff doc explains the exports
- **WHEN** the accounting firm reads the handoff document
- **THEN** it SHALL find the structure of the single and range CSV exports, the JSON export and the summary endpoint

### Requirement: Seller invoicing explanation uses per-seller VAT rates
The fiscal report's invoicing-mode explanation (`inferInvoicingMode`) SHALL
compose its es-ES text from the seller's configured `tax_vat_art` and
`tax_vat_other` instead of hardcoding "(10% obras de arte, 21% otros)". The
seller block query SHALL select both columns. The explanation SHALL keep
distinguishing `tax_status` `autonomo` / `sociedad` and SHALL keep returning
the `error` mode when fiscal data is incomplete.

#### Scenario: Author artist explanation shows 10/21
- **GIVEN** a seller with `tax_status = 'autonomo'`, `tax_vat_art = 10` and `tax_vat_other = 21`
- **WHEN** a fiscal report including that seller is generated
- **THEN** the explanation states the artist invoices their part of the sale with 10% VAT for artworks and 21% for other products

#### Scenario: Cooperative artist explanation shows 21/21
- **GIVEN** a seller with `tax_vat_art = 21` and `tax_vat_other = 21`
- **WHEN** a fiscal report including that seller is generated
- **THEN** the explanation states 21% for artworks and 21% for other products
- **AND** no hardcoded "10%" appears for that seller

#### Scenario: Incomplete fiscal data still yields error mode
- **GIVEN** a seller with `tax_status = NULL`
- **WHEN** the invoicing mode is inferred
- **THEN** the mode is `error` with the existing es-ES message
