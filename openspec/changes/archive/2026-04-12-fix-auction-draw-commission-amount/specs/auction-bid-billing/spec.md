## MODIFIED Requirements

### Requirement: Admin can bill a bid to create an order
The system SHALL allow the admin to trigger a "Facturar" action on any bid of a finished auction. This action MUST create an `orders` record and an `art_order_items` record, charge the buyer's saved payment method via Stripe, and set the order status to `paid`.

#### Scenario: Successful billing of a winning bid
- **WHEN** the admin clicks "Facturar" on a bid for a finished auction
- **AND** the buyer has valid saved payment data in `auction_authorised_payment_data`
- **THEN** the system creates an `orders` record with buyer delivery/invoicing addresses mapped from `auction_buyers`
- **AND** creates an `art_order_items` record with `art_id` from the bid's `product_id` and `price_at_purchase` from the bid's `amount`
- **AND** computes `commission_amount` as `amount * (DEALER_COMMISSION_ART / 100)`, reading the value from `config.payment.dealerCommissionArt`
- **AND** charges the buyer via Stripe using their saved payment method
- **AND** sets the order status to `paid`
- **AND** stores the Stripe payment intent ID in the order record
- **AND** displays a success notification to the admin

#### Scenario: Billing a bid that was already billed
- **WHEN** the admin clicks "Facturar" on a bid that has already been billed
- **THEN** the system rejects the action with an error "Esta puja ya ha sido facturada"
- **AND** does not create a duplicate order

#### Scenario: Stripe charge failure during billing
- **WHEN** the admin clicks "Facturar" on a bid
- **AND** the Stripe charge fails (e.g., card declined, payment method expired)
- **THEN** the system does not create a `paid` order
- **AND** displays an error notification to the admin with the Stripe error message

#### Scenario: Billing attempted on non-finished auction
- **WHEN** the admin attempts to bill a bid for an auction that is not in `finished` status
- **THEN** the system rejects the action with an error "La subasta debe estar finalizada para facturar"
