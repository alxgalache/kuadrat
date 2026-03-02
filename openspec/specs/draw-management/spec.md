## MODIFIED Requirements

### Requirement: Draw buyers database schema
The system SHALL store draw participants in a `draw_buyers` table: `id` (TEXT PRIMARY KEY, UUID), `draw_id` (TEXT NOT NULL, FK → draws), `first_name` (TEXT NOT NULL), `last_name` (TEXT NOT NULL), `email` (TEXT NOT NULL), `dni` (TEXT NOT NULL), `ip_address` (TEXT), delivery address fields (address_1, address_2, postal_code, city, province, country, lat, long), invoicing address fields, and `created_at`. The table SHALL NOT include a `bid_password` column. A UNIQUE index SHALL exist on `(dni, draw_id)` to enforce one entry per DNI per draw. A UNIQUE index SHALL also exist on `(email, draw_id)` to enforce one entry per email per draw.

#### Scenario: Draw buyers table exists after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_buyers` table SHALL exist with all specified columns (including `dni` and `ip_address`, excluding `bid_password`), a foreign key to `draws(id)` with CASCADE delete, a UNIQUE index on `(dni, draw_id)`, and a UNIQUE index on `(email, draw_id)`

#### Scenario: DNI uniqueness enforced at database level
- **WHEN** an INSERT into `draw_buyers` is attempted with a `dni` + `draw_id` combination that already exists
- **THEN** the database SHALL reject the operation with a UNIQUE constraint violation

#### Scenario: Email uniqueness enforced at database level
- **WHEN** an INSERT into `draw_buyers` is attempted with an `email` + `draw_id` combination that already exists
- **THEN** the database SHALL reject the operation with a UNIQUE constraint violation

---

### Requirement: Draw authorised payment data schema
The system SHALL store Stripe payment authorization data in a `draw_authorised_payment_data` table: `id` (TEXT PRIMARY KEY, UUID), `draw_buyer_id` (TEXT NOT NULL, FK → draw_buyers), `name` (TEXT), `last_four` (TEXT), `stripe_setup_intent_id` (TEXT), `stripe_payment_method_id` (TEXT), `stripe_customer_id` (TEXT), `stripe_fingerprint` (TEXT), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Payment data table exists after initialization with fingerprint column
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_authorised_payment_data` table SHALL exist with all specified columns including `stripe_fingerprint`, and a foreign key to `draw_buyers(id)`

---

### Requirement: Draws table schema
The `draws` table SHALL include a `min_participants` column: `min_participants INTEGER NOT NULL DEFAULT 30`. This column stores the minimum number of participants required for the draw. The existing `units` column (INTEGER NOT NULL DEFAULT 1) stores the number of edition units.

#### Scenario: Draws table includes min_participants after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** the `draws` table SHALL include a `min_participants` column with type INTEGER, NOT NULL constraint, and DEFAULT 30

#### Scenario: Existing units column preserved
- **WHEN** `initializeDatabase()` runs
- **THEN** the `draws` table SHALL retain the `units` column with INTEGER type, NOT NULL constraint, and DEFAULT 1

---

### Requirement: Draw email verifications table with IP
The `draw_email_verifications` table SHALL include an `ip_address` column (TEXT, nullable) to store the client IP captured during the send-verification step. Full table schema: `id` (TEXT PRIMARY KEY, UUID), `email` (TEXT NOT NULL), `draw_id` (TEXT NOT NULL, FK → draws), `code` (TEXT NOT NULL), `attempts` (INTEGER NOT NULL DEFAULT 0), `expires_at` (DATETIME NOT NULL), `verified` (INTEGER NOT NULL DEFAULT 0), `ip_address` (TEXT), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Email verifications table includes ip_address after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** the `draw_email_verifications` table SHALL include an `ip_address TEXT` column

#### Scenario: Email verifications table exists after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_email_verifications` table SHALL exist with all specified columns and a foreign key to `draws(id)` with CASCADE delete

#### Scenario: Index on email and draw_id
- **WHEN** `initializeDatabase()` runs
- **THEN** an index SHALL exist on `draw_email_verifications(email, draw_id)` for efficient lookups

---

