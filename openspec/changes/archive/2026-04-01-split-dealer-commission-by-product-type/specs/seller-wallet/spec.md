## MODIFIED Requirements

### Requirement: Commission rate exposure
The system SHALL expose the dealer commission percentages to the frontend via two environment variables: `NEXT_PUBLIC_DEALER_COMMISSION_ART` (for art products) and `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` (for other products), each defaulting to `15` if not set.

#### Scenario: Commission displayed from environment variables
- **WHEN** a seller views the Monedero section
- **THEN** the commission text SHALL display both rates: "Se aplica una comisión del {art}% en obras de arte y del {others}% en otros productos sobre el total de las transacciones realizadas."

#### Scenario: Default commission when variables are not set
- **WHEN** `NEXT_PUBLIC_DEALER_COMMISSION_ART` or `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` are not defined in the environment
- **THEN** the system SHALL use `15` as the default for each undefined variable

#### Scenario: Wallet endpoint returns two commission rates
- **WHEN** an authenticated seller requests `GET /api/seller/wallet`
- **THEN** the response SHALL include `commissionRateArt` and `commissionRateOthers` as separate fields instead of `commissionRate`

## ADDED Requirements

### Requirement: Product-type-specific commission calculation
The system SHALL apply different commission rates when creating order items: `DEALER_COMMISSION_ART` for art products and `DEALER_COMMISSION_OTHERS` for other products. The `commission_amount` stored per item SHALL reflect the rate corresponding to its product type.

#### Scenario: Art item commission uses art rate
- **WHEN** an order is created containing an art product priced at 100.00 and `DEALER_COMMISSION_ART` is set to `15`
- **THEN** the `commission_amount` in `art_order_items` SHALL be `15.00`

#### Scenario: Others item commission uses others rate
- **WHEN** an order is created containing an 'others' product priced at 100.00 and `DEALER_COMMISSION_OTHERS` is set to `10`
- **THEN** the `commission_amount` in `other_order_items` SHALL be `10.00`

#### Scenario: Mixed order applies correct rates
- **WHEN** an order contains both an art product (price 200.00, art commission 15%) and an 'others' product (price 50.00, others commission 10%)
- **THEN** the art item's `commission_amount` SHALL be `30.00` and the others item's `commission_amount` SHALL be `5.00`

### Requirement: Auto-confirmation deducts commission from seller credit
The `confirmationScheduler` SHALL deduct `commission_amount` from `price_at_purchase` when crediting a seller's `available_withdrawal` upon auto-confirmation. The scheduler queries MUST select `commission_amount` from the order item tables.

#### Scenario: Auto-confirmed art item credits seller after commission
- **WHEN** an art order item with `price_at_purchase = 100.00` and `commission_amount = 15.00` is auto-confirmed
- **THEN** the seller's `available_withdrawal` SHALL increase by `85.00`

#### Scenario: Auto-confirmed others item credits seller after commission
- **WHEN** an other order item with `price_at_purchase = 50.00` and `commission_amount = 5.00` is auto-confirmed
- **THEN** the seller's `available_withdrawal` SHALL increase by `45.00`
