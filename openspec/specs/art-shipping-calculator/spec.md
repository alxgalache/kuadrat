# art-shipping-calculator

## Purpose

An admin-only screen at `/admin/calculadora-envios` that quotes an artwork against Sendcloud and writes the resulting `shipping_methods` and `shipping_zones` rows. It replaces the admin's keyboard, not the checkout's pricing engine: `SENDCLOUD_ENABLED_ART` stays `false` and art checkout keeps reading zones through the legacy lookup, so the calculator only changes where the number in `shipping_zones.cost` comes from.

Spain is quoted as four independent zone groups — `peninsula`, `baleares`, `canarias` and `ceuta_melilla` — because Baleares does not share a rate with the peninsula and each territory has options the others lack. The package is described by three columns on `art` (`outside_dimensions`, `outside_weight`, `packaging_cost`) that no other endpoint writes, since the carrier bills the volumetric weight of the box rather than the measurements of the artwork.

> Layer affected: `api/services/shipping/artShippingCalculator.js`, `api/utils/spainShippingZones.js`, `api/controllers/artShippingCalculatorController.js`, `api/routes/admin/artShippingRoutes.js`, `api/validators/artShippingSchemas.js`, `client/app/admin/calculadora-envios/page.js`, plus three columns on `art` and new columns on `shipping_methods` / `shipping_zones`.

## Requirements

### Requirement: Packaging columns on the art table

The `art` table SHALL carry three columns describing the shipping package, distinct from the columns describing the artwork itself: `outside_dimensions` (TEXT, `LxWxH` format, same shape as `dimensions`), `outside_weight` (INTEGER, grams, same shape as `weight`) and `packaging_cost` (REAL, euros, `NOT NULL DEFAULT 0`).

These columns SHALL be writable only from the art shipping calculator and SHALL NOT appear in the product creation form, the product edit form, the admin product edit data endpoint, or any public product view.

#### Scenario: Columns added idempotently to an existing database
- **WHEN** `initializeDatabase()` runs against a database that already contains an `art` table
- **THEN** the three columns SHALL be added via `safeAlter` with their defaults, and no existing row SHALL be modified

#### Scenario: Packaging cost defaults to zero
- **WHEN** an art row is created without an explicit `packaging_cost`
- **THEN** `packaging_cost` SHALL be `0`, representing an artwork the artist packages themselves

#### Scenario: Product form does not expose the packaging columns
- **WHEN** an admin or seller opens the product creation or edit form for an art product
- **THEN** no input for `outside_dimensions`, `outside_weight` or `packaging_cost` SHALL be rendered, and submitting the form SHALL NOT modify those columns

### Requirement: Admin art shipping calculator page

The system SHALL provide an admin-only page at `/admin/calculadora-envios`, reachable from a "Calculadora envíos" entry in the admin menu of `Navbar.js` in both the desktop popover and the mobile dialog, listing art products with editable packaging fields.

#### Scenario: Page is admin-only
- **WHEN** a user whose role is not `admin` requests `/admin/calculadora-envios`
- **THEN** the page SHALL NOT render its contents and the underlying API endpoints SHALL reject the request through `adminAuth`

#### Scenario: Row contents
- **WHEN** the list renders a row for an art product
- **THEN** the row SHALL show the artwork title, its author and its price, plus three inputs (`outside_dimensions`, `outside_weight`, `packaging_cost`) and a "Guardar y calcular envío" button

#### Scenario: Inputs prefilled from stored values
- **WHEN** the page loads
- **THEN** each input SHALL be prefilled with the value currently stored in the corresponding column, and an empty column SHALL render an empty input

### Requirement: Debounced filtering of the art list

The calculator SHALL filter the art list by product title and by author name, applying each filter as the admin types.

#### Scenario: Filter applies from three characters
- **WHEN** the admin has typed three or more characters into the title or author filter
- **THEN** the list SHALL be re-fetched with that filter applied after the debounce interval elapses

#### Scenario: Fewer than three characters does not filter
- **WHEN** the admin has typed one or two characters into a filter
- **THEN** no request SHALL be issued and the list SHALL remain unchanged

#### Scenario: Clearing a filter restores the list
- **WHEN** the admin clears a filter field to empty
- **THEN** the list SHALL be re-fetched without that filter, even though the field holds fewer than three characters

#### Scenario: Keystrokes are debounced
- **WHEN** the admin types several characters in quick succession
- **THEN** only one request SHALL be issued, after the debounce interval measured from the final keystroke

### Requirement: External package dimensions and weight are mandatory to quote

The calculator SHALL require both `outside_dimensions` and `outside_weight` before quoting, and SHALL NOT substitute the artwork's own `dimensions` or `weight` when they are missing.

#### Scenario: Quote refused without external package data
- **WHEN** the admin presses "Guardar y calcular envío" with `outside_dimensions` or `outside_weight` empty
- **THEN** the request SHALL be rejected with HTTP 400 and an es-ES message naming the missing field, and no Sendcloud call SHALL be made

