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
