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

#### Scenario: Create seller Sendcloud configuration
- **WHEN** an admin sends `POST /api/admin/authors/:id/sendcloud-config` with valid configuration data
- **THEN** the system SHALL create a `user_sendcloud_configuration` record for the specified seller and return the created record

#### Scenario: Read seller Sendcloud configuration
- **WHEN** an admin sends `GET /api/admin/authors/:id/sendcloud-config`
- **THEN** the system SHALL return the seller's Sendcloud configuration, or a 404 if none exists

#### Scenario: Update seller Sendcloud configuration
- **WHEN** an admin sends `PUT /api/admin/authors/:id/sendcloud-config` with updated fields
- **THEN** the system SHALL update the existing configuration and set `updated_at` to the current timestamp

#### Scenario: Validate seller is a seller role
- **WHEN** an admin attempts to create Sendcloud configuration for a user with role `buyer`
- **THEN** the system SHALL return a 400 error indicating only sellers can have Sendcloud configuration

### Requirement: Admin UI for seller Sendcloud configuration

The admin author edit page (`/admin/authors/[id]/edit`) SHALL include a "Configuración de envío Sendcloud" section for managing the seller's Sendcloud configuration.

#### Scenario: Display Sendcloud configuration form
- **WHEN** an admin visits the author edit page and Sendcloud is enabled (`SENDCLOUD_ENABLED_ART` or `SENDCLOUD_ENABLED_OTHERS`)
- **THEN** the page SHALL display a form section with fields for sender address, shipping preferences (signature, fragile goods, insurance, first mile), carrier preferences, customs defaults, and the self-packs flag

#### Scenario: Save Sendcloud configuration
- **WHEN** the admin fills in the Sendcloud configuration form and saves
- **THEN** the system SHALL create or update the seller's `user_sendcloud_configuration` record via the admin API

#### Scenario: Hide section when Sendcloud is disabled
- **WHEN** both `SENDCLOUD_ENABLED_ART` and `SENDCLOUD_ENABLED_OTHERS` are `false`
- **THEN** the Sendcloud configuration section SHALL NOT be displayed on the author edit page

### Requirement: Co-packable field for others products

The `others` table SHALL include a `can_copack` column indicating whether the product can be packaged together with other products from the same seller in a single parcel.

#### Scenario: Default value
- **WHEN** a new others product is created without specifying `can_copack`
- **THEN** the value SHALL default to `1` (co-packable)

#### Scenario: Seller publish form toggle
- **WHEN** a seller publishes an others product
- **THEN** the publish form SHALL display a checkbox "Este producto puede empaquetarse junto con otros productos del mismo pedido" (checked by default)

#### Scenario: Art products do not have co-pack field
- **WHEN** a seller publishes an art product
- **THEN** no co-pack option SHALL be displayed (art always ships individually)

### Requirement: Weight mandatory when Sendcloud is enabled

When Sendcloud is enabled for a product type, the weight field SHALL be mandatory during product publication.

#### Scenario: Weight required for art when Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and a seller submits an art product without weight
- **THEN** the system SHALL reject the submission with a validation error: "El peso es obligatorio para poder calcular el envío"

#### Scenario: Weight optional when Sendcloud disabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `false` and a seller submits an art product without weight
- **THEN** the system SHALL accept the submission (current behavior preserved)

#### Scenario: Server-side validation
- **WHEN** a product creation API request is received without weight and Sendcloud is enabled for that product type
- **THEN** the API SHALL return a 400 error with the weight validation message
