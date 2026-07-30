## MODIFIED Requirements

### Requirement: Commission calculation uses the product owner's rate
Every server-side computation of a sale's commission SHALL use the commission rate
configured on the **seller that owns the product**, selecting `dealer_commission_art`
for `art` products and `dealer_commission_other` for `other` products. The rate is
a whole percentage and SHALL be divided by 100 to obtain the multiplier. The system
SHALL NOT use `config.payment.dealerCommissionArt` / `dealerCommissionOthers` for
sale calculations.

This applies to the cart checkout (`ordersController`), auction bid billing
(`auctionAdminController`), draw billing (`drawAdminController`), and paid-event
host credit (`eventCreditScheduler`).

For **art** products the `commission_amount` SHALL be computed via the shared
regime-aware helper (`api/utils/artCommission.js`), passing the item's derived
`vat_regime`:
- `art_rebu` → `round2(price × c)` (unchanged flat split).
- `standard_vat` → `price − round2(price × (1 − c) / (1 + c × V))` where `V` is
  the platform margin VAT constant shared with `api/utils/vatCalculator.js`.

For **other** products (and events) the flat split `price × c` remains unchanged.

#### Scenario: Cart checkout with multiple sellers
- **WHEN** a cart contains an `art` product owned by seller A (whose `dealer_commission_art` is `25` and `tax_vat_art` is `10`) and an `other` product owned by seller B (whose `dealer_commission_other` is `10`)
- **THEN** the art item's `commission_amount` SHALL equal `price * 0.25` and the other item's `commission_amount` SHALL equal `price * 0.10`

#### Scenario: Seller-specific art rate is honored
- **WHEN** an art product is sold whose seller has `dealer_commission_art = 30` and `tax_vat_art = 10`
- **THEN** the stored `commission_amount` SHALL equal `price * 0.30`, regardless of any environment variable

#### Scenario: Cooperative artist's checkout stores the grossed-up commission
- **WHEN** a buyer checks out an art product priced `337` owned by a seller with `dealer_commission_art = 25` and `tax_vat_art = 21` (regime `standard_vat`)
- **THEN** the stored `commission_amount` SHALL be `96.86` and the item SHALL later credit the seller's wallet with `337 − 96.86 = 240.14`

#### Scenario: Mixed-regime cart splits per item
- **WHEN** a cart contains one art product from a REBU seller (`tax_vat_art = 10`) and one art product from a cooperative seller (`tax_vat_art = 21`), both priced `337` at commission `25`
- **THEN** the REBU item SHALL store `commission_amount = 84.25` and the cooperative item SHALL store `commission_amount = 96.86`

#### Scenario: Commission amount is frozen at sale time
- **WHEN** a sale has been recorded and the seller's `dealer_commission_art` (or `tax_vat_art`) is later changed
- **THEN** the already-stored `commission_amount` of the past sale SHALL remain unchanged
