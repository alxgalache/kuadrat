## MODIFIED Requirements

### Requirement: Admin can bill a bid to create an order
The system SHALL allow the admin to trigger a "Facturar" action on any bid of a finished auction. This action MUST create an `orders` record and an `art_order_items` record, charge the buyer's saved payment method via Stripe, and set the order status to `paid`.

The `commission_amount` MUST be computed from the **seller that owns the auctioned
product**, using that seller's `dealer_commission_art` (the billing query already
`JOIN`s `users`, so the column is selected alongside `seller_id`). It MUST NOT use
`config.payment.dealerCommissionArt`.

#### Scenario: Successful billing of a winning bid
- **WHEN** the admin clicks "Facturar" on a bid for a finished auction
- **AND** the buyer has valid saved payment data in `auction_authorised_payment_data`
- **THEN** the system creates an `orders` record with buyer delivery/invoicing addresses mapped from `auction_buyers`
- **AND** creates an `art_order_items` record with `art_id` from the bid's `product_id` and `price_at_purchase` from the bid's `amount`
- **AND** computes `commission_amount` as `amount * (sellerDealerCommissionArt / 100)`, where the rate is the auctioned product's seller's `dealer_commission_art`
- **AND** charges the buyer via Stripe using their saved payment method
- **AND** sets the order status to `paid`
- **AND** stores the Stripe payment intent ID in the order record
- **AND** displays a success notification to the admin

#### Scenario: Commission honors the product owner's rate
- **WHEN** the auctioned product's seller has `dealer_commission_art = 30` AND the winning bid amount is `1000`
- **THEN** `commission_amount` SHALL be `300.00`

#### Scenario: Billing a bid that was already billed
- **WHEN** the admin clicks "Facturar" on a bid that has already been billed
- **THEN** the system rejects the action with an error "Esta puja ya ha sido facturada"
- **AND** does not create a duplicate order
