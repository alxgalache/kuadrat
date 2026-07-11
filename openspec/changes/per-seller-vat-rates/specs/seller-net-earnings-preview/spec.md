# seller-net-earnings-preview (MODIFIED)

## REMOVED Requirements

### Requirement: VAT rate environment variables
**Reason**: VAT rates are now per-seller columns (`users.tax_vat_art` /
`users.tax_vat_other`) served by the API, following the same migration already
applied to the dealer commission rates. Build-time env vars cannot represent
per-seller values.
**Migration**: The client reads the rates from
`GET /api/seller/commission-rates` (create mode) or from the admin
`edit-data` endpoint (edit mode). On the API, `TAX_VAT_ART_ES` is deleted;
`TAX_VAT_ES` survives only for the legacy Revolut line-item metadata (see
`per-seller-vat-rates`).

## MODIFIED Requirements

### Requirement: Net earnings legend for art products (REBU)
When a seller is publishing an art product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings.

The commission rate SHALL be the **authenticated seller's** `dealer_commission_art`
and the VAT rate SHALL be the **authenticated seller's** `tax_vat_art`, both
obtained from the API (`GET /api/seller/commission-rates`), NOT from any
`NEXT_PUBLIC_*` environment variable. In edit mode (admin), both rates SHALL be
the **product owner's**, supplied by the edit-data endpoint.

The formula SHALL be:
- `commissionRate = sellerDealerCommissionArt / 100`
- `vatRate = sellerTaxVatArt / 100`
- `grossToArtist = price × (1 - commissionRate)`
- `netToArtist = grossToArtist / (1 + vatRate)`

The legend text SHALL read: `Recibirás {net}€ netos por la venta ({gross}€ incluyendo {vatPercent}% IVA)` where `{net}` and `{gross}` are formatted to 2 decimal places and `{vatPercent}` is the seller's `tax_vat_art`.

The legend SHALL only render once both the commission rate AND the VAT rate for
the active category are available.

#### Scenario: Author artist with rate 25 and price 1000
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `25` AND the seller's `tax_vat_art` is `10`
- **THEN** the legend SHALL show net `681.82€` and gross `750.00€` with VAT `10%`

#### Scenario: Cooperative artist sees 21% applied to art
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `25` AND the seller's `tax_vat_art` is `21`
- **THEN** the legend SHALL show net `619.83€` and gross `750.00€` with VAT `21%`

#### Scenario: Art product reflects a different seller rate
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `30`
- **THEN** the gross to artist SHALL be `700.00€` (price × 0.70)

#### Scenario: Art product with price below minimum
- **WHEN** productCategory is `art` AND price is `5`
- **THEN** no legend SHALL be displayed

### Requirement: Net earnings legend for other products (General Regime)
When a seller is publishing an "other" product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings calculated under the general fiscal regime.

The commission rate SHALL be the **authenticated seller's** `dealer_commission_other`
and the VAT rate SHALL be the **authenticated seller's** `tax_vat_other`, both
obtained from the API, NOT from any `NEXT_PUBLIC_*` environment variable. In edit
mode (admin), both rates SHALL be the **product owner's**.

The formula SHALL be:
- `commissionRate = sellerDealerCommissionOther / 100`
- `vatRate = sellerTaxVatOther / 100`
- `basePrice = price / (1 + vatRate)`
- `artistBase = basePrice × (1 - commissionRate)` (this is the net)
- `artistGross = artistBase × (1 + vatRate)`

#### Scenario: Other product with seller rate 10 and price 121
- **WHEN** productCategory is `other` AND price is `121` AND the seller's `dealer_commission_other` is `10` AND the seller's `tax_vat_other` is `21`
- **THEN** the legend SHALL show net `90.00€` and gross `108.90€` with VAT `21%`

#### Scenario: Other product with price below minimum
- **WHEN** productCategory is `other` AND price is `5`
- **THEN** no legend SHALL be displayed
