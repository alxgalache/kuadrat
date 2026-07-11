# pdf-invoice-engine (MODIFIED)

## MODIFIED Requirements

### Requirement: Buyer invoice — REBU (Series A)
The system SHALL generate a PDF invoice for orders containing art items whose snapshotted `vat_regime` is `'art_rebu'` (`COALESCE(vat_regime, 'art_rebu')` on `art_order_items`). Art items with `vat_regime = 'standard_vat'` SHALL NOT appear on this invoice (they belong to the Series P invoice). The invoice SHALL NOT include any IVA breakdown. The invoice SHALL include the mandatory legal text: "Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección (artículos 135-139 de la Ley 37/1992)". The invoice SHALL include: gallery fiscal data (from `config.business.*`), buyer data (from `orders` table: `full_name`, `email`/`guest_email`, invoicing address fields), invoice number and date, line items with description and price, shipping cost (included in total, no IVA breakdown), and total amount. If the order has no REBU-regime art items, the endpoint SHALL respond 400.

#### Scenario: Generate REBU invoice for an art order
- **GIVEN** order #1050 has 2 `art_order_items` with `vat_regime = 'art_rebu'` and 0 `other_order_items`, total = 1500€, shipping = 15€
- **WHEN** the admin requests the buyer invoice for order #1050
- **THEN** the system generates a PDF with series A invoice number
- **AND** the PDF shows 2 line items with artwork names and prices
- **AND** the PDF shows a shipping line of 15€
- **AND** the PDF shows total = 1515€ with NO IVA breakdown
- **AND** the PDF includes the REBU legal mention

#### Scenario: Order with only standard-regime art has no REBU invoice
- **GIVEN** order #1055 has 1 `art_order_items` row with `vat_regime = 'standard_vat'` and nothing else
- **WHEN** the admin requests the REBU buyer invoice for order #1055
- **THEN** the system returns HTTP 400 indicating the order has no REBU items

#### Scenario: REBU invoice with buyer invoicing address
- **GIVEN** order #1050 has `invoicing_address_line_1`, `invoicing_postal_code`, `invoicing_city`, `invoicing_province`, `invoicing_country`
- **WHEN** the invoice is generated
- **THEN** the buyer section shows the full invoicing address

#### Scenario: REBU invoice with missing buyer address
- **GIVEN** order #1050 has `invoicing_address_line_1 = NULL`
- **WHEN** the admin requests the invoice
- **THEN** the system returns HTTP 400 with message "Faltan datos de facturación del comprador"

### Requirement: Buyer invoice — Standard (Series P)
The system SHALL generate a PDF invoice for orders containing standard-regime items: `other_order_items` and/or `art_order_items` whose snapshotted `vat_regime` is `'standard_vat'` (art sold by sellers invoicing at the standard rate, e.g. via a cooperative). The invoice SHALL include IVA breakdown: base imponible + IVA 21% per line item + total (prices are VAT-included; the 21% general rate applies to the gallery's retail sale regardless of item kind). Shipping SHALL appear as a separate line with its own base + IVA 21% breakdown. The invoice SHALL include gallery fiscal data, buyer data, invoice number and date, and itemized lines. If the order has no standard-regime items, the endpoint SHALL respond 400.

#### Scenario: Generate standard invoice for an other-product order
- **GIVEN** order #1060 has 1 `other_order_item` at 121€ (IVA included) and shipping = 12.10€ (IVA included)
- **WHEN** the admin requests the buyer invoice for order #1060
- **THEN** the system generates a PDF with series P invoice number
- **AND** the product line shows: base = 100€, IVA 21% = 21€, total = 121€
- **AND** the shipping line shows: base = 10€, IVA 21% = 2.10€, total = 12.10€
- **AND** the invoice totals show: base imponible = 110€, IVA 21% = 23.10€, total = 133.10€

#### Scenario: Standard invoice includes a cooperative artist's artwork
- **GIVEN** order #1065 has 1 `art_order_items` row at 605€ with `vat_regime = 'standard_vat'` and no other items
- **WHEN** the admin requests the standard buyer invoice for order #1065
- **THEN** the system generates a series P PDF
- **AND** the artwork line shows: base = 500€, IVA 21% = 105€, total = 605€
- **AND** no REBU legal mention appears

### Requirement: Mixed order generates separate invoices
The system SHALL detect orders containing items of both fiscal regimes and generate TWO separate invoices: one series A (REBU) for REBU-regime art items, one series P (Standard) for standard-regime items (`other_order_items` plus standard-regime art items). Each invoice SHALL only include items of its corresponding regime. An order is "mixed" by regime, which includes the case of two art items with different snapshotted regimes.

#### Scenario: Mixed order with art and other products
- **GIVEN** order #1070 has 1 `art_order_item` (`vat_regime = 'art_rebu'`) at 500€ and 1 `other_order_item` at 60.50€
- **WHEN** the admin requests buyer invoices for order #1070
- **THEN** the system generates 2 PDFs
- **AND** the first PDF (series A) includes only the art item with REBU regime
- **AND** the second PDF (series P) includes only the other item with standard IVA breakdown

#### Scenario: Mixed order with art of both regimes
- **GIVEN** order #1075 has 1 `art_order_item` with `vat_regime = 'art_rebu'` and 1 `art_order_item` with `vat_regime = 'standard_vat'`
- **WHEN** the admin requests buyer invoices for order #1075
- **THEN** the series A PDF includes only the REBU artwork
- **AND** the series P PDF includes only the standard-regime artwork with IVA 21% breakdown

#### Scenario: Order with only art items
- **GIVEN** order #1080 has 2 `art_order_items` with `vat_regime = 'art_rebu'` and 0 `other_order_items`
- **WHEN** the admin requests buyer invoices
- **THEN** only 1 PDF is generated (series A, REBU)

#### Scenario: Order with only other items
- **GIVEN** order #1090 has 0 `art_order_items` and 2 `other_order_items`
- **WHEN** the admin requests buyer invoices
- **THEN** only 1 PDF is generated (series P, Standard)

### Requirement: Admin order invoice buttons
The admin order detail page (`/admin/pedidos/[id]`) SHALL display a "Facturas" section in the sidebar, below the order summary. The section SHALL show conditional buttons based on the fiscal regime of the order's items:
- If the order has REBU-regime art items: "Descargar factura REBU" button
- If the order has standard-regime items (`other` items and/or standard-regime art items): "Descargar factura IVA 21%" button
- If the order has both regimes: both buttons are shown
Each button SHALL trigger a download of the corresponding PDF.

#### Scenario: Order with only art items
- **GIVEN** the admin views order #1050 which has only `art_order_items` with `vat_regime = 'art_rebu'`
- **WHEN** the page loads
- **THEN** the "Facturas" section shows only "Descargar factura REBU" button

#### Scenario: Order with only cooperative art items
- **GIVEN** the admin views order #1055 which has only `art_order_items` with `vat_regime = 'standard_vat'`
- **WHEN** the page loads
- **THEN** the "Facturas" section shows only "Descargar factura IVA 21%" button

#### Scenario: Order with both types
- **GIVEN** the admin views order #1070 which has items of both regimes
- **WHEN** the page loads
- **THEN** the "Facturas" section shows both "Descargar factura REBU" and "Descargar factura IVA 21%" buttons

#### Scenario: Download triggers PDF generation
- **WHEN** the admin clicks "Descargar factura REBU"
- **THEN** the browser downloads a PDF file named `factura_A-2026-XXXXX.pdf`
