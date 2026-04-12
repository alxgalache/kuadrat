## ADDED Requirements

### Requirement: Admin can list draw participations
The system SHALL provide an endpoint `GET /api/admin/draws/:id/participations` that returns all participations for a given draw, including buyer personal data, delivery/invoicing addresses, and authorized payment data.

#### Scenario: List participations for a finished draw
- **WHEN** an admin sends `GET /api/admin/draws/:id/participations` for a draw with status `finished`
- **THEN** the system returns an array of participation records, each containing: participation ID, buyer first name, buyer last name, buyer email, buyer DNI, delivery address fields, invoicing address fields, stripe_customer_id, stripe_payment_method_id, last_four, and participation created_at

#### Scenario: List participations for a non-finished draw
- **WHEN** an admin sends `GET /api/admin/draws/:id/participations` for a draw with status other than `finished`
- **THEN** the system returns a 400 error with message "El sorteo debe estar finalizado para ver las participaciones"

### Requirement: Admin can bill a draw participation
The system SHALL provide an endpoint `POST /api/admin/draws/:id/participations/:participationId/bill` that creates an order, charges the participant via Stripe off-session, and sends a purchase confirmation email.

#### Scenario: Successful billing of a participation
- **WHEN** an admin sends `POST /api/admin/draws/:id/participations/:participationId/bill` with body `{ shippingCost: <number> }` and the participation has not been billed before
- **THEN** the system SHALL:
  1. Create a new record in the `orders` table with buyer data from `draw_buyers`, payment data from `draw_authorised_payment_data`, and draw price from `draws`
  2. Create a record in `art_order_items` or `other_order_items` based on `draws.product_type`, including the draw price, shipping cost, and calculated commission
  3. Charge the participant off-session via Stripe using the stored `stripe_customer_id` and `stripe_payment_method_id`
  4. Update the order status based on the Stripe charge result
  5. Send a purchase confirmation email to the buyer via `sendPurchaseConfirmation()`
  6. Return 201 with the created order data

#### Scenario: Duplicate billing attempt
- **WHEN** an admin attempts to bill a participation that has already been billed (an order with `notes = 'draw_participation:<participationId>'` already exists)
- **THEN** the system returns a 409 Conflict error with message "Esta participación ya ha sido facturada"

#### Scenario: Missing stripe_customer_id
- **WHEN** an admin attempts to bill a participation where `draw_authorised_payment_data.stripe_customer_id` is empty or null
- **THEN** the system returns a 400 error with message "No se encontraron los datos de pago necesarios para facturar"

#### Scenario: Stripe charge fails
- **WHEN** the Stripe off-session charge fails during billing
- **THEN** the system SHALL create the order with status `payment_failed` and return the order data with the failure status so the admin can see the failed state

#### Scenario: Stripe charge requires action
- **WHEN** the Stripe off-session charge returns `requires_action` status
- **THEN** the system SHALL create the order with status `requires_action` and return the order data with that status

### Requirement: Order creation uses correct product type table
The system SHALL insert the order item into `art_order_items` when `draws.product_type` is `'art'` and into `other_order_items` when `draws.product_type` is `'other'`.

#### Scenario: Art product draw billing
- **WHEN** a draw has `product_type = 'art'`
- **THEN** the billing flow inserts into `art_order_items` with `art_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, and `commission_amount = draws.price × dealerCommissionArt`

#### Scenario: Other product draw billing
- **WHEN** a draw has `product_type = 'other'`
- **THEN** the billing flow inserts into `other_order_items` with `other_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, and `commission_amount = draws.price × dealerCommissionOthers`

### Requirement: Billing idempotency
The system SHALL use `orders.notes` with value `'draw_participation:<participationId>'` as the idempotency marker. Before creating any order, the system MUST check that no order with that notes value exists.

#### Scenario: Idempotency check prevents duplicate order
- **WHEN** the billing endpoint is called for a participation and an order with `notes = 'draw_participation:<participationId>'` already exists
- **THEN** the system returns 409 and does NOT create a new order, charge, or email

### Requirement: Admin UI shows participations and billing controls
The admin draw detail page SHALL display a table of participations when the draw status is `finished`, with a "Facturar" button per row. Clicking "Facturar" opens a modal to input shipping cost before confirming the billing action.

#### Scenario: Admin views participations table
- **WHEN** an admin views the detail page of a finished draw
- **THEN** the page displays a table with columns: participant name, email, DNI, payment method last four digits, participation date, and an action column with a "Facturar" button

#### Scenario: Admin clicks Facturar
- **WHEN** an admin clicks "Facturar" on a participation row
- **THEN** a modal appears with an input field for "Gastos de envío" and a "Confirmar facturación" button

#### Scenario: Admin confirms billing
- **WHEN** an admin enters a shipping cost and confirms billing in the modal
- **THEN** the system calls `POST /api/admin/draws/:id/participations/:participationId/bill` with the shipping cost and shows a success notification upon completion

#### Scenario: Already billed participation
- **WHEN** a participation has already been billed (order exists)
- **THEN** the "Facturar" button is disabled or replaced with a "Facturado" indicator showing the order status
