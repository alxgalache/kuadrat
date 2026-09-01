## MODIFIED Requirements

### Requirement: Weight mandatory when Sendcloud is enabled

When Sendcloud is enabled for a product type, the weight field SHALL be mandatory during product publication, and for `other` products the dimensions field SHALL be mandatory as well, because the aggregated parcel is priced on the greater of its real and its volumetric weight and the latter cannot be computed without dimensions. The requirement SHALL be enforced both in the publish form and in the API.

#### Scenario: Weight required for art when Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and a seller submits an art product without weight
- **THEN** the system SHALL reject the submission with a validation error: "El peso es obligatorio para poder calcular el envío"

#### Scenario: Weight required for store products when Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is `true` and a seller submits an `other` product without weight
- **THEN** the system SHALL reject the submission with the same validation error, and the form SHALL mark the field as required rather than labelling it "(opcional)"

#### Scenario: Dimensions required for store products when Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is `true` and a seller submits an `other` product without dimensions
- **THEN** the system SHALL reject the submission with a validation error naming the expected `LxAxF` format

#### Scenario: The requirement is evaluated against the category the selector emits
- **WHEN** the publish form evaluates whether weight and dimensions are required
- **THEN** it SHALL compare the product category against the values the selector can actually hold (`art`, `other`), so the condition can evaluate true for a store product

#### Scenario: Weight optional when Sendcloud disabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `false` and a seller submits an art product without weight
- **THEN** the system SHALL accept the submission (current behavior preserved)

#### Scenario: Server-side validation
- **WHEN** a product creation or edit API request is received without weight, or without dimensions for an `other` product, and Sendcloud is enabled for that product type
- **THEN** the API SHALL return a 400 error with the corresponding validation message, in both the seller creation endpoint and the admin edit endpoint

#### Scenario: One shared validator, not one per endpoint
- **WHEN** the rule is implemented
- **THEN** it SHALL live in the validator shared by the art and store creation endpoints and the two admin edit endpoints, so the four cannot drift apart

#### Scenario: A product without weight is never silently quoted as one kilogram
- **WHEN** a stored product reaches the quoting path with no weight
- **THEN** the system SHALL log a warning naming the product, so the 1000 g fallback in the provider stops being invisible

### Requirement: Co-packable field for others products

The `others` table SHALL include a `can_copack` column indicating whether the product can be packaged together with other products from the same seller in a single parcel. The seller SHALL be able to set it in the publish form, and the stored value SHALL be the one used when grouping an order into parcels.

#### Scenario: Default value
- **WHEN** a new others product is created without specifying `can_copack`
- **THEN** the value SHALL default to `1` (co-packable)

#### Scenario: Seller publish form toggle
- **WHEN** a seller publishes an others product
- **THEN** the publish form SHALL display a checkbox "Este producto puede empaquetarse junto con otros productos del mismo pedido" (checked by default)

#### Scenario: The checkbox is actually rendered
- **WHEN** the product category selector holds the value it emits for a store product (`other`)
- **THEN** the co-pack checkbox SHALL be rendered, which the previous comparison against the never-occurring value `others` prevented, leaving the column unsettable by anyone

#### Scenario: Art products do not have co-pack field
- **WHEN** a seller publishes an art product
- **THEN** no co-pack option SHALL be displayed (art always ships individually)

#### Scenario: The stored value reaches the quote
- **WHEN** a product saved with the checkbox cleared is quoted in the cart
- **THEN** it SHALL be placed in its own parcel, so the declaration the seller made has an observable effect on the price the buyer is shown and on the number of parcels later announced
