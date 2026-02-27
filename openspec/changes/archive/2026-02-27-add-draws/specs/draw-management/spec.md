## ADDED Requirements

### Requirement: Draw database schema
The system SHALL store draws in a `draws` table with the following columns: `id` (TEXT PRIMARY KEY, UUID), `name` (TEXT NOT NULL), `description` (TEXT), `product_id` (INTEGER NOT NULL), `product_type` (TEXT NOT NULL, CHECK 'art' | 'other'), `price` (REAL NOT NULL), `units` (INTEGER NOT NULL DEFAULT 1), `max_participations` (INTEGER NOT NULL), `start_datetime` (DATETIME NOT NULL), `end_datetime` (DATETIME NOT NULL), `status` (TEXT NOT NULL DEFAULT 'draft', CHECK 'draft' | 'scheduled' | 'active' | 'finished' | 'cancelled'), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP). Foreign keys SHALL reference either `art(id)` or `others(id)` based on `product_type` (enforced at application level since SQLite does not support conditional FKs).

#### Scenario: Draws table exists after database initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draws` table SHALL exist with all specified columns and constraints

#### Scenario: Draw status values are constrained
- **WHEN** a draw record is inserted or updated with a status value not in ('draft', 'scheduled', 'active', 'finished', 'cancelled')
- **THEN** the database SHALL reject the operation with a CHECK constraint violation

---

### Requirement: Draw buyers database schema
The system SHALL store draw participants in a `draw_buyers` table with the same structure as `auction_buyers`: `id` (TEXT PRIMARY KEY, UUID), `draw_id` (TEXT NOT NULL, FK → draws), `first_name`, `last_name`, `email`, `bid_password` (6-char alphanumeric), delivery address fields (address_1, address_2, postal_code, city, province, country, lat, long), invoicing address fields, and `created_at`. The `bid_password` field stores the participant's return-access password.

#### Scenario: Draw buyers table exists after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_buyers` table SHALL exist with all specified columns and a foreign key to `draws(id)` with CASCADE delete

---

### Requirement: Draw participations database schema
The system SHALL store draw entries in a `draw_participations` table: `id` (TEXT PRIMARY KEY, UUID), `draw_id` (TEXT NOT NULL, FK → draws), `draw_buyer_id` (TEXT NOT NULL, FK → draw_buyers), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP). Each record represents one participation entry.

#### Scenario: Draw participations table exists after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_participations` table SHALL exist with foreign keys to `draws(id)` and `draw_buyers(id)`

#### Scenario: Participation uniqueness enforced at application level
- **WHEN** a buyer attempts to create a second participation for the same draw
- **THEN** the service layer SHALL reject the request with an appropriate error (uniqueness checked by email per draw before insert)

---

### Requirement: Draw authorised payment data schema
The system SHALL store Stripe payment authorization data in a `draw_authorised_payment_data` table with the same structure as `auction_authorised_payment_data`: `id` (TEXT PRIMARY KEY, UUID), `draw_buyer_id` (TEXT NOT NULL, FK → draw_buyers), `name`, `last_four`, `stripe_setup_intent_id`, `stripe_payment_method_id`, `stripe_customer_id`, `created_at`.

#### Scenario: Payment data table exists after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** a `draw_authorised_payment_data` table SHALL exist with a foreign key to `draw_buyers(id)`

---

### Requirement: Draw performance indexes
The system SHALL create performance indexes on: `draw_participations(draw_id)`, `draw_participations(draw_buyer_id)`, `draw_buyers(draw_id)`, and `draws(status)`.

#### Scenario: Indexes exist after initialization
- **WHEN** `initializeDatabase()` runs
- **THEN** the specified indexes SHALL exist (created with `IF NOT EXISTS`)

---

### Requirement: Draw service CRUD operations
The `drawService` module SHALL provide functions for: `createDraw(data)`, `updateDraw(id, fields)`, `deleteDraw(id)`, `getDrawById(id)`, `listDraws(filters)`, and `getDrawsByDateRange(from, to)`. All functions SHALL follow the patterns established in `auctionService.js` (UUID generation, status checks for updates/deletes, hydrated responses with product data).

#### Scenario: Create a draw with valid data
- **WHEN** `createDraw()` is called with name, product_id, product_type, price, units, max_participations, start_datetime, end_datetime
- **THEN** a new draw record SHALL be created with status 'draft' and a UUID primary key, and the created draw SHALL be returned

#### Scenario: Update a draw that is not draft or scheduled
- **WHEN** `updateDraw(id, fields)` is called for a draw with status 'active' or 'finished'
- **THEN** the service SHALL throw an error indicating only draft/scheduled draws can be updated

#### Scenario: Delete a draw that is active
- **WHEN** `deleteDraw(id)` is called for a draw with status 'active'
- **THEN** the service SHALL throw an error indicating only draft/cancelled draws can be deleted

