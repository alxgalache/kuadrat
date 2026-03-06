## ADDED Requirements

### Requirement: Server-side shipping cost verification

The `createPaymentIntentEndpoint` SHALL compute shipping costs from the database using the shipping method ID and delivery zone, rather than trusting `item.shipping.cost` values from the client request. The system SHALL use the same shipping rules stored in the shipping tables to determine the correct cost.

#### Scenario: Client sends correct shipping cost
- **WHEN** a client submits a payment intent request with shipping costs that match the server-computed values
- **THEN** the system SHALL create the payment intent with the server-computed total (client values are ignored, server values used)

#### Scenario: Client sends manipulated shipping cost
- **WHEN** a client submits a payment intent request with `item.shipping.cost = 0` but the server-computed shipping cost is €5.00
- **THEN** the system SHALL create the payment intent using the server-computed €5.00 shipping cost, not the client's €0.00

#### Scenario: Client sends invalid shipping method ID
- **WHEN** a client submits a payment intent request with a non-existent shipping method ID
- **THEN** the system SHALL reject the request with a 400 Bad Request error

### Requirement: Payment amount verification at order confirmation

The `processOrderConfirmation` handler SHALL re-compute the expected order total from the database and compare it against the confirmed payment amount. If there is a significant discrepancy (beyond a ±1 cent tolerance for rounding), the system SHALL flag the order for manual review.

#### Scenario: Payment amount matches computed total
- **WHEN** a payment webhook confirms an amount that matches the server-computed order total (within ±1 cent)
- **THEN** the system SHALL proceed with normal order confirmation

#### Scenario: Payment amount significantly differs from computed total
- **WHEN** a payment webhook confirms an amount that differs by more than 1 cent from the server-computed total
- **THEN** the system SHALL log a security warning, flag the order for manual review, and still complete the confirmation (to avoid rejecting legitimate payments)

#### Scenario: Payment amount is zero or negative
- **WHEN** a payment webhook confirms an amount of 0 or less
- **THEN** the system SHALL reject the confirmation and log a security alert

### Requirement: Strict field filtering on mutation endpoints

All Zod validation schemas for POST, PUT, and PATCH endpoints SHALL use Zod's `.strip()` mode (or equivalent) to silently remove any fields not explicitly defined in the schema. This prevents clients from injecting unexpected fields such as `is_sold`, `stock`, `role`, `id`, or `created_at`.

#### Scenario: Client sends extra fields in order creation
- **WHEN** a client submits a placeOrder request with additional fields like `{ "is_sold": 0, "role": "admin" }` alongside valid order data
- **THEN** the system SHALL silently strip the unknown fields and process only the validated fields

#### Scenario: Client sends extra fields in product update
- **WHEN** a seller submits a product update request with additional fields like `{ "price": 100, "is_sold": 0 }` alongside valid update data
- **THEN** the system SHALL silently strip `is_sold` and process only the fields defined in the validation schema

#### Scenario: Client sends valid fields only
- **WHEN** a client submits a request with only the fields defined in the Zod schema
- **THEN** the system SHALL process the request normally with no stripping needed

### Requirement: Seller resource ownership enforcement

All seller endpoints SHALL verify that the authenticated user (`req.user.id`) owns the resource being modified by including `seller_id = ?` in the WHERE clause of UPDATE and DELETE queries. The system SHALL NOT accept seller IDs from the request body for authorization purposes.

#### Scenario: Seller updates their own product
- **WHEN** a seller sends a PUT request to update a product they own
- **THEN** the system SHALL verify `seller_id = req.user.id` in the database query and allow the update

#### Scenario: Seller attempts to update another seller's product
- **WHEN** a seller sends a PUT request to update a product owned by a different seller
- **THEN** the system SHALL return a 404 Not Found (not 403, to avoid revealing existence) because the WHERE clause with `seller_id = req.user.id` returns no rows

#### Scenario: Client sends seller_id in request body
- **WHEN** a client includes `seller_id` in the request body of a seller endpoint
- **THEN** the system SHALL ignore the body value and use `req.user.id` exclusively for ownership checks

### Requirement: Admin-only status field protection

Only admin-authenticated endpoints SHALL be able to modify sensitive status fields including `is_sold`, `stock`, `status`, `role`, and `is_visible`. Non-admin endpoints SHALL have these fields stripped from request bodies via Zod schemas.

#### Scenario: Non-admin user attempts to change product status
- **WHEN** a non-admin user sends a request that includes `is_sold` or `is_visible` in the body
- **THEN** the system SHALL strip these fields before processing (Zod `.strip()`)

#### Scenario: Admin updates product status
- **WHEN** an admin sends a request through an admin-only endpoint to update `is_sold` or `is_visible`
- **THEN** the system SHALL allow the update because admin schemas explicitly include these fields

### Requirement: Rate limiting on payment endpoints

Payment-related endpoints (`createPaymentIntent`, `createRevolutOrder`) SHALL use the `sensitiveLimiter` rate limiting tier to prevent abuse. The limiter SHALL restrict the number of payment creation requests per IP/user within a configured time window.

#### Scenario: Normal payment creation
- **WHEN** a user creates a payment intent within normal usage patterns
- **THEN** the system SHALL process the request and apply the standard sensitive rate limit

#### Scenario: Excessive payment creation attempts
- **WHEN** a user or IP exceeds the sensitive rate limit threshold for payment creation
- **THEN** the system SHALL return a 429 Too Many Requests response with a Retry-After header
