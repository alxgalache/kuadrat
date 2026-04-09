# stripe-connect-fiscal-report (ADDED)

## ADDED Requirements

### Requirement: Platform business config
The system SHALL expose under `config.business` the full set of fields needed for fiscal exports: `name` (default `'140d Galería de Arte'`), `legalName`, `taxId`, `address.{line1, line2?, city, postalCode, province, country}`, and `email`. The fields other than `name`, `address.country` and `email` have no defaults; they are provided via environment variables and are read at request time.

#### Scenario: Application starts with missing business config
- **GIVEN** `BUSINESS_LEGAL_NAME` is not set in the environment
- **WHEN** the API boots
- **THEN** the API starts normally (no boot failure)
- **AND** any fiscal export endpoint that requires the config returns 503 with a message listing the missing fields

### Requirement: Single-payout fiscal export
The system SHALL expose `GET /api/admin/payouts/:withdrawalId/fiscal-export?format=csv|json` (admin only) returning the full fiscal detail of a single payout. The response SHALL contain the platform data, seller snapshot, withdrawal metadata, computed invoicing mode, per-item lines with taxable base / VAT / total, and grand totals. Defaults to `format=csv`.

#### Scenario: Export a completed REBU payout as CSV
- **GIVEN** a completed withdrawal with `vat_regime='art_rebu'` and 2 `withdrawal_items` rows
- **WHEN** the admin requests `GET /api/admin/payouts/1234/fiscal-export?format=csv`
- **THEN** the response headers include `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="payout_1234_<date>.csv"`
- **AND** the body starts with a UTF-8 BOM
- **AND** the body contains a metadata block with platform, seller and withdrawal info
- **AND** the body contains a detail block with one row per item, using `;` as separator, `,` as decimal
- **AND** the totals row reconciles against the sum of `withdrawal_items.taxable_base + vat_amount`

#### Scenario: Export as JSON
- **WHEN** the same export is requested with `format=json`
- **THEN** the response is `application/json` with the `PayoutReport` object (platform, seller, withdrawal, invoicing, lines, totals, generated_at, generated_by_admin_email)

#### Scenario: Export a reversed payout
- **GIVEN** a withdrawal in `status='reversed'` with `reversal_amount = 50€` on an original amount of 210€
- **WHEN** the admin requests the export
- **THEN** the response includes `reversed_at`, `reversal_amount=50`, and `net_of_reversals=160`
- **AND** the detail lines are still present (the Stripe operation occurred; fiscally it has to be declared)

#### Scenario: Attempt to export a failed payout
- **GIVEN** a withdrawal in `status='failed'`
- **WHEN** the admin requests the export
- **THEN** the response is 404 with a message explaining that failed payouts do not have fiscal data

#### Scenario: Attempt to export a pending payout
- **GIVEN** a withdrawal in `status='pending'` or `'processing'`
- **WHEN** the admin requests the export
- **THEN** the response is 409 with "El payout aún no ha sido ejecutado"

#### Scenario: Export blocked by incomplete platform config
- **GIVEN** `BUSINESS_TAX_ID` is not set
- **WHEN** the admin requests any fiscal export
- **THEN** the response is 503 with `message` listing "BUSINESS_TAX_ID" as missing
- **AND** no file is downloaded

### Requirement: Range fiscal export
The system SHALL expose `GET /api/admin/payouts/fiscal-export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json[&vat_regime=...][&sellerId=...]` (admin only) returning all payouts executed between `from` and `to` inclusive. The CSV variant SHALL use a "long" format — one row per `withdrawal_items` line, with redundant columns from the parent withdrawal. The JSON variant SHALL include `totals_by_regime`, `totals_by_month`, and the array of embedded `PayoutReport` objects.

#### Scenario: Quarterly export
- **GIVEN** the admin passes `from=2026-01-01`, `to=2026-03-31`, `format=csv`
- **WHEN** the endpoint is called
- **THEN** the response is a CSV with one row per item across all `completed` and `reversed` payouts in Q1 2026
- **AND** rows from `failed` or `pending`/`processing` payouts are NOT included
- **AND** the filename is `payouts_2026-01-01_2026-03-31.csv`

#### Scenario: Filter by VAT regime
- **WHEN** the admin passes `vat_regime=art_rebu`
- **THEN** only REBU payouts appear in the output
- **AND** the JSON `totals_by_regime.standard_vat` is either omitted or zeroed

#### Scenario: Filter by seller
- **WHEN** the admin passes `sellerId=42`
- **THEN** only payouts executed for user 42 appear in the output

#### Scenario: Range too large
- **WHEN** the admin passes a range spanning more than 366 days
- **THEN** the response is 400 with "El rango no puede superar 366 días"
- **AND** no query is issued against the database

#### Scenario: Invalid date ordering
- **WHEN** the admin passes `from=2026-04-01&to=2026-01-01`
- **THEN** the response is 400 with "'to' debe ser posterior o igual a 'from'"

