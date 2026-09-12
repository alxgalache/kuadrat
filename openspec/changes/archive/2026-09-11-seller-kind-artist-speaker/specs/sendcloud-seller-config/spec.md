# sendcloud-seller-config (MODIFIED)

## MODIFIED Requirements

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
