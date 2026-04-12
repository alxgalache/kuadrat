## MODIFIED Requirements

### Requirement: Order creation uses correct product type table
The system SHALL insert the order item into `art_order_items` when `draws.product_type` is `'art'` and into `other_order_items` when `draws.product_type` is `'other'`. The commission MUST be calculated using the correct config path and percentage-to-rate conversion.

#### Scenario: Art product draw billing
- **WHEN** a draw has `product_type = 'art'`
- **THEN** the billing flow inserts into `art_order_items` with `art_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, and `commission_amount = draws.price * (config.payment.dealerCommissionArt / 100)`

#### Scenario: Other product draw billing
- **WHEN** a draw has `product_type = 'other'`
- **THEN** the billing flow inserts into `other_order_items` with `other_id = draws.product_id`, `price_at_purchase = draws.price`, `shipping_cost = shippingCost`, and `commission_amount = draws.price * (config.payment.dealerCommissionOthers / 100)`
