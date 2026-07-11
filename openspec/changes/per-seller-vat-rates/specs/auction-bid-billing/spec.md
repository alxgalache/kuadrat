# auction-bid-billing (MODIFIED)

## MODIFIED Requirements

### Requirement: Admin can bill a bid to create an order
The system SHALL allow the admin to trigger a "Facturar" action on any bid of a finished auction. This action MUST create an `orders` record and an `art_order_items` record, charge the buyer's saved payment method via Stripe, and set the order status to `paid`.

The `commission_amount` MUST be computed from the **seller that owns the auctioned
product**, using that seller's `dealer_commission_art` (the billing query already
`JOIN`s `users`, so the column is selected alongside `seller_id`). It MUST NOT use
`config.payment.dealerCommissionArt`.

When the item is an art product, the `art_order_items` INSERT MUST snapshot
`vat_regime`, derived from the product owner's `tax_vat_art` via the shared
derivation helper (`10` → `'art_rebu'`, otherwise `'standard_vat'`). The billing
query SHALL select `tax_vat_art` alongside the commission column.

#### Scenario: Successful billing of a winning bid
- **WHEN** the admin clicks "Facturar" on a bid for a finished auction
- **AND** the buyer has valid saved payment data in `auction_authorised_payment_data`
- **THEN** the system creates an `orders` record with buyer delivery/invoicing addresses mapped from `auction_buyers`
- **AND** creates an `art_order_items` record with `art_id` from the bid's `product_id` and `price_at_purchase` from the bid's `amount`
- **AND** computes `commission_amount` as `amount * (sellerDealerCommissionArt / 100)`, where the rate is the auctioned product's seller's `dealer_commission_art`
- **AND** snapshots `vat_regime` from the seller's `tax_vat_art`
- **AND** charges the buyer via Stripe using their saved payment method
- **AND** sets the order status to `paid`
- **AND** stores the Stripe payment intent ID in the order record
- **AND** displays a success notification to the admin

#### Scenario: Commission honors the product owner's rate
- **WHEN** the auctioned product's seller has `dealer_commission_art = 30` AND the winning bid amount is `1000`
- **THEN** `commission_amount` SHALL be `300.00`

#### Scenario: Cooperative artist's auctioned artwork snapshots standard regime
- **WHEN** the auctioned art product's seller has `tax_vat_art = 21`
- **THEN** the created `art_order_items` row SHALL have `vat_regime = 'standard_vat'`

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

### Requirement: Billed auction orders integrate with seller payout pipeline
The orders created from auction billing MUST follow the standard order lifecycle. When an `art_order_items` status changes to `confirmed`, the seller's wallet bucket matching the item's snapshotted `vat_regime` (`available_withdrawal_art_rebu` for `'art_rebu'`, `available_withdrawal_standard_vat` for `'standard_vat'`) SHALL be credited with `price_at_purchase - commission_amount`.

#### Scenario: Auction order item confirmed triggers payout credit
- **WHEN** a seller confirms an art_order_item that was created from an auction bid with `vat_regime = 'art_rebu'`
- **THEN** the system credits the seller's `available_withdrawal_art_rebu` with `price_at_purchase - commission_amount`
- **AND** the seller can include this amount in their next payout request

#### Scenario: Cooperative artist's auction earning credits the standard bucket
- **WHEN** an art_order_item created from an auction bid with `vat_regime = 'standard_vat'` is confirmed
- **THEN** the system credits the seller's `available_withdrawal_standard_vat` with `price_at_purchase - commission_amount`
