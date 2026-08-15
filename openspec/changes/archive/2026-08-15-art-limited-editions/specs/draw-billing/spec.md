## MODIFIED Requirements

### Requirement: Admin can bill a draw participation
The system SHALL provide an endpoint `POST /api/admin/draws/:id/participations/:participationId/bill` that creates an order, charges the participant via Stripe off-session, and sends a purchase confirmation email. For draws over an `art` product, billing SHALL consume exactly one edition copy of the product atomically, and the number of billed participations per draw SHALL never exceed `draws.units`.

#### Scenario: Successful billing of a participation
- **WHEN** an admin sends `POST /api/admin/draws/:id/participations/:participationId/bill` with body `{ shippingCost: <number> }` and the participation has not been billed before
- **THEN** the system SHALL:
  1. Verify that the number of already-billed participations of this draw is below `draws.units`, rejecting with 409 otherwise
  2. For an `art` product, atomically consume one edition copy via the guarded increment (`UPDATE art SET editions_sold = editions_sold + 1, is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END WHERE id = ? AND editions_sold < edition_size`), rejecting with 409 when no copies remain (`rowsAffected = 0`)
  3. Create a new record in the `orders` table with buyer data from `draw_buyers`, payment data from `draw_authorised_payment_data`, and draw price from `draws`
  4. Create a record in `art_order_items` or `other_order_items` based on `draws.product_type`, including the draw price, shipping cost, and calculated commission
  5. Charge the participant off-session via Stripe using the stored `stripe_customer_id` and `stripe_payment_method_id`
  6. Update the order status based on the Stripe charge result
  7. Send a purchase confirmation email to the buyer via `sendPurchaseConfirmation()`
  8. Return 201 with the created order data

#### Scenario: Duplicate billing attempt
- **WHEN** an admin attempts to bill a participation that has already been billed (an order with `notes = 'draw_participation:<participationId>'` already exists)
- **THEN** the system returns a 409 Conflict error with message "Esta participación ya ha sido facturada"

#### Scenario: Billing rejected when units are exhausted
- **WHEN** an admin attempts to bill a participation of a draw whose number of billed participations already equals `draws.units`
- **THEN** the system returns a 409 Conflict error with an es-ES message indicating all draw units have been billed
- **AND** no order is created and no edition copy is consumed

#### Scenario: Billing rejected when the edition is sold out
- **WHEN** an admin attempts to bill a participation for an `art` product whose edition has no remaining copies (`editions_sold >= edition_size`)
- **THEN** the system returns a 409 Conflict error with an es-ES message indicating the edition is sold out
- **AND** no order is created

#### Scenario: Missing stripe_customer_id
- **WHEN** an admin attempts to bill a participation where `draw_authorised_payment_data.stripe_customer_id` is empty or null
- **THEN** the system returns a 400 error with message "No se encontraron los datos de pago necesarios para facturar"

#### Scenario: Stripe charge fails
- **WHEN** the Stripe off-session charge fails during billing
- **THEN** the system SHALL create the order with status `payment_failed` and return the order data with the failure status so the admin can see the failed state
- **AND** for an `art` product the edition copy consumed in step 2 SHALL be released via the guarded decrement, so a failed charge never leaves a phantom consumed copy

#### Scenario: Stripe charge requires action
- **WHEN** the Stripe off-session charge returns `requires_action` status
- **THEN** the system SHALL create the order with status `requires_action` and return the order data with that status
- **AND** the consumed edition copy SHALL remain reserved while the SCA flow completes
