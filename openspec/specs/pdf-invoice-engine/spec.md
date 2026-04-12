# pdf-invoice-engine (ADDED)

## ADDED Requirements

### Requirement: Invoice numbering table
The system SHALL maintain an `invoices` table with columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `invoice_number` (TEXT NOT NULL UNIQUE), `series` (TEXT NOT NULL — 'A', 'P', 'C', 'L'), `year` (INTEGER NOT NULL), `sequence` (INTEGER NOT NULL), `invoice_type` (TEXT NOT NULL — 'buyer_rebu', 'buyer_standard', 'commission', 'settlement_rebu'), `order_id` (INTEGER, nullable), `withdrawal_id` (INTEGER, nullable), `event_attendee_id` (TEXT, nullable), `issued_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP). The table SHALL enforce UNIQUE(series, year, sequence).

#### Scenario: First invoice of the year in series A
- **WHEN** no invoice exists for series 'A' in year 2026
- **THEN** the next generated invoice SHALL have `sequence = 1` and `invoice_number = 'A-2026-00001'`

#### Scenario: Sequential numbering
- **GIVEN** the last invoice in series 'P' for year 2026 has `sequence = 42`
- **WHEN** a new standard buyer invoice is generated
- **THEN** the new invoice SHALL have `sequence = 43` and `invoice_number = 'P-2026-00043'`

#### Scenario: Idempotent regeneration
- **GIVEN** an invoice record exists for `order_id = 100`, `invoice_type = 'buyer_rebu'`
- **WHEN** the admin requests the same invoice again
- **THEN** the system SHALL return the same `invoice_number` and regenerate the PDF with the stored number

#### Scenario: No gaps in numbering
- **WHEN** an invoice generation fails after inserting into the `invoices` table
- **THEN** the row SHALL be rolled back atomically so no gap is created in the sequence

### Requirement: Buyer invoice — REBU (Series A)
The system SHALL generate a PDF invoice for orders containing `art` products under the REBU regime. The invoice SHALL NOT include any IVA breakdown. The invoice SHALL include the mandatory legal text: "Régimen especial de los bienes usados, objetos de arte, antigüedades y objetos de colección (artículos 135-139 de la Ley 37/1992)". The invoice SHALL include: gallery fiscal data (from `config.business.*`), buyer data (from `orders` table: `full_name`, `email`/`guest_email`, invoicing address fields), invoice number and date, line items with description and price, shipping cost (included in total, no IVA breakdown), and total amount.

#### Scenario: Generate REBU invoice for an art order
- **GIVEN** order #1050 has 2 `art_order_items` and 0 `other_order_items`, total = 1500€, shipping = 15€
- **WHEN** the admin requests the buyer invoice for order #1050
- **THEN** the system generates a PDF with series A invoice number
- **AND** the PDF shows 2 line items with artwork names and prices
- **AND** the PDF shows a shipping line of 15€
- **AND** the PDF shows total = 1515€ with NO IVA breakdown
- **AND** the PDF includes the REBU legal mention

#### Scenario: REBU invoice with buyer invoicing address
- **GIVEN** order #1050 has `invoicing_address_line_1`, `invoicing_postal_code`, `invoicing_city`, `invoicing_province`, `invoicing_country`
- **WHEN** the invoice is generated
- **THEN** the buyer section shows the full invoicing address

#### Scenario: REBU invoice with missing buyer address
- **GIVEN** order #1050 has `invoicing_address_line_1 = NULL`
- **WHEN** the admin requests the invoice
- **THEN** the system returns HTTP 400 with message "Faltan datos de facturación del comprador"

### Requirement: Buyer invoice — Standard (Series P)
The system SHALL generate a PDF invoice for orders containing `other` products under the standard VAT regime. The invoice SHALL include IVA breakdown: base imponible + IVA 21% per line item + total. Shipping SHALL appear as a separate line with its own base + IVA 21% breakdown. The invoice SHALL include gallery fiscal data, buyer data, invoice number and date, and itemized lines.

#### Scenario: Generate standard invoice for an other-product order
- **GIVEN** order #1060 has 1 `other_order_item` at 121€ (IVA included) and shipping = 12.10€ (IVA included)
- **WHEN** the admin requests the buyer invoice for order #1060
- **THEN** the system generates a PDF with series P invoice number
- **AND** the product line shows: base = 100€, IVA 21% = 21€, total = 121€
- **AND** the shipping line shows: base = 10€, IVA 21% = 2.10€, total = 12.10€
- **AND** the invoice totals show: base imponible = 110€, IVA 21% = 23.10€, total = 133.10€

### Requirement: Mixed order generates separate invoices
The system SHALL detect orders containing both `art` and `other` items and generate TWO separate invoices: one series A (REBU) for art items, one series P (Standard) for other items. Each invoice SHALL only include items of its corresponding regime.

#### Scenario: Mixed order with art and other products
- **GIVEN** order #1070 has 1 `art_order_item` at 500€ and 1 `other_order_item` at 60.50€
- **WHEN** the admin requests buyer invoices for order #1070
- **THEN** the system generates 2 PDFs
- **AND** the first PDF (series A) includes only the art item with REBU regime
- **AND** the second PDF (series P) includes only the other item with standard IVA breakdown

#### Scenario: Order with only art items
- **GIVEN** order #1080 has 2 `art_order_items` and 0 `other_order_items`
- **WHEN** the admin requests buyer invoices
- **THEN** only 1 PDF is generated (series A, REBU)

#### Scenario: Order with only other items
- **GIVEN** order #1090 has 0 `art_order_items` and 2 `other_order_items`
- **WHEN** the admin requests buyer invoices
- **THEN** only 1 PDF is generated (series P, Standard)

### Requirement: Event ticket invoice (Series P)
The system SHALL generate a standard (series P) PDF invoice for event ticket purchases. The invoice SHALL use simplified buyer data from `event_attendees` (first_name, last_name, email — no invoicing address required). The invoice line SHALL show the event name and ticket price with IVA 21% breakdown.

#### Scenario: Generate event ticket invoice
- **GIVEN** attendee "María García" (email: maria@example.com) paid 24.20€ for event "Exposición de Arte Moderno"
- **WHEN** the admin requests the invoice for this attendee
- **THEN** the system generates a PDF with series P invoice number
- **AND** the buyer section shows "María García" and "maria@example.com" (no address)
- **AND** the line item shows: "Entrada — Exposición de Arte Moderno", base = 20€, IVA 21% = 4.20€, total = 24.20€

#### Scenario: Event attendee not paid
- **GIVEN** attendee has `status = 'registered'` (not paid)
- **WHEN** the admin requests the invoice
- **THEN** the system returns HTTP 400 with "El asistente no ha realizado el pago"

### Requirement: Commission invoice — Standard (Series C)
The system SHALL generate a PDF invoice from the gallery to the artist for intermediation commission services. This invoice SHALL only be generated for withdrawals with `vat_regime = 'standard_vat'`. The invoice SHALL include: gallery fiscal data as issuer, artist fiscal data as recipient (from `users` table: `fiscal_full_name`, `tax_id`, fiscal address fields), individual line items per product/event: "Comisión por intermediación – [Producto/Evento] (Pedido #XXXX)", base imponible + IVA 21% per line, and totals.

#### Scenario: Generate commission invoice for standard payout
- **GIVEN** withdrawal #200 has `vat_regime = 'standard_vat'` and 3 `withdrawal_items` with commission amounts of 50€, 30€, 20€ (before IVA)
- **WHEN** the admin requests the commission invoice for withdrawal #200
- **THEN** the system generates a PDF with series C invoice number
- **AND** the PDF shows 3 lines with individual commission descriptions
- **AND** each line shows base + IVA 21%
- **AND** the totals show: base = 100€, IVA 21% = 21€, total = 121€
- **AND** the artist's fiscal data appears as the invoice recipient

#### Scenario: Commission invoice for unpaid withdrawal
- **GIVEN** withdrawal #201 has `status = 'pending'`
- **WHEN** the admin requests the commission invoice
- **THEN** the system returns HTTP 409 with "El pago aún no ha sido ejecutado"

#### Scenario: Commission invoice for REBU withdrawal
- **GIVEN** withdrawal #202 has `vat_regime = 'art_rebu'`
- **WHEN** the admin requests a commission invoice
- **THEN** the system returns HTTP 400 with "Las comisiones REBU no generan factura de comisión. Use la nota de liquidación."

### Requirement: Settlement note — REBU (Series L)
The system SHALL generate an internal settlement note (NOT a fiscal invoice) for REBU withdrawals. The document SHALL include a clear disclaimer: "Documento interno de liquidación — no constituye factura". The note SHALL show margin calculation per artwork: sell price, buy price (artist payment), margin, and embedded IVA within the margin (margin/1.21 = base, IVA = margin − base). Line format: "Margen REBU – [Obra] (Pedido #XXXX)".

#### Scenario: Generate REBU settlement note
- **GIVEN** withdrawal #300 has `vat_regime = 'art_rebu'` and 2 items: artwork A sold at 1000€ (artist gets 750€, margin 250€), artwork B sold at 500€ (artist gets 375€, margin 125€)
- **WHEN** the admin requests the settlement note for withdrawal #300
- **THEN** the system generates a PDF with series L number
- **AND** the header includes "NOTA DE LIQUIDACIÓN INTERNA" and the disclaimer
- **AND** artwork A line shows: venta = 1000€, coste = 750€, margen = 250€, base = 206.61€, IVA embebido = 43.39€
- **AND** artwork B line shows: venta = 500€, coste = 375€, margen = 125€, base = 103.31€, IVA embebido = 21.69€
- **AND** totals show: margen total = 375€, base total = 309.92€, IVA embebido total = 65.08€

#### Scenario: Settlement note for non-REBU withdrawal
- **GIVEN** withdrawal #301 has `vat_regime = 'standard_vat'`
- **WHEN** the admin requests a settlement note
- **THEN** the system returns HTTP 400 with "Las notas de liquidación solo aplican al régimen REBU"

### Requirement: PDF design and format
All generated PDFs SHALL be A4 vertical format (595.28 x 841.89 pt). The design SHALL use: Inter font (Regular and Bold variants, embedded .ttf), primary text color #111827, accent color #1d4ed8 for the gallery name, white background, adequate margins (50pt), and a minimalist style matching the application frontend. Each document SHALL include: gallery logo or name header, document type label, invoice/document number, issue date, issuer data, recipient data, line items table, totals section, and applicable legal mentions.

#### Scenario: PDF is valid A4
- **WHEN** any PDF is generated
- **THEN** the document page size SHALL be 595.28 x 841.89 points (A4 portrait)

#### Scenario: Inter font rendering
- **WHEN** a PDF is generated with Inter font files available
- **THEN** all text SHALL render in Inter Regular or Inter Bold

#### Scenario: Fallback font
- **WHEN** Inter font files are missing from `api/assets/fonts/`
- **THEN** the system SHALL fall back to Helvetica and log a warning

### Requirement: Admin order invoice buttons
The admin order detail page (`/admin/pedidos/[id]`) SHALL display a "Facturas" section in the sidebar, below the order summary. The section SHALL show conditional buttons:
- If the order has `art` items: "Descargar factura REBU" button
- If the order has `other` items: "Descargar factura IVA 21%" button
- If the order has both: both buttons are shown
Each button SHALL trigger a download of the corresponding PDF.

#### Scenario: Order with only art items
- **GIVEN** the admin views order #1050 which has only `art_order_items`
- **WHEN** the page loads
- **THEN** the "Facturas" section shows only "Descargar factura REBU" button

#### Scenario: Order with both types
- **GIVEN** the admin views order #1070 which has both item types
- **WHEN** the page loads
- **THEN** the "Facturas" section shows both "Descargar factura REBU" and "Descargar factura IVA 21%" buttons

#### Scenario: Download triggers PDF generation
- **WHEN** the admin clicks "Descargar factura REBU"
- **THEN** the browser downloads a PDF file named `factura_A-2026-XXXXX.pdf`

### Requirement: Admin event attendee invoice button
The admin event detail page (`/admin/espacios/[id]`) SHALL display, for each attendee with `status = 'paid'` or `'joined'`, a download icon/button to generate their event ticket invoice (series P).

#### Scenario: Paid attendee shows invoice button
- **GIVEN** attendee "María García" has `status = 'paid'` for event #5
- **WHEN** the admin views the event detail page
- **THEN** a small download button appears next to María's row in the attendee list

#### Scenario: Unpaid attendee has no invoice button
- **GIVEN** attendee "Juan López" has `status = 'registered'` for event #5
- **WHEN** the admin views the event detail page
- **THEN** no invoice button appears next to Juan's row

### Requirement: Payout history invoice buttons
The payout detail page (`/admin/payouts/[sellerId]`) SHALL display, in the payment history table, for each completed withdrawal:
- For `vat_regime = 'standard_vat'` withdrawals: a "Factura comisión" download button
- For `vat_regime = 'art_rebu'` withdrawals: a "Nota de liquidación" download button
These buttons SHALL only appear for withdrawals with `status = 'completed'`.

#### Scenario: Completed standard payout shows commission invoice button
- **GIVEN** withdrawal #200 has `vat_regime = 'standard_vat'` and `status = 'completed'`
- **WHEN** the admin views the payout detail page
- **THEN** a "Factura comisión" button appears in the history row for withdrawal #200

#### Scenario: Completed REBU payout shows settlement note button
- **GIVEN** withdrawal #300 has `vat_regime = 'art_rebu'` and `status = 'completed'`
- **WHEN** the admin views the payout detail page
- **THEN** a "Nota de liquidación" button appears in the history row for withdrawal #300

#### Scenario: Pending payout has no invoice button
- **GIVEN** withdrawal #400 has `status = 'pending'`
- **WHEN** the admin views the payout detail page
- **THEN** no invoice/note button appears for withdrawal #400

### Requirement: Autofactura placeholder buttons
The payout detail page (`/admin/payouts/[sellerId]`) SHALL display, below each "Ejecutar pago" button in the BucketCard component, a button labeled "Generar autofactura en nombre del artista". This button SHALL have no functionality — it is a UI placeholder only. The button SHALL be visually styled as secondary/outline to differentiate it from the primary payout button.

#### Scenario: Autofactura button displayed
- **WHEN** the admin views the payout detail page for a seller with pending items
- **THEN** below each "Ejecutar pago" button, a "Generar autofactura en nombre del artista" button is visible
- **AND** the button is styled as secondary/outline

#### Scenario: Autofactura button does nothing
- **WHEN** the admin clicks "Generar autofactura en nombre del artista"
- **THEN** nothing happens (no API call, no navigation, no modal)

### Requirement: API endpoints for invoice generation
The system SHALL expose the following admin-only API endpoints:
- `GET /api/admin/invoices/order/:orderId/buyer?type=rebu|standard` — Generate/download buyer invoice PDF
- `GET /api/admin/invoices/event-attendee/:attendeeId` — Generate/download event ticket invoice PDF
- `GET /api/admin/invoices/withdrawal/:withdrawalId/commission` — Generate/download commission invoice PDF
- `GET /api/admin/invoices/withdrawal/:withdrawalId/settlement` — Generate/download settlement note PDF
All endpoints SHALL require admin authentication. All SHALL return `Content-Type: application/pdf` with `Content-Disposition: attachment`.

#### Scenario: Successful PDF download
- **WHEN** the admin calls `GET /api/admin/invoices/order/1050/buyer?type=rebu`
- **THEN** the response has `Content-Type: application/pdf`
- **AND** `Content-Disposition: attachment; filename="factura_A-2026-00001.pdf"`
- **AND** the body is a valid PDF stream

#### Scenario: Unauthorized access
- **WHEN** a non-admin user calls any invoice endpoint
- **THEN** the response is HTTP 401 or 403

#### Scenario: Order not found
- **WHEN** the admin calls `GET /api/admin/invoices/order/99999/buyer?type=rebu`
- **THEN** the response is HTTP 404 with "Pedido no encontrado"