### Requirement: Payouts summary endpoint
The system SHALL expose `GET /api/admin/payouts/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin only, JSON only) returning aggregate totals for the range without emitting per-item detail.

#### Scenario: Quarterly summary
- **GIVEN** 10 REBU payouts and 3 standard payouts in the range
- **WHEN** the admin calls `/summary`
- **THEN** the response contains `totals_by_regime.art_rebu` with `count=10` and its money totals, and `totals_by_regime.standard_vat` with `count=3`
- **AND** the response contains `totals_by_month` keyed by `YYYY-MM`

### Requirement: Invoicing mode inference
The system SHALL derive the invoicing mode of each payout from the seller's `tax_status` and `autofactura_agreement_signed_at` fields, via a pure function `inferInvoicingMode`. The result is one of `'autofactura'`, `'factura_recibida'`, or `'pending_agreement'`, each accompanied by a Spanish-language explanation.

#### Scenario: Particular artist with signed agreement
- **GIVEN** a seller with `tax_status='particular'` and `autofactura_agreement_signed_at IS NOT NULL`
- **WHEN** their payout is exported
- **THEN** `invoicing.mode = 'autofactura'`
- **AND** the explanation references art. 5 del Reglamento de Facturación

#### Scenario: Particular artist without signed agreement
- **GIVEN** a seller with `tax_status='particular'` and `autofactura_agreement_signed_at IS NULL`
- **WHEN** their payout is exported
- **THEN** `invoicing.mode = 'pending_agreement'`
- **AND** the explanation instructs the admin to get the agreement signed before declaring the quarter

#### Scenario: Autónomo artist
- **GIVEN** a seller with `tax_status='autonomo'`
- **THEN** `invoicing.mode = 'factura_recibida'` regardless of `autofactura_agreement_signed_at`

#### Scenario: Society artist
- **GIVEN** a seller with `tax_status='sociedad'`
- **THEN** `invoicing.mode = 'factura_recibida'`

### Requirement: Per-item descriptions in exports
Every line in the export SHALL carry a human-readable `description` and a `buyer_reference` enabling back-traceability to the originating order or attendee. `art_order_item` lines reference the artwork title and order id; `other_order_item` lines reference the product title and order id; `event_attendee` lines reference the event title and attendee id.

#### Scenario: Art item description
- **GIVEN** a payout containing `art_order_item:789` from product "Cuadro «Sin título»" inside order `456`
- **WHEN** the export is generated
- **THEN** the line's `description` is `'Cuadro «Sin título»'` (or similar, including product title)
- **AND** the line's `buyer_reference` is `'order:456/item:789'`

#### Scenario: Event attendee description
- **GIVEN** a payout containing `event_attendee:12` from event "Masterclass de acuarela"
- **WHEN** the export is generated
- **THEN** the line's `description` starts with `'Entrada: Masterclass de acuarela'`
- **AND** the line's `buyer_reference` is `'event_attendee:12'` (or equivalent traceable form)

### Requirement: CSV Spanish locale format
CSV outputs SHALL be encoded as UTF-8 with BOM, use `;` as field separator, `,` as decimal separator, `DD/MM/YYYY` as date format, and escape fields containing `;`, `"`, or newlines per RFC 4180. The intent is that the file opens in Excel ES without any import step.

#### Scenario: Excel ES compatibility
- **WHEN** an exported CSV is opened in Excel ES on Windows
- **THEN** accented characters render correctly
- **AND** numeric columns are parsed as numbers with comma decimals
- **AND** the separator is auto-detected as `;`

### Requirement: Admin panel export controls
The admin payouts panel SHALL expose:
- Two per-row buttons ("CSV", "JSON") on each completed/reversed withdrawal in `/admin/payouts/[sellerId]`, triggering the single-payout export. Disabled for failed/pending/processing rows.
- A range toolbar on `/admin/payouts` with `from`, `to`, `vat_regime`, and buttons "Exportar CSV", "Exportar JSON", "Resumen". Client-side validation ensures `to >= from` and range ≤ 366 days before issuing the request.

#### Scenario: Admin downloads a single payout as CSV
- **GIVEN** the admin is on `/admin/payouts/42` with a completed withdrawal listed
- **WHEN** they click the "CSV" button on that row
- **THEN** the browser downloads a file named `payout_<id>_<date>.csv`
- **AND** no page navigation occurs

#### Scenario: Admin exports the current quarter
- **GIVEN** the admin fills `from=2026-01-01`, `to=2026-03-31`, `vat_regime='art_rebu'`
- **WHEN** they click "Exportar CSV"
- **THEN** the browser downloads `payouts_2026-01-01_2026-03-31.csv`
- **AND** the file contains only REBU rows from Q1 2026

#### Scenario: Admin requests summary
- **GIVEN** a valid range
- **WHEN** they click "Resumen"
- **THEN** a card renders below the toolbar with totals by regime and by month
- **AND** no file is downloaded

### Requirement: Gestoría handoff document
The repository SHALL contain `docs/stripe_connect/fiscal_report_for_gestoria.md` (in Spanish) explaining the full fiscal flow to the accounting firm: MoR model, REBU for art, standard 21% for other products and events, shipping VAT treatment (21% both sides, not suplido), autofacturación for particular artists under art. 5 RF, IRPF captured but not applied in v1, how to read the CSV exports, and edge cases (refunds, reversals, failed transfers). The `docs/stripe_connect/master_plan.md` SHALL link to this document from §9.

#### Scenario: Master plan links to the handoff doc
- **WHEN** a reader opens `docs/stripe_connect/master_plan.md`
- **THEN** §9 ("Datos fiscales del platform") contains a link to `docs/stripe_connect/fiscal_report_for_gestoria.md`

#### Scenario: Handoff doc includes a worked example
- **WHEN** a reader opens `docs/stripe_connect/fiscal_report_for_gestoria.md`
- **THEN** they find at least one fully worked numeric example for a REBU payout and one for a standard VAT payout, showing how `taxable_base` and `vat_amount` are derived from the gross sale
