# admin-seller-shipments-page (MODIFIED)

## MODIFIED Requirements

### Requirement: Seller selector dropdown

The page SHALL display a dropdown at the top populated with the sellers that can have shipments — that is, users with `role = 'seller'` **and** `seller_kind = 'artist'`.

A speaker never publishes a product and therefore never produces a shipment, so listing them here offers the admin a choice whose only possible outcome is an empty screen.

#### Scenario: Dropdown populated with artists
- **WHEN** the page loads
- **THEN** the dropdown SHALL list all users with `role = 'seller'` and `seller_kind = 'artist'`, showing their full name and email, sorted alphabetically by name

#### Scenario: Speakers are absent from the dropdown
- **GIVEN** a seller with `seller_kind = 'speaker'`
- **WHEN** the admin opens the seller shipments page
- **THEN** that seller SHALL NOT appear in the dropdown

#### Scenario: A demoted artist leaves the dropdown
- **GIVEN** an artist listed in the dropdown
- **WHEN** the admin changes their `seller_kind` to `'speaker'` and reloads the page
- **THEN** they SHALL no longer appear in the dropdown
- **AND** their historical shipments SHALL remain in the database

#### Scenario: Seller selection loads shipments
- **WHEN** the admin selects a seller from the dropdown
- **THEN** the page SHALL load and display that seller's shipments using the same card layout as the seller's own "Mis envíos" page
