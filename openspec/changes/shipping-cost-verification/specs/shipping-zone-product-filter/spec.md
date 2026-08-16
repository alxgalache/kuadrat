## MODIFIED Requirements

### Requirement: Product-specific shipping zone filtering for buyers
The `getAvailableShipping` endpoint SHALL filter shipping zones by product. Zones with a `product_id` that does not match the requested product SHALL be excluded. Zones with a matching `product_id` and `product_type` SHALL be included. Zones with `product_id = NULL` (generic) SHALL be included unless overridden by a product-specific zone.

This filtering SHALL be performed by the shared resolver in `api/services/shipping/zoneResolver.js` rather than by logic local to the endpoint, and it SHALL therefore apply identically wherever a zone cost is resolved — including the server-side verification of shipping costs at payment time, which previously ignored it.

#### Scenario: Only generic zones exist
- **WHEN** buyer requests shipping for product id=10 type='art' and all matching zones have product_id=NULL
- **THEN** all matching generic zones are returned (existing behavior preserved)

#### Scenario: Product-specific zone exists for the product
- **WHEN** buyer requests shipping for product id=10 type='art' and a zone exists with product_id=10, product_type='art' for the same method
- **THEN** the product-specific zone is returned and generic zones for that method are excluded

#### Scenario: Product-specific zone exists for a different product
- **WHEN** buyer requests shipping for product id=10 type='art' and a zone exists with product_id=20, product_type='art' for the same method (and no zone for product id=10)
- **THEN** the zone for product id=20 is excluded; generic zones for that method are returned

#### Scenario: Mixed zones — specific and generic for same method
- **WHEN** buyer requests shipping for product id=10 type='art' and a method has both a zone with product_id=10 and a zone with product_id=NULL
- **THEN** only the product-specific zone (product_id=10) is used for that method; the generic zone is excluded

#### Scenario: Applies to pickup methods
- **WHEN** buyer requests shipping and a pickup method has a zone with product_id=10, product_type='art'
- **THEN** the product filter and priority logic apply to pickup methods the same as delivery methods

#### Scenario: Applies to delivery methods
- **WHEN** buyer requests shipping and a delivery method has a zone with product_id=10, product_type='art'
- **THEN** the product filter and priority logic apply to delivery methods

#### Scenario: The same filter applies when verifying the cost at payment
- **WHEN** the server verifies a cart item's shipping cost during payment initialisation and the artwork has a product-specific zone for the chosen method
- **THEN** the verification SHALL compare against the product-specific zone's cost, not against a generic zone or a zone belonging to another product

#### Scenario: Cheapest candidate wins within a method
- **WHEN** several zones of the same method and the same priority tier apply to the product and destination
- **THEN** the cheapest SHALL be used, both when quoting the buyer and when verifying the cost, since that is the price the buyer was shown
