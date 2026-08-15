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

### Requirement: Order creation uses correct product type table
The system SHALL insert the order item into `art_order_items` when `draws.product_type` is `'art'` and into `other_order_items` when `draws.product_type` is `'other'`. The commission MUST be calculated from the **seller that owns the drawn product**, using that seller's per-type commission column (`dealer_commission_art` for art, `dealer_commission_other` for other), divided by 100. The billing query already `JOIN`s `users`, so the column is selected alongside `seller_id`. It MUST NOT use `config.payment.dealerCommissionArt` / `dealerCommissionOthers`.

For `art` draws the `commission_amount` SHALL be computed via the shared
regime-aware helper (`api/utils/artCommission.js`), passing the regime derived
from the product owner's `tax_vat_art`: `art_rebu` keeps the flat
`draws.price × c` split; `standard_vat` grosses the gallery margin up by the
platform margin VAT
(`commission_amount = draws.price − round2(draws.price × (1 − c) / (1 + c × V))`).
`other` draws keep the flat split unchanged.

When inserting into `art_order_items`, the flow MUST snapshot `vat_regime`,
derived from the product owner's `tax_vat_art` via the shared derivation helper
(`10` → `'art_rebu'`, otherwise `'standard_vat'`). The billing query SHALL
select `tax_vat_art` alongside the commission columns. The regime used for the
commission computation MUST be the same value snapshotted on the row.
`other_order_items` carries no regime column (always standard).

#### Scenario: Art product draw billing
- **WHEN** a draw has `product_type = 'art'` and the product owner has `tax_vat_art = 10`
- **THEN** the billing flow inserts into `art_order_items` with `art_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, `commission_amount = draws.price * (sellerDealerCommissionArt / 100)` where the rate is the product owner's `dealer_commission_art`, and `vat_regime = 'art_rebu'`

#### Scenario: Cooperative artist's draw stores the grossed-up commission
- **WHEN** a draw has `product_type = 'art'`, `price = 337`, AND the product owner has `dealer_commission_art = 25` and `tax_vat_art = 21`
- **THEN** the billing flow SHALL store `commission_amount = 96.86` and `vat_regime = 'standard_vat'`

#### Scenario: Cooperative artist's drawn artwork snapshots standard regime
- **WHEN** a draw has `product_type = 'art'` AND the product owner's `tax_vat_art` is `21`
- **THEN** the created `art_order_items` row SHALL have `vat_regime = 'standard_vat'`

#### Scenario: Other product draw billing
- **WHEN** a draw has `product_type = 'other'`
- **THEN** the billing flow inserts into `other_order_items` with `other_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, and `commission_amount = draws.price * (sellerDealerCommissionOther / 100)` where the rate is the product owner's `dealer_commission_other`

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
