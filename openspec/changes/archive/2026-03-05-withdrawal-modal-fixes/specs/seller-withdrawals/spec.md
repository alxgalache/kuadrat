## MODIFIED Requirements

### Requirement: Two-step withdrawal modal
The frontend SHALL display a two-step modal when the seller clicks "Realizar transferencia" in the Monedero section. The UI for the modal inputs MUST match the rest of the application's styled inputs.

#### Scenario: Step 1 - Payment details input
- **WHEN** the seller clicks "Realizar transferencia"
- **THEN** a modal SHALL appear with: a title, a description explaining the process, a "Full name" input field, an IBAN input field, a checkbox to save these details for future use, and a "Siguiente" (next) button. If the seller has previously saved details, the "Full name" and IBAN inputs SHALL be pre-filled.

#### Scenario: Step 1 - IBAN formatting
- **WHEN** the seller types in the IBAN input field
- **THEN** the text SHALL be automatically formatted to include a space every 4 characters

#### Scenario: Step 1 - IBAN maximum length
- **WHEN** the seller types in the IBAN input field and the raw alphanumeric content (excluding formatting spaces) reaches 24 characters
- **THEN** the input SHALL NOT accept additional alphanumeric characters beyond the 24-character limit
- **AND** the displayed value SHALL show the 24 characters formatted with spaces every 4 characters (e.g., "ES00 0000 0000 0000 0000 0000")

#### Scenario: Step 1 - Checkbox styling
- **WHEN** the "save details" checkbox is checked
- **THEN** the checkbox SHALL render with a black accent color, matching the checkbox styling used in other pages (e.g., `seller/publish`)

#### Scenario: Step 2 - Confirmation
- **WHEN** the seller fills in a valid recipient name and IBAN and clicks "Siguiente"
- **THEN** the modal SHALL display: the entered recipient name and IBAN for review, the withdrawal amount, and "Confirmar" and "Volver" buttons

### Requirement: Save withdrawal payment details
The system SHALL support persisting a seller's preferred payment details for future withdrawals. The `users` table SHALL include `withdrawal_recipient` (TEXT) and `withdrawal_iban` (TEXT) columns.

#### Scenario: User saves payment details
- **WHEN** a seller successfully submits a withdrawal request with the save details flag checked
- **THEN** their `withdrawal_recipient` and `withdrawal_iban` columns SHALL be updated in the database

#### Scenario: Pre-filling saved details
- **WHEN** a seller with saved details opens the withdrawal modal
- **THEN** the recipient name and IBAN fields SHALL be pre-filled with the stored data

#### Scenario: Checkbox pre-checked when stored data exists
- **WHEN** a seller opens the withdrawal modal AND the `withdrawal_recipient` or `withdrawal_iban` columns in the `users` table contain non-empty values
- **THEN** the "save details" checkbox SHALL be displayed as checked

#### Scenario: Checkbox unchecked when no stored data
- **WHEN** a seller opens the withdrawal modal AND both `withdrawal_recipient` and `withdrawal_iban` columns are empty or NULL
- **THEN** the "save details" checkbox SHALL be displayed as unchecked

#### Scenario: Clear stored data on uncheck
- **WHEN** a seller submits a withdrawal request with the save details flag unchecked
- **THEN** the system SHALL set `withdrawal_recipient` to NULL and `withdrawal_iban` to NULL in the `users` table for that seller
- **AND** the frontend local state for saved payment details SHALL be cleared
