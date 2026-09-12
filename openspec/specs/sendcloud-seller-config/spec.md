## ADDED Requirements

### Requirement: Seller Sendcloud configuration database table

The system SHALL store per-seller Sendcloud configuration in a `user_sendcloud_configuration` table with sender address, shipping preferences, carrier preferences, customs defaults, and operational flags.

#### Scenario: Table schema
- **WHEN** the database is initialized
- **THEN** a `user_sendcloud_configuration` table SHALL exist with columns: `id`, `user_id` (unique, FK to users), `sender_name`, `sender_company_name`, `sender_address_1`, `sender_address_2`, `sender_house_number`, `sender_city`, `sender_postal_code`, `sender_country` (default 'ES'), `sender_phone`, `sender_email`, `require_signature` (default 0), `fragile_goods` (default 0), `insurance_type` (default 'none', CHECK IN 'none','full_value','fixed'), `insurance_fixed_amount`, `first_mile` (default 'drop_off', CHECK IN 'drop_off','collection'), `preferred_carriers` (JSON text), `excluded_carriers` (JSON text), `default_hs_code`, `origin_country` (default 'ES'), `vat_number`, `eori_number`, `self_packs` (default 1), `created_at`, `updated_at`

#### Scenario: One configuration per seller
- **WHEN** a second configuration record is inserted for the same `user_id`
- **THEN** the database SHALL reject the insertion due to the UNIQUE constraint on `user_id`

### Requirement: Admin API for seller Sendcloud configuration

The system SHALL provide admin-only API endpoints to create, read, and update a seller's Sendcloud configuration.

Creating or updating a configuration SHALL be refused for a seller whose `seller_kind` is `'speaker'`: a speaker never ships anything, so a sender address, a carrier preference or a customs default on that account is data nothing will ever read.

Reading SHALL remain allowed for every seller. A demoted artist may still hold a configuration row from the shipments they did make, and that row SHALL NOT be deleted by the demotion — it is the record of real shipments, and removing it would destroy history to tidy a form.

#### Scenario: Create seller Sendcloud configuration
- **WHEN** an admin sends `POST /api/admin/authors/:id/sendcloud-config` with valid configuration data for a seller with `seller_kind = 'artist'`
- **THEN** the system SHALL create a `user_sendcloud_configuration` record for the specified seller and return the created record

#### Scenario: Read seller Sendcloud configuration
- **WHEN** an admin sends `GET /api/admin/authors/:id/sendcloud-config`
- **THEN** the system SHALL return the seller's Sendcloud configuration, or a 404 if none exists

#### Scenario: Update seller Sendcloud configuration
- **WHEN** an admin sends `PUT /api/admin/authors/:id/sendcloud-config` with updated fields for a seller with `seller_kind = 'artist'`
- **THEN** the system SHALL update the existing configuration and set `updated_at` to the current timestamp

#### Scenario: Validate seller is a seller role
- **WHEN** an admin attempts to create Sendcloud configuration for a user with role `buyer`
- **THEN** the system SHALL return a 400 error indicating only sellers can have Sendcloud configuration

#### Scenario: Refuse configuration for a speaker
- **WHEN** an admin attempts to create or update Sendcloud configuration for a seller with `seller_kind = 'speaker'`
- **THEN** the system SHALL return a 400 error in es-ES explaining that a speaker does not ship products
- **AND** no `user_sendcloud_configuration` row SHALL be created or modified

#### Scenario: Demotion preserves an existing configuration
- **GIVEN** an artist with a `user_sendcloud_configuration` row
- **WHEN** the admin changes their `seller_kind` to `'speaker'`
- **THEN** the row SHALL remain in the database untouched
- **AND** `GET /api/admin/authors/:id/sendcloud-config` SHALL still return it

### Requirement: Admin UI for seller Sendcloud configuration

The admin author edit page (`/admin/authors/[id]/edit`) SHALL include a "Configuración de envío Sendcloud" section for managing the seller's Sendcloud configuration, shown only when the author's `seller_kind` is `'artist'`.

#### Scenario: Display Sendcloud configuration form
- **WHEN** an admin visits the author edit page of an artist and Sendcloud is enabled (`SENDCLOUD_ENABLED_ART` or `SENDCLOUD_ENABLED_OTHERS`)
- **THEN** the page SHALL display a form section with fields for sender address, shipping preferences (signature, fragile goods, insurance, first mile), carrier preferences, customs defaults, and the self-packs flag

#### Scenario: Save Sendcloud configuration
- **WHEN** the admin fills in the Sendcloud configuration form and saves
- **THEN** the system SHALL create or update the seller's `user_sendcloud_configuration` record via the admin API

#### Scenario: Hide section when Sendcloud is disabled
- **WHEN** both `SENDCLOUD_ENABLED_ART` and `SENDCLOUD_ENABLED_OTHERS` are `false`
- **THEN** the Sendcloud configuration section SHALL NOT be displayed on the author edit page

#### Scenario: Hide section for a speaker
- **WHEN** an admin visits the author edit page of a seller with `seller_kind = 'speaker'`, with Sendcloud enabled
- **THEN** the "Configuración de envío Sendcloud" section SHALL NOT be displayed
- **AND** saving the page SHALL NOT send any Sendcloud configuration request

#### Scenario: The section reappears on promotion
- **GIVEN** a speaker whose edit page shows no Sendcloud section
- **WHEN** the admin changes them to «Artista» and reopens the edit page
- **THEN** the "Configuración de envío Sendcloud" section SHALL be displayed again

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