#### Scenario: Get draw by ID returns hydrated data
- **WHEN** `getDrawById(id)` is called
- **THEN** the response SHALL include the draw record joined with product data (name, basename, seller name) resolved from the `art` or `others` table based on `product_type`

#### Scenario: Get draws by date range returns product previews
- **WHEN** `getDrawsByDateRange(from, to)` is called
- **THEN** the response SHALL include each draw with its product preview (basename, name, product_type, seller_name, price) and current participation count

---

### Requirement: Draw admin API endpoints
The system SHALL provide admin API endpoints for draw CRUD, mounted under `/api/admin/draws`. All admin routes SHALL require authentication and admin authorization (following the `routes/admin/` pattern).

#### Scenario: Create draw via admin API
- **WHEN** `POST /api/admin/draws` is called with valid draw data and admin credentials
- **THEN** the draw SHALL be created and the response SHALL use `sendCreated()` with the new draw record

#### Scenario: List draws via admin API
- **WHEN** `GET /api/admin/draws` is called with optional status filter
- **THEN** all matching draws SHALL be returned using `sendSuccess()`

#### Scenario: Update draw via admin API
- **WHEN** `PUT /api/admin/draws/:id` is called with updated fields and admin credentials
- **THEN** the draw SHALL be updated and the response SHALL use `sendSuccess()`

#### Scenario: Delete draw via admin API
- **WHEN** `DELETE /api/admin/draws/:id` is called with admin credentials
- **THEN** the draw SHALL be deleted (if draft/cancelled) and return 200

#### Scenario: Start draw via admin API
- **WHEN** `POST /api/admin/draws/:id/start` is called for a scheduled draw
- **THEN** the draw status SHALL transition to 'active'

#### Scenario: Cancel draw via admin API
- **WHEN** `POST /api/admin/draws/:id/cancel` is called for a non-finished draw
- **THEN** the draw status SHALL transition to 'cancelled'

---

### Requirement: Draw public API endpoints
The system SHALL provide public API endpoints for reading draws, mounted under `/api/draws`. List and detail endpoints SHALL use `cacheControl()` middleware.

#### Scenario: Get draws by date range
- **WHEN** `GET /api/draws?from=...&to=...` is called with valid date range parameters
- **THEN** the response SHALL return draws within that range with product previews and participation counts, using `sendSuccess()`

#### Scenario: Get draw detail
- **WHEN** `GET /api/draws/:id` is called with a valid draw ID
- **THEN** the response SHALL return the full draw record with hydrated product data, current participation count, and max_participations

#### Scenario: Get draw detail for non-existent ID
- **WHEN** `GET /api/draws/:id` is called with an invalid draw ID
- **THEN** the response SHALL return 404 via `ApiError`

---

### Requirement: Draw Zod validation schemas
The system SHALL provide Zod validation schemas in `validators/drawSchemas.js` for all draw API endpoints, following the patterns in `auctionSchemas.js`. Schemas SHALL validate: createDraw (name, product_id, product_type, price, units, max_participations, start_datetime, end_datetime required), updateDraw (all fields optional), registerBuyer, verifyBuyer, setupPayment, confirmPayment, and enterDraw request bodies.

#### Scenario: Create draw schema rejects missing required fields
- **WHEN** a request body missing `name` or `max_participations` is validated against the create draw schema
- **THEN** the validation SHALL fail with descriptive error messages

#### Scenario: Product type schema validates enum
- **WHEN** a request body with `product_type: 'invalid'` is validated
- **THEN** the validation SHALL fail indicating product_type must be 'art' or 'other'

---

### Requirement: Draw API client functions
The frontend API client (`lib/api.js`) SHALL export a `drawsAPI` object with functions for all public draw endpoints: `getByDateRange(from, to)`, `getById(id)`, `registerBuyer(drawId, buyerData)`, `verifyBuyer(drawId, email, password)`, `setupPayment(drawId, drawBuyerId)`, `confirmPayment(drawId, drawBuyerId, setupIntentId)`, `enterDraw(drawId, drawBuyerId)`, and `getPostalCodes(drawId)`. An `adminAPI.draws` object SHALL provide admin CRUD functions.

#### Scenario: drawsAPI.getByDateRange returns draws with previews
- **WHEN** `drawsAPI.getByDateRange('2026-03-01', '2026-03-31')` is called
- **THEN** the function SHALL make a GET request to `/api/draws?from=2026-03-01&to=2026-03-31` and return the parsed response

#### Scenario: adminAPI.draws.create sends POST request
- **WHEN** `adminAPI.draws.create(drawData)` is called
- **THEN** the function SHALL make an authenticated POST request to `/api/admin/draws`