#### Scenario: No silent fallback to artwork measurements
- **WHEN** an artwork has `dimensions` and `weight` set but `outside_dimensions` and `outside_weight` empty
- **THEN** those artwork values SHALL NOT be used as a substitute, since the carrier bills volumetric weight on the package rather than on the artwork

### Requirement: Save and quote endpoint

The system SHALL provide `POST /api/admin/art-shipping/:artId/quote` which persists the three packaging fields and returns Sendcloud quotes grouped into the four Spanish shipping zones.

#### Scenario: Packaging fields persisted before quoting
- **WHEN** the endpoint is called with valid packaging values
- **THEN** `outside_dimensions`, `outside_weight` and `packaging_cost` SHALL be written to the art row before any Sendcloud call is made, so the values survive a Sendcloud failure

#### Scenario: Validation of packaging values
- **WHEN** `outside_dimensions` does not match `/^\d+x\d+x\d+$/`, or `outside_weight` is not an integer greater than zero, or `packaging_cost` is negative
- **THEN** the endpoint SHALL reject the request with HTTP 400 and an es-ES message, and SHALL NOT modify the art row

#### Scenario: Sender address taken from the artist configuration
- **WHEN** a quote is requested for an artwork whose seller has a `user_sendcloud_configuration` row
- **THEN** `from_address` SHALL be built from that row's `sender_country`, `sender_postal_code`, `sender_city` and `sender_address_1`

#### Scenario: Artist without Sendcloud configuration
- **WHEN** a quote is requested for an artwork whose seller has no `user_sendcloud_configuration` row
- **THEN** the endpoint SHALL respond with HTTP 400 and an es-ES message identifying the artist as missing shipping configuration

#### Scenario: Insured value is always the artwork price
- **WHEN** a quote is requested for an artwork
- **THEN** `additional_insured_price` SHALL always be the artwork's `art.price`, rounded to an integer, and SHALL be present in every parcel of every request

#### Scenario: Seller insurance configuration is not consulted
- **WHEN** the quote request is built
- **THEN** `user_sendcloud_configuration.insurance_type` and `insurance_fixed_amount` SHALL NOT be read, and their values SHALL have no effect on the insured amount

#### Scenario: Insured value clamped to the range Sendcloud prices
- **WHEN** the artwork price is below 2 € or above 5000 €
- **THEN** the value sent SHALL be clamped to 2 or 5000 respectively, matching the range Sendcloud actually prices, and an artwork above 5000 € SHALL be presented in the UI as insured only up to that ceiling

### Requirement: Four-zone quoting for Spain

A quote request SHALL produce four zone groups — `peninsula`, `baleares`, `canarias` and `ceuta_melilla` — each quoted independently against its own representative postal code, without asking the admin for a destination postal code.

#### Scenario: One representative postal code per group
- **WHEN** a quote is requested
- **THEN** four Sendcloud calls SHALL be issued, one per group: `28001` for `peninsula`, `07001` for `baleares`, `35001` for `canarias` and `51001` for `ceuta_melilla`

#### Scenario: Each group carries its own rate
- **WHEN** the same shipping option code returns different totals for two groups
- **THEN** each group SHALL keep the total quoted for its own representative postal code, and no total SHALL be averaged, rounded up, or shared across groups

#### Scenario: Options exclusive to one territory belong to that group only
- **WHEN** a shipping option is returned for one group's postal code but not for another's
- **THEN** it SHALL be offered in the group where it was returned and SHALL simply be absent from the others

#### Scenario: One zone failing does not lose the others
- **WHEN** one of the four Sendcloud calls fails
- **THEN** the remaining groups SHALL still be returned with their options, and the affected group SHALL carry an error message

### Requirement: Quote presentation and option eligibility

The calculator SHALL render the quotes as sub-rows beneath the artwork row, grouped by zone, showing every option with its cost breakdown, and SHALL distinguish selectable options from those that carry no usable rate.

#### Scenario: Cost breakdown displayed
- **WHEN** an option carries a quote
- **THEN** the sub-row SHALL show the option name, the carrier, the breakdown items returned by Sendcloud (shipping, insurance, fuel or service fee), the Sendcloud total, the 21% VAT amount, the packaging cost, and the final price

#### Scenario: Final price formula
- **WHEN** the final price is computed
- **THEN** it SHALL equal the Sendcloud total multiplied by 1.21, rounded to two decimals, plus `packaging_cost` — in that order, so packaging is not taxed

#### Scenario: Options without a rate are shown but not selectable
- **WHEN** an option is returned with an empty `quotes` array
- **THEN** the sub-row SHALL display it in a non-selectable state with an es-ES explanation that no rate is available for that destination under the seller's own carrier contract

#### Scenario: Zero-priced options are discarded entirely
- **WHEN** an option's quote total parses to zero or less
- **THEN** the option SHALL NOT appear in the calculator at all

### Requirement: Multiple shipping options may be selected per zone

