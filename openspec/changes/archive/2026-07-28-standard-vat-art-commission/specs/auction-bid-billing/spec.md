## MODIFIED Requirements

### Requirement: Admin can bill a bid to create an order
The system SHALL allow the admin to trigger a "Facturar" action on any bid of a finished auction. This action MUST create an `orders` record and an `art_order_items` record, charge the buyer's saved payment method via Stripe, and set the order status to `paid`.

The `commission_amount` MUST be computed from the **seller that owns the auctioned
product**, using that seller's `dealer_commission_art` (the billing query already
`JOIN`s `users`, so the column is selected alongside `seller_id`). It MUST NOT use
`config.payment.dealerCommissionArt`. The computation SHALL go through the shared
regime-aware helper (`api/utils/artCommission.js`): `art_rebu` keeps the flat
`amount × c` split; `standard_vat` grosses the gallery margin up by the platform
margin VAT (`commission_amount = amount − round2(amount × (1 − c) / (1 + c × V))`).

When the item is an art product, the `art_order_items` INSERT MUST snapshot
`vat_regime`, derived from the product owner's `tax_vat_art` via the shared
derivation helper (`10` → `'art_rebu'`, otherwise `'standard_vat'`). The billing
query SHALL select `tax_vat_art` alongside the commission column. The regime used
for the commission computation MUST be the same value snapshotted on the row.

#### Scenario: Successful billing of a winning bid
- **WHEN** the admin clicks "Facturar" on a bid for a finished auction
- **AND** the buyer has valid saved payment data in `auction_authorised_payment_data`
- **THEN** the system creates an `orders` record with buyer delivery/invoicing addresses mapped from `auction_buyers`
- **AND** creates an `art_order_items` record with `art_id` from the bid's `product_id` and `price_at_purchase` from the bid's `amount`
- **AND** computes `commission_amount` via the regime-aware helper from the auctioned product's seller's `dealer_commission_art` and derived regime
- **AND** snapshots `vat_regime` from the seller's `tax_vat_art`
- **AND** charges the buyer via Stripe using their saved payment method
- **AND** sets the order status to `paid`
- **AND** stores the Stripe payment intent ID in the order record
- **AND** displays a success notification to the admin

#### Scenario: Commission honors the product owner's rate
- **WHEN** the auctioned product's seller has `dealer_commission_art = 30` and `tax_vat_art = 10` AND the winning bid amount is `1000`
- **THEN** `commission_amount` SHALL be `300.00`

#### Scenario: Cooperative artist's winning bid stores the grossed-up commission
- **WHEN** the auctioned art product's seller has `dealer_commission_art = 25` and `tax_vat_art = 21` AND the winning bid amount is `337`
- **THEN** `commission_amount` SHALL be `96.86` and the created row SHALL have `vat_regime = 'standard_vat'`

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
