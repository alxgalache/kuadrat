# shipping-zone-resolution

## Purpose

The single answer to "which legacy shipping zone applies to this product, shipped to this address". `api/services/shipping/zoneResolver.js` owns the zone query, the product-specific priority rule and the weight/dimension fit filter, and every consumer — the buyer's quote, the server-side cost verification at payment, and the legacy shipping provider — obtains its costs from it rather than querying `shipping_zones` on its own.

A tariff needs three coordinates together — the product, the method and the destination — and dropping any one of them selects an arbitrary row among many with different prices. The verification at payment previously matched on `shipping_method_id + seller_id` alone; once the shipping calculator started sharing one `shipping_methods` row across every artwork and every zone group, that predicate matched rows with six different costs and every art checkout returned 400.

Also covers what the destination is (the order's delivery address, never the postal code the cart captured at add-to-cart), the three product-type vocabularies the path speaks, and the machine-readable codes a rejection carries.

## Requirements

### Requirement: A single resolver decides which shipping zone applies

There SHALL be exactly one implementation of "which legacy shipping zone applies to this product, for this destination", living in `api/services/shipping/zoneResolver.js`. It SHALL own the zone query, the product-specific priority rule, and the weight/dimension fit filter. Every consumer — the buyer-facing quote, the server-side cost verification at payment, and the legacy shipping provider — SHALL obtain its costs from that resolver and SHALL NOT query `shipping_zones` for pricing on its own.

#### Scenario: Buyer quote goes through the resolver
- **WHEN** a buyer requests shipping options for a product via `GET /api/shipping/available`
- **THEN** the returned costs SHALL come from the resolver, and `getAvailableShipping` SHALL only validate parameters and shape the HTTP response

#### Scenario: Payment verification goes through the resolver
- **WHEN** the server verifies the shipping cost of a cart item during `POST /api/payments/stripe/create-intent`
- **THEN** it SHALL call the resolver and look up the buyer's chosen method in the returned options, and SHALL NOT execute its own `shipping_zones` query

#### Scenario: Legacy provider goes through the resolver
- **WHEN** `legacyProvider.getDeliveryOptions` builds delivery options
- **THEN** it SHALL take the applicable zones from the resolver and SHALL retain only its own concern, the per-parcel multiplication `ceil(units / max_articles) × cost`

#### Scenario: Quote and verification cannot diverge
- **WHEN** the same `(productId, productType, methodId, country, postalCode)` is resolved for a quote and for a payment verification
- **THEN** both SHALL yield the same cost, because both are the same call — not two queries that agree

### Requirement: A shipping tariff is identified by product, method and destination

The resolver SHALL identify the applicable zone using three coordinates together: the product (`product_id` + `product_type`), the shipping method, and the destination (`country` + `postalCode`). Resolving with fewer coordinates SHALL be treated as a defect, because a single `shipping_method_id` is shared across artworks and across zone groups.

#### Scenario: Same method, different zone groups of one artwork
- **WHEN** one artwork has zones for the same shipping method in `peninsula` at 15,29 € and in `canarias` at 27,91 €
- **THEN** a buyer with a peninsular postal code SHALL be verified against 15,29 € and a buyer with a Canary postal code against 27,91 €

#### Scenario: Same method, different artworks
- **WHEN** two artworks of the same seller offer the same shipping method at different costs
- **THEN** each artwork's checkout SHALL be verified against its own artwork's cost

#### Scenario: Cost belonging to another zone group is rejected
- **WHEN** a buyer shipping to a peninsular address submits the cost of that artwork's Canary zone
- **THEN** the request SHALL be rejected

#### Scenario: Cost belonging to another artwork is rejected
- **WHEN** a buyer submits a cost that is valid for a different artwork sharing the same shipping method
- **THEN** the request SHALL be rejected

#### Scenario: Arbitrary row selection is a defect
- **WHEN** an implementation selects a zone filtering only by `shipping_method_id` and `seller_id`
- **THEN** this SHALL be treated as a defect, since that predicate matches every zone group of every artwork sharing the method

### Requirement: The resolver translates between the three product-type vocabularies

Three different vocabularies describe the same thing in this code path: `shipping_methods.article_type` uses `'art' | 'others' | 'all'`, `shipping_zones.product_type` uses `'art' | 'other'`, and cart/payment items use `'art' | 'other'`. The resolver SHALL accept one canonical vocabulary — the cart's `'art' | 'other'` — and translate internally to each database vocabulary. Public HTTP contracts SHALL keep their current vocabulary and translate at the edge.

#### Scenario: Store product matches its methods
- **WHEN** the resolver is called with `productType: 'other'`
- **THEN** it SHALL match `shipping_methods.article_type` against `'others'` and `shipping_zones.product_type` against `'other'`

#### Scenario: Artwork matches its methods
- **WHEN** the resolver is called with `productType: 'art'`
- **THEN** it SHALL match both `shipping_methods.article_type` and `shipping_zones.product_type` against `'art'`

#### Scenario: Public endpoint keeps its vocabulary
- **WHEN** a client calls `GET /api/shipping/available?productType=others`
- **THEN** the endpoint SHALL keep accepting `'art' | 'others'` and translate to the canonical vocabulary before calling the resolver

#### Scenario: Untranslated vocabulary is a defect
- **WHEN** `'other'` is compared against `shipping_methods.article_type`
- **THEN** every method whose `article_type` is not `'all'` SHALL disappear from the result, and this SHALL be treated as a defect

### Requirement: Shipping cost is verified against the order's real delivery address

The server SHALL verify each item's shipping cost against the delivery address of the order being paid, not against the postal code the cart captured when the product was added. `POST /api/payments/stripe/create-intent` and `POST /api/payments/revolut/init-order` SHALL accept a `deliveryAddress` with `country` and `postalCode`.

#### Scenario: Cost is resolved for the address being shipped to
- **WHEN** a buyer added a product to the cart quoting a peninsular postal code and then enters a Canary delivery address
- **THEN** the cost SHALL be resolved for the Canary address, and the peninsular cost SHALL be rejected

#### Scenario: Client-side postal code cannot set the price
- **WHEN** a request carries an `item.shipping.deliveryPostalCode` that differs from the order's delivery address
- **THEN** the stored value SHALL be ignored for pricing, and only the order's delivery address SHALL determine the applicable zone

#### Scenario: Missing address with a delivery method is rejected
- **WHEN** any item carries a shipping method of type `delivery` and the request has no `deliveryAddress`
- **THEN** the request SHALL be rejected with `title` `SHIPPING_ADDRESS_REQUIRED`, and SHALL NOT fall back to the postal code stored in the cart item

#### Scenario: Pickup-only cart needs no address
- **WHEN** every item's shipping method is of type `pickup`
- **THEN** the request SHALL be accepted without a `deliveryAddress`, since pickup zones are seller-wide and carry no geographic filter

#### Scenario: Zone id is never accepted from the client
- **WHEN** a request contains a zone identifier
- **THEN** it SHALL be ignored, because letting the client choose the priced row is the hole this verification closes

### Requirement: Shipping verification failures are distinguishable and actionable

A rejected shipping cost SHALL carry a machine-readable code in `title` and an es-ES explanation in `message` describing an action that actually resolves the situation.

#### Scenario: Method no longer applies
- **WHEN** the buyer's chosen method is absent from the resolver's options for that product and destination
- **THEN** the response SHALL carry `title` `SHIPPING_METHOD_UNAVAILABLE` and tell the buyer to select shipping again

#### Scenario: Price has changed since the product was added to the cart
- **WHEN** the chosen method applies but its resolved cost differs from the submitted cost by more than 0,01 €
- **THEN** the response SHALL carry `title` `SHIPPING_COST_OUTDATED` and tell the buyer to remove the product from the cart and add it again

#### Scenario: Recalculating an artwork invalidates existing carts
- **WHEN** an admin regenerates an artwork's zones in the shipping calculator while buyers hold that artwork in their carts
- **THEN** those carts SHALL fail with `SHIPPING_COST_OUTDATED` and an instruction that resolves it, rather than an instruction to reload the page, which does not clear a cart held in `localStorage`

#### Scenario: Floating point tolerance is preserved
- **WHEN** the submitted cost differs from the resolved cost by 0,01 € or less
- **THEN** the cost SHALL be accepted

### Requirement: Sendcloud-quoted items are not subject to legacy zone verification

Items whose shipping is quoted live against Sendcloud reach payment with no shipping method recorded on the cart item. They SHALL continue to be skipped by legacy zone verification.

#### Scenario: Store item with Sendcloud shipping is skipped
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is true and a store product reaches `create-intent` with `shipping: null`
- **THEN** legacy zone verification SHALL skip the item, leaving the Sendcloud shipping step unchanged

#### Scenario: Store item with legacy shipping is verified
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is false and a store product reaches `create-intent` with a legacy shipping method selected
- **THEN** the item SHALL be verified through the resolver like any artwork

### Requirement: The resolver loads the product itself

The resolver SHALL load the product row — seller, weight, dimensions and visibility — from `art` or `others` itself, rather than accepting a seller id from its caller.

#### Scenario: Seller cannot be spoofed by the caller
- **WHEN** the resolver is called with a product id
- **THEN** the seller used for the zone lookup SHALL be the product's own `seller_id`

#### Scenario: Hidden product has no shipping
- **WHEN** a product is not `visible = 1`
- **THEN** the resolver SHALL return no options, and a payment for it SHALL be rejected

#### Scenario: Product that does not fit a method is excluded
- **WHEN** a product's weight or dimensions exceed a method's `max_weight` or `max_dimensions`
- **THEN** that method SHALL be absent from the resolver's options, both for the buyer's quote and for verification