Each zone group SHALL allow the admin to select any number of eligible options, so the buyer can later choose between carriers at checkout.

#### Scenario: Several options selected for one zone
- **WHEN** the admin selects three eligible options within the `peninsula` group and saves
- **THEN** three `shipping_zones` rows SHALL be written for that artwork and group, one per selected option, each with its own `cost` and `sendcloud_option_code`

#### Scenario: Selection is saved as a set, not incrementally
- **WHEN** the admin saves a selection for a zone group
- **THEN** the saved set SHALL be exactly the options currently selected in that group, and any generated zone of that group not in the set SHALL be removed

#### Scenario: Deselecting every option clears the zone
- **WHEN** the admin deselects all options of a group and saves
- **THEN** all generated zones of that artwork and group SHALL be removed, and the artwork SHALL offer no generated delivery option for that territory

#### Scenario: Buyer sees the selected options at checkout
- **WHEN** a buyer reaches checkout with that artwork and an address in that group's territory
- **THEN** every selected option SHALL be offered as a separate delivery choice with its own price

### Requirement: Shipping method and zone generation

Selecting options for a zone group SHALL create or reuse the `shipping_methods` row mapped to each Sendcloud option code, and write product-specific `shipping_zones` rows carrying the final price plus the province references of the group.

#### Scenario: Shipping method reused across artworks
- **WHEN** an option code already has a `shipping_methods` row with that `sendcloud_option_code`
- **THEN** that row SHALL be reused rather than duplicated, and its `article_type` SHALL be `art` and its `type` SHALL be `delivery`

#### Scenario: Zone written with the artwork and the group provinces
- **WHEN** an option is selected for a zone group
- **THEN** a `shipping_zones` row SHALL be written with `product_id` set to the artwork, `product_type` `art`, `seller_id` set to the artist, `country` `ES`, `cost` set to the final price, and one `shipping_zones_postal_codes` row with `ref_type` `province` per province of the group

#### Scenario: Province groups derived from stored postal codes
- **WHEN** the province list for a group is resolved
- **THEN** it SHALL be derived from the `postal_codes` table by exclusion — `canarias` is `Las Palmas` and `Santa Cruz de Tenerife`, `ceuta_melilla` is `Ceuta` and `Melilla`, `baleares` is `Baleares`, and `peninsula` is every other Spanish province — and SHALL NOT be a list hardcoded in application code

#### Scenario: Groups partition the Spanish provinces exactly
- **WHEN** the four groups are resolved together
- **THEN** their provinces SHALL cover every Spanish province present in `postal_codes` exactly once, with no province missing from all groups and none appearing in two

#### Scenario: Provenance recorded on the generated zone
- **WHEN** a zone is generated
- **THEN** it SHALL record `source` as `sendcloud_calculator`, its `zone_group`, the `sendcloud_option_code`, the pre-VAT `base_cost`, the `packaging_cost_snapshot` applied, and `calculated_at`

#### Scenario: Regeneration replaces only generated zones of the same group
- **WHEN** options are saved for a zone group that already has generated zones for that artwork
- **THEN** the previous zones SHALL be deleted and the new ones written atomically in a single batch, matching on artwork, `zone_group` and `source = 'sendcloud_calculator'` together

#### Scenario: Regenerating one group leaves the others untouched
- **WHEN** the admin saves a new selection for the `baleares` group
- **THEN** the generated zones of `peninsula`, `canarias` and `ceuta_melilla` for that artwork SHALL remain unchanged

#### Scenario: Manually created zones are never touched
- **WHEN** the artwork also has `shipping_zones` rows with `source = 'manual'`
- **THEN** those rows SHALL survive any number of calculator regenerations unchanged

#### Scenario: A method left without any zone is deleted with it
- **WHEN** a save removes the last `shipping_zones` row of a `shipping_methods` row that carries a `sendcloud_option_code`, counting the zones of every artwork and every zone group
- **THEN** that `shipping_methods` row SHALL be deleted too, so the admin shipping screens only ever list modalities that some artwork actually offers

#### Scenario: A method still used elsewhere survives
- **WHEN** the same option code still has a zone for another artwork, or for another zone group of the same artwork
- **THEN** the `shipping_methods` row SHALL be kept

#### Scenario: Hand-made methods are never swept up
- **WHEN** a `shipping_methods` row has no `sendcloud_option_code`
- **THEN** it SHALL never be deleted by the calculator, even with no zones at all — a method with no zones yet is one being configured by hand, not rubbish

#### Scenario: Selecting the option again recreates the method
- **WHEN** an option whose method was deleted is selected and saved again
- **THEN** the `shipping_methods` row SHALL be created anew and the zone written against it, so the deletion costs nothing but the row's id

#### Scenario: Generated zones drive the checkout unchanged
- **WHEN** a buyer reaches checkout with that artwork and a delivery address in one of the group's provinces
- **THEN** the existing legacy shipping lookup SHALL match the generated zone through its province references and offer its `cost`, with no change to the checkout code
