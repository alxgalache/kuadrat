## ADDED Requirements

### Requirement: Save withdrawal payment details
The system SHALL allow users to save their withdrawal payment details (recipient name and IBAN) for future use. The `users` table SHALL be updated to include `withdrawal_recipient` (TEXT) and `withdrawal_iban` (TEXT) columns.

#### Scenario: User saves payment details during withdrawal
- **WHEN** a seller checks the "Recordar beneficiario y número de cuenta para futuros pagos" checkbox and submits a successful withdrawal request
- **THEN** the system SHALL update the seller's `withdrawal_recipient` and `withdrawal_iban` in the `users` table with the provided values

#### Scenario: User payment details are pre-filled
- **WHEN** a seller with saved `withdrawal_recipient` and `withdrawal_iban` opens the withdrawal modal
- **THEN** the "Full name" and IBAN input fields SHALL be automatically populated with their saved values

## MODIFIED Requirements

### Requirement: Withdrawal request endpoint
The system SHALL provide a `POST /api/seller/withdrawals` endpoint that creates a withdrawal request. The endpoint MUST be protected by `authenticate` and `requireSeller` middleware, and accept optional `saveDetails` and `recipientName` fields in addition to the required `iban`.

#### Scenario: Successful withdrawal request
- **WHEN** an authenticated seller submits a withdrawal request with a valid IBAN AND their `available_withdrawal` is greater than 0
- **THEN** the system SHALL atomically: (1) create a withdrawal record with the full `available_withdrawal` amount, (2) set the seller's `available_withdrawal` to 0, (3) return the created withdrawal details

#### Scenario: Withdrawal with zero balance
- **WHEN** an authenticated seller submits a withdrawal request AND their `available_withdrawal` is 0
- **THEN** the system SHALL return a 400 error indicating insufficient funds

#### Scenario: Fraudulent amount prevention
- **WHEN** a request is received with a manipulated amount exceeding the seller's actual `available_withdrawal`
- **THEN** the system SHALL ignore the client-provided amount and use the server-side `available_withdrawal` value instead

#### Scenario: IBAN validation
- **WHEN** a seller submits a withdrawal request with an empty or missing IBAN
- **THEN** the system SHALL return a 400 validation error

#### Scenario: Updating saved payment details
- **WHEN** a seller submits a valid withdrawal request with `saveDetails` set to true
- **THEN** the system SHALL update the user's `withdrawal_recipient` and `withdrawal_iban` in the database within the same transaction

### Requirement: Two-step withdrawal modal
The frontend SHALL display a two-step modal when the seller clicks "Realizar transferencia" in the Monedero section. The modal SHALL use standard styled input fields matching the `publish` page. The IBAN input SHALL auto-format by adding a space every 4 digits while typing.

#### Scenario: Step 1 - Form inputs
- **WHEN** the seller clicks "Realizar transferencia"
- **THEN** a modal SHALL appear with: a "Full name" input, an auto-formatting IBAN input, a "Recordar beneficiario..." checkbox, and a "Siguiente" (next) button

#### Scenario: IBAN auto-formatting
- **WHEN** the user types an alphanumeric string into the IBAN field
- **THEN** the field SHALL visually format the string by inserting a space every 4 characters

#### Scenario: Step 2 - Confirmation
- **WHEN** the seller fills in a valid name and IBAN and clicks "Siguiente"
- **THEN** the modal SHALL display: the entered Name and IBAN for review, the withdrawal amount, and "Confirmar" and "Volver" buttons

#### Scenario: Submission
- **WHEN** the seller clicks "Confirmar" on step 2
- **THEN** the system SHALL call `POST /api/seller/withdrawals` with the IBAN, Name, and save preference, show a loading state, and on success display a confirmation message and update the displayed balance to 0

#### Scenario: Go back from confirmation
- **WHEN** the seller clicks "Volver" on step 2
- **THEN** the modal SHALL return to step 1 with the previously entered data preserved

#### Scenario: Disabled button when balance is zero
- **WHEN** the seller's available balance is 0
- **THEN** the "Realizar transferencia" button SHALL be disabled with a visual indication
