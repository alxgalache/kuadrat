## ADDED Requirements

### Requirement: Shipping zone stores optional product reference
The `shipping_zones` table SHALL include two nullable columns: `product_id` (INTEGER) and `product_type` (TEXT with CHECK constraint limiting values to 'art' or 'other'). Both columns MUST be NULL when no product is assigned. Both columns MUST be non-NULL when a product is assigned.

#### Scenario: Zone created without product
- **WHEN** admin creates a shipping zone without selecting a product
- **THEN** the zone is saved with `product_id = NULL` and `product_type = NULL`

#### Scenario: Zone created with product
- **WHEN** admin creates a shipping zone and selects a product of type 'art' with id 42
- **THEN** the zone is saved with `product_id = 42` and `product_type = 'art'`

#### Scenario: Zone updated to add product
- **WHEN** admin edits an existing zone that has no product and selects a product of type 'other' with id 7
- **THEN** the zone is updated with `product_id = 7` and `product_type = 'other'`

#### Scenario: Zone updated to remove product
- **WHEN** admin edits an existing zone that has a product and clears the product selection
- **THEN** the zone is updated with `product_id = NULL` and `product_type = NULL`

### Requirement: Admin zone list displays product name
The admin GET zones endpoint SHALL return `product_name`, `product_id`, and `product_type` for each zone. When a zone has a product assigned, `product_name` SHALL be resolved from the corresponding table (art or others) based on `product_type`.

#### Scenario: Zone with art product
- **WHEN** admin lists zones for a method that has a zone with product_id=42, product_type='art'
- **THEN** the response includes `product_name` resolved from the `art` table where id=42

#### Scenario: Zone with others product
- **WHEN** admin lists zones for a method that has a zone with product_id=7, product_type='other'
- **THEN** the response includes `product_name` resolved from the `others` table where id=7

#### Scenario: Zone without product
- **WHEN** admin lists zones for a method that has a zone with product_id=NULL
- **THEN** the response includes `product_name = NULL`, `product_id = NULL`, `product_type = NULL`

#### Scenario: Zone with orphaned product reference
- **WHEN** admin lists zones and a zone references a product that has been deleted
- **THEN** the response includes `product_name = NULL` with `product_id` and `product_type` still populated

### Requirement: Validation of product fields in zone creation and update
The API SHALL validate that `product_id` is a positive integer or null/absent, and `product_type` is one of 'art' or 'other' or null/absent. If `product_id` is provided, `product_type` MUST also be provided, and vice versa.

#### Scenario: Valid product fields
- **WHEN** admin submits a zone with `product_id=42` and `product_type='art'`
- **THEN** validation passes

#### Scenario: Missing product_type when product_id is present
- **WHEN** admin submits a zone with `product_id=42` but no `product_type`
- **THEN** validation fails with an appropriate error message

#### Scenario: Missing product_id when product_type is present
- **WHEN** admin submits a zone with `product_type='art'` but no `product_id`
- **THEN** validation fails with an appropriate error message

#### Scenario: Invalid product_type value
- **WHEN** admin submits a zone with `product_type='invalid'`
- **THEN** validation fails with an appropriate error message

#### Scenario: Both fields absent
- **WHEN** admin submits a zone without `product_id` and without `product_type`
- **THEN** validation passes (generic zone)

### Requirement: Product-specific shipping zone filtering for buyers
The `getAvailableShipping` endpoint SHALL filter shipping zones by product. Zones with a `product_id` that does not match the requested product SHALL be excluded. Zones with a matching `product_id` and `product_type` SHALL be included. Zones with `product_id = NULL` (generic) SHALL be included unless overridden by a product-specific zone.

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

### Requirement: Admin form shows product select dependent on seller
The admin shipping zone form SHALL display a "Producto" select input that is populated with products from the selected seller. The select SHALL be disabled or hidden when no seller is selected. When the seller changes, the product list SHALL reload and any previously selected product SHALL be cleared.

#### Scenario: No seller selected
- **WHEN** admin opens the zone form without a seller selected
- **THEN** the product select is disabled/empty with a placeholder indicating a seller must be chosen first

#### Scenario: Seller selected — products load
- **WHEN** admin selects a seller in the zone form
- **THEN** the product select populates with all products (art and others) from that seller

#### Scenario: Seller changes — product resets
- **WHEN** admin changes the seller after a product was already selected
- **THEN** the product select clears the previous selection, reloads products for the new seller

#### Scenario: Product selected
- **WHEN** admin selects a product from the dropdown
- **THEN** the form stores the product_id and product_type (derived from the selected product's type)

#### Scenario: Product cleared
- **WHEN** admin clears the product selection (selects empty/default option)
- **THEN** the form sets product_id and product_type to null/empty

### Requirement: Admin zones table displays product column
The admin shipping zones table SHALL include a column showing the product name for zones with an assigned product. Zones without a product SHALL show an empty cell or a dash in this column.

#### Scenario: Zone with product displayed
- **WHEN** admin views the zones table and a zone has product_name='Cuadro Azul'
- **THEN** the table shows 'Cuadro Azul' in the product column for that zone

#### Scenario: Zone without product displayed
- **WHEN** admin views the zones table and a zone has no product assigned
- **THEN** the table shows a dash or empty cell in the product column for that zone
