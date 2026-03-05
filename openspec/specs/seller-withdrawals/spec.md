## ADDED Requirements

### Requirement: Withdrawals table
The system SHALL maintain a `withdrawals` table with the following columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `user_id` (INTEGER NOT NULL, FK to users), `amount` (REAL NOT NULL), `iban` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'pending', CHECK IN ('pending', 'completed', 'failed')), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP), `completed_at` (DATETIME DEFAULT NULL), `admin_notes` (TEXT DEFAULT NULL). An index SHALL exist on `user_id` for efficient seller-specific queries.

#### Scenario: Withdrawal record created on request
- **WHEN** a seller submits a withdrawal request
- **THEN** a new row SHALL be inserted into the `withdrawals` table with the seller's `user_id`, the withdrawal `amount`, the provided `iban`, and `status` = `'pending'`

#### Scenario: Withdrawal history is queryable
- **WHEN** an admin queries the withdrawals table (future admin dashboard)
- **THEN** all withdrawal records SHALL be available with their status, amounts, IBANs, and timestamps

### Requirement: Withdrawal request endpoint
The system SHALL provide a `POST /api/seller/withdrawals` endpoint that creates a withdrawal request. The endpoint MUST be protected by `authenticate` and `requireSeller` middleware. The endpoint SHALL accept an IBAN, a recipient name, and an optional flag to save these payment details.

#### Scenario: Successful withdrawal request
- **WHEN** an authenticated seller submits a withdrawal request with a valid IBAN, recipient name, AND their `available_withdrawal` is greater than 0
- **THEN** the system SHALL atomically: (1) create a withdrawal record with the full `available_withdrawal` amount, (2) set the seller's `available_withdrawal` to 0, (3) update the seller's saved payment details if the save flag is true, (4) return the created withdrawal details

#### Scenario: Withdrawal with zero balance
- **WHEN** an authenticated seller submits a withdrawal request AND their `available_withdrawal` is 0
- **THEN** the system SHALL return a 400 error indicating insufficient funds

#### Scenario: Fraudulent amount prevention
- **WHEN** a request is received with a manipulated amount exceeding the seller's actual `available_withdrawal`
- **THEN** the system SHALL ignore the client-provided amount and use the server-side `available_withdrawal` value instead

#### Scenario: IBAN validation
- **WHEN** a seller submits a withdrawal request with an empty or missing IBAN
- **THEN** the system SHALL return a 400 validation error

### Requirement: Balance deduction on withdrawal
The system SHALL set the seller's `available_withdrawal` to 0 when a withdrawal is processed. The balance update and withdrawal record creation MUST occur within the same atomic transaction/batch.

#### Scenario: Balance reset after withdrawal
- **WHEN** a withdrawal request is successfully processed
- **THEN** the seller's `available_withdrawal` SHALL be 0

#### Scenario: Concurrent withdrawal protection
- **WHEN** two withdrawal requests arrive simultaneously for the same seller
- **THEN** only one SHALL succeed; the second SHALL fail with an insufficient funds error (balance already 0)

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

### Requirement: Admin email notification on withdrawal
The system SHALL send an email notification to the admin when a seller submits a withdrawal request. The email SHALL be sent to the address configured in `config.registrationEmail` (env var `REGISTRATION_EMAIL`). The email MUST include: the seller's name, email, the withdrawal amount, the IBAN provided, and the date of the request.

#### Scenario: Admin receives withdrawal notification
- **WHEN** a withdrawal request is successfully created
- **THEN** the system SHALL send an email to `config.registrationEmail` with the withdrawal details

#### Scenario: Email failure does not block withdrawal
- **WHEN** the admin notification email fails to send
- **THEN** the withdrawal SHALL still be recorded successfully, and the error SHALL be logged

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

#### Scenario: Submission
- **WHEN** the seller clicks "Confirmar" on step 2
- **THEN** the system SHALL call `POST /api/seller/withdrawals` with the recipient name, IBAN, and save preferences, show a loading state, and on success display a confirmation message and update the displayed balance to 0

#### Scenario: Go back from confirmation
- **WHEN** the seller clicks "Volver" on step 2
- **THEN** the modal SHALL return to step 1 with the previously entered details preserved

#### Scenario: Disabled button when balance is zero
- **WHEN** the seller's available balance is 0
- **THEN** the "Realizar transferencia" button SHALL be disabled with a visual indication
