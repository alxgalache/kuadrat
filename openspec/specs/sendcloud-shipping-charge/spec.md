# sendcloud-shipping-charge

## Purpose

The money half of the Sendcloud store flow: making the buyer actually pay the shipping option they chose, charging the price the server re-quotes rather than the one the browser reports, and recording on the order exactly the figure that was charged.

A Sendcloud selection lives in `shippingSelections`, a state parallel to the cart item, so `item.shipping` is `null` for such items and every mechanism keyed on it — `verifyShippingCosts`, `computeShippingTotal` — skipped them silently. This capability covers the field that carries the selection to the payment endpoints, the server-side re-quote that prices it, the machine-coded rejections when the option or its price has moved, and the per-seller-group recording that keeps `orders.total_price` equal to the amount charged.

## Requirements

### Requirement: The buyer pays the Sendcloud shipping they selected

The amount charged for an order SHALL include the shipping cost of every Sendcloud-quoted seller group in the cart. A Sendcloud selection lives in a state parallel to the cart item (`shippingSelections`, keyed by seller) and SHALL therefore be sent to the payment endpoints as its own field rather than inferred from `item.shipping`, which is `null` for such items.

#### Scenario: Selections travel to the payment endpoints
- **WHEN** the buyer proceeds to payment with a cart containing Sendcloud-quoted store products
- **THEN** the request to `POST /api/payments/stripe/create-intent`, to the Revolut order initialisation and to `POST /api/orders` SHALL carry `shippingSelections: [{ sellerId, shippingOptionCode, servicePointId, cost }]`

#### Scenario: Shipping is included in the charged amount
- **WHEN** a cart holds 2 units of a 20 € store product whose selected option is verified at 4.57 €
- **THEN** the PaymentIntent amount SHALL be 4457 minor units, not 4000

#### Scenario: A Sendcloud seller group with no selection blocks payment
- **WHEN** the cart contains a Sendcloud-quoted seller group for which no shipping option was selected
- **THEN** the endpoint SHALL reject the request with HTTP 400 and the machine code `SHIPPING_SELECTION_REQUIRED` in `title`

#### Scenario: Pickup selections cost nothing and need no address
- **WHEN** the buyer selects "Recogida en persona" for a seller group
- **THEN** that group SHALL contribute 0 to the shipping total and SHALL NOT require a delivery address, since pickup is seller-wide

### Requirement: The charged shipping price is re-quoted server-side

The price charged for a Sendcloud shipping option SHALL be obtained by re-quoting Sendcloud on the server with the same items and the order's delivery address, never taken from the client. The client-supplied `cost` SHALL be used only to detect that the price has moved since it was shown.

#### Scenario: The charged price is the freshly quoted one
- **WHEN** the payment endpoint verifies a seller group's selection
- **THEN** it SHALL call `POST /v3/shipping-options` with the same parcels the quoting endpoint would build, locate the chosen `shippingOptionCode` in the result, and use that option's price as the amount to charge

#### Scenario: An option that no longer exists is rejected
- **WHEN** the chosen `shippingOptionCode` is absent from the fresh quote
- **THEN** the endpoint SHALL reject with HTTP 400 and the machine code `SHIPPING_METHOD_UNAVAILABLE`

#### Scenario: A price that has moved is rejected rather than silently charged
- **WHEN** the freshly quoted price differs from the `cost` the client displayed
- **THEN** the endpoint SHALL reject with HTTP 400 and the machine code `SHIPPING_COST_OUTDATED`, so the buyer is never charged an amount other than the one shown

#### Scenario: Money compared in integer cents
- **WHEN** the displayed cost is compared against the re-quoted price
- **THEN** both SHALL be converted to integer cents before comparison, never compared with a floating-point tolerance such as `Math.abs(a - b) > 0.01`

#### Scenario: The destination is the order's delivery address
- **WHEN** the re-quote is built
- **THEN** it SHALL use the delivery address of the order being paid, never a postal code captured by the cart when the product was added, and SHALL reject with `SHIPPING_ADDRESS_REQUIRED` when a delivery group arrives without one

#### Scenario: Machine codes carry es-ES copy on the client
- **WHEN** any of these rejections reaches the cart drawer
- **THEN** the drawer SHALL render the corresponding message from `SHIPPING_VERIFICATION_ERRORS` in `client/lib/constants.js`, following the existing pattern

### Requirement: What is recorded equals what was charged

The shipping cost stored on an order SHALL be the same figure that was charged, obtained from the payment intent rather than from a second quote, and SHALL be recorded once per seller group rather than once per item row.

#### Scenario: Verified amounts are carried on the payment intent
- **WHEN** `create-intent` verifies the per-seller shipping costs
- **THEN** it SHALL store them compactly in the PaymentIntent metadata as `[{ s: <sellerId>, c: <cents> }]`

#### Scenario: Order creation reads back rather than re-quotes
- **WHEN** `placeOrder` persists a Stripe-paid order
- **THEN** it SHALL retrieve the PaymentIntent and read the per-seller shipping costs from its metadata, and SHALL NOT call Sendcloud again, so the recorded figure cannot drift from the charged one

#### Scenario: Missing metadata degrades to re-quoting rather than failing
- **WHEN** the PaymentIntent carries no such metadata, or retrieving it fails
- **THEN** `placeOrder` SHALL log a warning and re-verify the selections, rather than rejecting an order whose payment has already been taken

#### Scenario: Cost recorded once per seller group
- **WHEN** an order contains 2 units of one store product from a seller whose verified shipping is 4.57 €
- **THEN** the item row with the lowest id in that seller's group SHALL carry `shipping_cost = 4.57` and every other row of the group SHALL carry `shipping_cost = 0`

#### Scenario: Order total matches the charged amount
- **WHEN** the same order is persisted
- **THEN** `orders.total_price` SHALL be 44.57 €, equal to the charged amount, rather than the 49.14 € that summing a duplicated per-row shipping cost produced

#### Scenario: Existing aggregations remain correct untouched
- **WHEN** any of the existing queries that compute `sum + item.price_at_purchase + (item.shipping_cost || 0)` runs over such an order
- **THEN** it SHALL yield the charged total, without those queries being modified and without any new column being added to `orders`

#### Scenario: Legacy and art items keep per-item shipping
- **WHEN** an order contains items priced by the legacy zone resolver, or art items
- **THEN** each of those rows SHALL keep carrying its own shipping cost as before, since that flow genuinely prices per item

#### Scenario: Revolut path re-verifies
- **WHEN** an order is paid through the legacy Revolut provider, which offers no equivalent metadata channel
- **THEN** `placeOrder` SHALL re-verify the selections with the same server-side re-quote before persisting them
