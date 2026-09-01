## MODIFIED Requirements

### Requirement: Parcel grouping logic

The shipping options endpoint SHALL group cart items into parcels according to product type and co-packability rules, using values read from the database and never values supplied by the client. A parcel that groups several items SHALL be weighed by the greater of its total real weight and its total volumetric weight, because the carrier bills whichever is higher and the endpoint sends no dimensions for such a parcel.

#### Scenario: Art products are separate parcels
- **WHEN** a seller has 3 art products in the cart
- **THEN** the system SHALL create 3 separate parcels, each with the individual product's weight and dimensions

#### Scenario: Co-packable others products are aggregated
- **WHEN** a seller has 3 others products with `can_copack=1`
- **THEN** the system SHALL create 1 parcel whose weight is the greater of the summed real weight (quantity × weight per item) and the summed volumetric weight

#### Scenario: Non-co-packable others products are separate
- **WHEN** a seller has 2 others products with `can_copack=0`
- **THEN** the system SHALL create 2 separate parcels, each with the individual product's weight and dimensions

#### Scenario: Several units of a non-co-packable product are separate parcels
- **WHEN** a seller has 1 others product with `can_copack=0` and quantity 3
- **THEN** the system SHALL create 3 parcels, one per unit

#### Scenario: Mixed co-packable and non-co-packable
- **WHEN** a seller has 2 co-packable items and 1 non-co-packable item
- **THEN** the system SHALL create 2 parcels: one aggregated parcel for the co-packable items and one individual parcel for the non-co-packable item

#### Scenario: Co-packability comes from the database, not from the request
- **WHEN** a request declares an item as co-packable while the `others` row has `can_copack = 0`
- **THEN** the system SHALL use the database value and place the item in its own parcel, so the parcel count used to quote matches the parcel count that will later be announced

#### Scenario: Volumetric weight computed per item and summed
- **WHEN** a co-packable item measuring 30x30x4 cm is added with quantity 2
- **THEN** its volumetric weight SHALL be computed as `length × width × height / 5000` grams per unit (720 g), summed across units (1440 g), and compared against the summed real weight (1200 g), and the parcel SHALL be quoted at 1440 g

#### Scenario: Aggregated parcel carries no dimensions
- **WHEN** an aggregated parcel is built with a volumetric-adjusted weight
- **THEN** the parcel SHALL NOT include `dimensions`, because Sendcloud would apply its own volumetric calculation on top of an already-inflated weight and bill the volume twice

#### Scenario: Individual parcels keep their real dimensions
- **WHEN** a parcel holds a single product unit
- **THEN** it SHALL be sent with the product's real weight and real dimensions, so Sendcloud applies each carrier's own volumetric divisor and enforces that carrier's size limits

#### Scenario: Item without dimensions falls back to real weight
- **WHEN** a co-packable item has no `dimensions` recorded
- **THEN** its volumetric contribution SHALL be zero, the parcel SHALL be quoted on real weight alone, and the system SHALL log a warning naming the product

### Requirement: Shipping options API endpoint

The system SHALL provide a `POST /api/shipping/options` endpoint that returns normalized shipping options for a cart, grouped by seller. The endpoint SHALL derive every price-determining attribute of a product from the database and SHALL NOT accept them from the request.

#### Scenario: Request format
- **WHEN** a request is sent with `{ items: [{ productId, productType, quantity, sellerId }], deliveryAddress: { country, postalCode, city, address } }`
- **THEN** the system SHALL group items by seller, determine parcels per seller (art=separate, others=copack grouping), call the appropriate provider per product type, and return options per seller

#### Scenario: Co-packability is not an accepted request field
- **WHEN** a request body includes `canCopack` on an item
- **THEN** the validation schema SHALL reject or strip the field, and it SHALL have no effect on the result

#### Scenario: Price-determining attributes read from the database
- **WHEN** items are enriched before grouping
- **THEN** the system SHALL read `weight`, `dimensions`, `price` and `can_copack` from the `others` row (or `weight`, `dimensions`, `price` from the `art` row) and SHALL overwrite whatever the request carried for `price` and `can_copack`

#### Scenario: Variant items use the parent product's attributes
- **WHEN** an item refers to an `other_vars` variant
- **THEN** its weight, dimensions and price SHALL be those of the parent `others` row, since `other_vars` carries only `key`, `value` and `stock`

#### Scenario: Response format
- **WHEN** the endpoint returns successfully
- **THEN** the response SHALL contain `{ sellers: [{ sellerId, sellerName, parcelCount, deliveryOptions: [...], pickupOption: { address, city, postalCode, country, instructions } | null }] }`

#### Scenario: Mixed providers
- **WHEN** the cart contains art items (Sendcloud enabled) and others items (Sendcloud disabled) from the same seller
- **THEN** the system SHALL query the appropriate provider for each product type and return combined options per seller

### Requirement: Every shipment is insured for the value of its goods

Shipping options for `other` products SHALL always be quoted with insurance covering the value of the goods in the parcel, with no configuration able to disable it. This matches the treatment of `art` products: every shipment travels insured. The goods value SHALL be derived from the database, so the amount quoted is the amount that will be announced.

#### Scenario: Insurance always attached
- **WHEN** a buyer reaches the shipping step for a parcel of `other` products
- **THEN** the request to Sendcloud SHALL include `additional_insured_price` set to the parcel's total goods value, regardless of the seller's `user_sendcloud_configuration`

#### Scenario: Multi-item parcel insured for the sum of its contents
- **WHEN** a parcel groups several items, or several units of one item
- **THEN** the insured value SHALL be the sum of each item's price multiplied by its quantity

#### Scenario: Goods value comes from the database, never from the request
- **WHEN** a parcel's insured value is computed
- **THEN** each item's price SHALL be the `price` column of its product row, so a request that omits or misstates the price cannot lower the insured value

#### Scenario: A parcel is never quoted at the insurance floor by accident
- **WHEN** a parcel of `other` products worth 40 € is quoted
- **THEN** the insured value sent SHALL be 40, not the 2 € lower bound of the clamp, and the quoted price SHALL include the corresponding premium

#### Scenario: Insurance appears in the quoted price the buyer pays
- **WHEN** an option is quoted for an insured parcel
- **THEN** the quoted total SHALL include the `insurance_price` breakdown item returned by Sendcloud, and that total SHALL be the amount charged to the buyer

#### Scenario: Shipping costs rise for store products
- **WHEN** the same parcel is quoted before and after this change
- **THEN** the quoted price SHALL be higher by the insurance premium, which is the accepted consequence of insuring every shipment