### Requirement: Draw performance indexes
The system SHALL create performance indexes on: `draw_participations(draw_id)`, `draw_participations(draw_buyer_id)`, `draw_buyers(draw_id)`, `draw_buyers(dni, draw_id)` (UNIQUE), `draw_buyers(email, draw_id)` (UNIQUE), `draws(status)`, and `draw_email_verifications(email, draw_id)`.

#### Scenario: All indexes exist after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** all specified indexes SHALL exist (created with `IF NOT EXISTS`), including the new UNIQUE index on `draw_buyers(email, draw_id)`

---

### Requirement: Draw Zod validation schemas
The system SHALL provide Zod validation schemas in `validators/drawSchemas.js` for all draw API endpoints. The `registerBuyerSchema` SHALL require `dni` in addition to existing fields. New schemas SHALL be provided for `sendVerificationSchema` (email, dni required), `verifyEmailSchema` (email, code required), and `checkDniSchema` (dni required). The `verifyBuyerSchema` SHALL be removed.

#### Scenario: Register buyer schema requires DNI
- **WHEN** a request body missing `dni` is validated against the register buyer schema
- **THEN** the validation SHALL fail with a descriptive error message

#### Scenario: Send verification schema validates required fields
- **WHEN** a request body missing `email` or `dni` is validated against the send verification schema
- **THEN** the validation SHALL fail with descriptive error messages

#### Scenario: Verify email schema validates code format
- **WHEN** a request body with `code` that is not a 6-digit string is validated
- **THEN** the validation SHALL fail indicating the code must be a 6-digit number

---

### Requirement: Draw API client functions
The frontend API client (`lib/api.js`) SHALL export a `drawsAPI` object that includes functions for the updated public draw endpoints: `getByDateRange(from, to)`, `getById(id)`, `registerBuyer(drawId, buyerData)`, `sendVerification(drawId, email, dni)`, `verifyEmail(drawId, email, code)`, `setupPayment(drawId, drawBuyerId)`, `confirmPayment(drawId, drawBuyerId, setupIntentId)`, `enterDraw(drawId, drawBuyerId)`. The `verifyBuyer` function SHALL be removed.

#### Scenario: drawsAPI includes sendVerification
- **WHEN** `drawsAPI.sendVerification(drawId, email, dni)` is called
- **THEN** the function SHALL make a POST request to `/api/draws/${drawId}/send-verification` with `{ email, dni }` in the body

#### Scenario: drawsAPI includes verifyEmail
- **WHEN** `drawsAPI.verifyEmail(drawId, email, code)` is called
- **THEN** the function SHALL make a POST request to `/api/draws/${drawId}/verify-email` with `{ email, code }` in the body

#### Scenario: drawsAPI does not include verifyBuyer
- **WHEN** the `drawsAPI` object is inspected
- **THEN** it SHALL NOT contain a `verifyBuyer` function

---

### Requirement: Draw public API endpoints
The system SHALL provide public API endpoints for draws mounted under `/api/draws`. The following endpoints SHALL exist: `GET /` (list by date range), `GET /:id` (detail), `POST /:id/register-buyer`, `POST /:id/send-verification`, `POST /:id/verify-email`, `POST /:id/setup-payment`, `POST /:id/confirm-payment`, `POST /:id/enter`, `POST /:id/validate-postal-code`. The `POST /:id/verify-buyer` endpoint SHALL NOT exist.

#### Scenario: Postal code validation endpoint available
- **WHEN** `POST /api/draws/:id/validate-postal-code` is called
- **THEN** the system SHALL route to the draw controller's validate postal code handler with Zod validation middleware

#### Scenario: Draw detail endpoint returns min_participants
- **WHEN** `GET /api/draws/:id` is called
- **THEN** the response SHALL include `min_participants` and `units` fields from the draws table

#### Scenario: New verification endpoints available
- **WHEN** `POST /api/draws/:id/send-verification` or `POST /api/draws/:id/verify-email` is called
- **THEN** the system SHALL route to the appropriate controller handler with validation middleware

#### Scenario: Verify-buyer endpoint removed
- **WHEN** `POST /api/draws/:id/verify-buyer` is called
- **THEN** the system SHALL return 404 (route does not exist)
