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
The `draw_email_verifications` table SHALL include an `ip_address` column (TEXT, nullable) to store the client IP captured during the send-verification step.

#### Scenario: Email verifications table includes ip_address after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** the `draw_email_verifications` table SHALL include an `ip_address TEXT` column

---

### Requirement: Draw performance indexes
The system SHALL create performance indexes on: `draw_participations(draw_id)`, `draw_participations(draw_buyer_id)`, `draw_buyers(draw_id)`, `draw_buyers(dni, draw_id)` (UNIQUE), `draw_buyers(email, draw_id)` (UNIQUE), `draws(status)`, and `draw_email_verifications(email, draw_id)`.

#### Scenario: All indexes exist after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** all specified indexes SHALL exist (created with `IF NOT EXISTS`), including the new UNIQUE index on `draw_buyers(email, draw_id)`

---

### Requirement: Draw public API endpoints
The system SHALL provide public API endpoints for draws mounted under `/api/draws`. The following endpoints SHALL exist: `GET /` (list by date range), `GET /:id` (detail), `POST /:id/register-buyer`, `POST /:id/send-verification`, `POST /:id/verify-email`, `POST /:id/setup-payment`, `POST /:id/confirm-payment`, `POST /:id/enter`, `POST /:id/validate-postal-code`. The `POST /:id/verify-buyer` endpoint SHALL NOT exist.

#### Scenario: Postal code validation endpoint available
- **WHEN** `POST /api/draws/:id/validate-postal-code` is called
- **THEN** the system SHALL route to the draw controller's validate postal code handler with Zod validation middleware

#### Scenario: Draw detail endpoint returns min_participants
- **WHEN** `GET /api/draws/:id` is called
- **THEN** the response SHALL include `min_participants` and `units` fields from the draws table
