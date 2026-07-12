# stripe-connect-fiscal-report (MODIFIED)

## MODIFIED Requirements

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
