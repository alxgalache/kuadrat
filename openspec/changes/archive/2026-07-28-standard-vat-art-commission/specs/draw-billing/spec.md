## MODIFIED Requirements

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
