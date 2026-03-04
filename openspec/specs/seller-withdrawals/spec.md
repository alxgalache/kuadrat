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
The system SHALL provide a `POST /api/seller/withdrawals` endpoint that creates a withdrawal request. The endpoint MUST be protected by `authenticate` and `requireSeller` middleware.

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

### Requirement: Balance deduction on withdrawal
The system SHALL set the seller's `available_withdrawal` to 0 when a withdrawal is processed. The balance update and withdrawal record creation MUST occur within the same atomic transaction/batch.

#### Scenario: Balance reset after withdrawal
- **WHEN** a withdrawal request is successfully processed
- **THEN** the seller's `available_withdrawal` SHALL be 0

#### Scenario: Concurrent withdrawal protection
- **WHEN** two withdrawal requests arrive simultaneously for the same seller
- **THEN** only one SHALL succeed; the second SHALL fail with an insufficient funds error (balance already 0)

### Requirement: Admin email notification on withdrawal
The system SHALL send an email notification to the admin when a seller submits a withdrawal request. The email SHALL be sent to the address configured in `config.registrationEmail` (env var `REGISTRATION_EMAIL`). The email MUST include: the seller's name, email, the withdrawal amount, the IBAN provided, and the date of the request.

#### Scenario: Admin receives withdrawal notification
- **WHEN** a withdrawal request is successfully created
- **THEN** the system SHALL send an email to `config.registrationEmail` with the withdrawal details

#### Scenario: Email failure does not block withdrawal
- **WHEN** the admin notification email fails to send
- **THEN** the withdrawal SHALL still be recorded successfully, and the error SHALL be logged

### Requirement: Two-step withdrawal modal
The frontend SHALL display a two-step modal when the seller clicks "Realizar transferencia" in the Monedero section.

#### Scenario: Step 1 - IBAN input
- **WHEN** the seller clicks "Realizar transferencia"
- **THEN** a modal SHALL appear with: a title, a description explaining the process, an IBAN input field, and a "Siguiente" (next) button

#### Scenario: Step 2 - Confirmation
- **WHEN** the seller fills in a valid IBAN and clicks "Siguiente"
- **THEN** the modal SHALL display: the entered IBAN for review, the withdrawal amount, and "Confirmar" and "Volver" buttons

#### Scenario: Submission
- **WHEN** the seller clicks "Confirmar" on step 2
- **THEN** the system SHALL call `POST /api/seller/withdrawals` with the IBAN, show a loading state, and on success display a confirmation message and update the displayed balance to 0

#### Scenario: Go back from confirmation
- **WHEN** the seller clicks "Volver" on step 2
- **THEN** the modal SHALL return to step 1 with the previously entered IBAN preserved

#### Scenario: Disabled button when balance is zero
- **WHEN** the seller's available balance is 0
- **THEN** the "Realizar transferencia" button SHALL be disabled with a visual indication
