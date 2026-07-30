## MODIFIED Requirements

### Requirement: Edit data endpoint

The system SHALL expose an admin-only endpoint `GET /api/admin/products/:id/edit-data?type=art|others` returning the full product row with hydrated `images` and, for others, `variations` each hydrated with their images, plus the product owner's commission rates AND VAT rates (`tax_rates: { art, other }`, whole percentages from `users.tax_vat_art` / `users.tax_vat_other`) AND the owner's derived art VAT regime (`artVatRegime`, `'art_rebu' | 'standard_vat'`, derived via `api/utils/vatRegime.js`) for the net-earnings preview. The client SHALL NOT derive the regime from the rates.

#### Scenario: Edit data for an others product

- **WHEN** an admin requests edit data for an existing others product
- **THEN** the response contains the product fields, ordered `images` with basenames, all variations with their `id`, key, stock and ordered images, the seller's `other` commission rate, and the seller's `other` VAT rate

#### Scenario: Edit data exposes the owner's VAT rates for the preview

- **GIVEN** an art product whose owner has `tax_vat_art = 21`
- **WHEN** an admin requests its edit data
- **THEN** the response includes `tax_rates.art = 21` and `artVatRegime = 'standard_vat'`
- **AND** the edit form's earnings legend shows the gross ("brutos") message for that product

#### Scenario: Edit data exposes REBU regime for author artists

- **GIVEN** an art product whose owner has `tax_vat_art = 10`
- **WHEN** an admin requests its edit data
- **THEN** the response includes `artVatRegime = 'art_rebu'`
- **AND** the edit form's earnings legend shows the existing net (REBU) message

#### Scenario: Product not found

- **WHEN** an admin requests edit data for a non-existent or removed product id
- **THEN** the endpoint responds 404 with a Spanish error message
