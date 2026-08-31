# pdf-invoice-engine (MODIFIED)

## MODIFIED Requirements

### Requirement: Buyer invoice — REBU (Series A)
The system SHALL generate a PDF invoice for orders containing art items whose snapshotted `vat_regime` is `'art_rebu'` (`COALESCE(vat_regime, 'art_rebu')` on `art_order_items`). Art items with `vat_regime = 'standard_vat'` SHALL NOT appear on this invoice (they belong to the Series P invoice). The invoice SHALL NOT include any IVA breakdown. The invoice SHALL include the mandatory legal text: "Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección (artículos 135-139 de la Ley 37/1992)". The invoice SHALL include: gallery fiscal data (from `config.business.*`), buyer data (from `orders` table: `full_name`, `dni`, `email`/`guest_email`, invoicing address fields), invoice number and date, line items with description and price, shipping cost (included in total, no IVA breakdown), and total amount. The buyer's `dni` SHALL be passed as the recipient's `taxId` and rendered as a "NIF/CIF" line; when the order has no `dni` the line SHALL be omitted and invoice generation SHALL succeed, so that orders created before the buyer tax id was collected remain invoiceable. If the order has no REBU-regime art items, the endpoint SHALL respond 400.

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

#### Scenario: REBU invoice shows the buyer's NIF
- **GIVEN** order #1050 has `dni = '12345678Z'`
- **WHEN** the invoice is generated
- **THEN** the buyer section SHALL show a "NIF/CIF: 12345678Z" line

#### Scenario: REBU invoice for an order without NIF
- **GIVEN** order #1020 was created before the buyer tax id was collected and has `dni = NULL`
- **WHEN** the admin requests the invoice
- **THEN** the invoice SHALL be generated without a "NIF/CIF" line and SHALL NOT return an error

### Requirement: Buyer invoice — Standard (Series P)
The system SHALL generate a PDF invoice for orders containing standard-regime items: `other_order_items` and/or `art_order_items` whose snapshotted `vat_regime` is `'standard_vat'` (art sold by sellers invoicing at the standard rate, e.g. via a cooperative). The invoice SHALL include IVA breakdown: base imponible + IVA 21% per line item + total (prices are VAT-included; the 21% general rate applies to the gallery's retail sale regardless of item kind). Shipping SHALL appear as a separate line with its own base + IVA 21% breakdown. The invoice SHALL include gallery fiscal data, buyer data, invoice number and date, and itemized lines. The buyer's `dni` SHALL be passed as the recipient's `taxId` and rendered as a "NIF/CIF" line; when the order has no `dni` the line SHALL be omitted and invoice generation SHALL succeed. If the order has no standard-regime items, the endpoint SHALL respond 400.

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

#### Scenario: Standard invoice shows the buyer's NIF
- **GIVEN** order #1060 has `dni = 'X1234567L'`
- **WHEN** the invoice is generated
- **THEN** the buyer section SHALL show a "NIF/CIF: X1234567L" line

#### Scenario: Standard invoice for an order without NIF
- **GIVEN** order #1030 has `dni = NULL`
- **WHEN** the admin requests the invoice
- **THEN** the invoice SHALL be generated without a "NIF/CIF" line and SHALL NOT return an error
