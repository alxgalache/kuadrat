## MODIFIED Requirements

### Requirement: Net earnings legend for art products (REBU)
When a seller is publishing an art product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings calculated under the REBU fiscal regime.

The commission rate SHALL be the **authenticated seller's** `dealer_commission_art`,
obtained from the API (e.g. `GET /api/seller/commission-rates`), NOT from a
`NEXT_PUBLIC_DEALER_COMMISSION_ART` environment variable. The VAT rate continues to
come from `NEXT_PUBLIC_TAX_VAT_ART_ES`.

The formula SHALL be:
- `commissionRate = sellerDealerCommissionArt / 100`
- `vatRate = NEXT_PUBLIC_TAX_VAT_ART_ES / 100`
- `grossToArtist = price × (1 - commissionRate)`
- `netToArtist = grossToArtist / (1 + vatRate)`

The legend text SHALL read: `Recibirás {net}€ netos por la venta ({gross}€ incluyendo {vatPercent}% IVA)` where `{net}` and `{gross}` are formatted to 2 decimal places and `{vatPercent}` is the integer VAT percentage.

#### Scenario: Art product with seller rate 25 and price 1000
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `25` AND `NEXT_PUBLIC_TAX_VAT_ART_ES=10`
- **THEN** the legend SHALL show net `681.82€` and gross `750.00€` with VAT `10%`

#### Scenario: Art product reflects a different seller rate
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `30`
- **THEN** the gross to artist SHALL be `700.00€` (price × 0.70)

#### Scenario: Art product with price below minimum
- **WHEN** productCategory is `art` AND price is `5`
- **THEN** no legend SHALL be displayed

### Requirement: Net earnings legend for other products (General Regime)
When a seller is publishing an "other" product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings calculated under the general fiscal regime.

The commission rate SHALL be the **authenticated seller's** `dealer_commission_other`,
obtained from the API, NOT from a `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` environment
variable. The VAT rate continues to come from `NEXT_PUBLIC_TAX_VAT_ES`.

The formula SHALL be:
- `commissionRate = sellerDealerCommissionOther / 100`
- `vatRate = NEXT_PUBLIC_TAX_VAT_ES / 100`
- `basePrice = price / (1 + vatRate)`
- `artistBase = basePrice × (1 - commissionRate)` (this is the net)
- `artistGross = artistBase × (1 + vatRate)`

#### Scenario: Other product with seller rate 10 and price 121
- **WHEN** productCategory is `other` AND price is `121` AND the seller's `dealer_commission_other` is `10` AND `NEXT_PUBLIC_TAX_VAT_ES=21`
- **THEN** the legend SHALL show net `90.00€` and gross `108.90€` with VAT `21%`

#### Scenario: Other product with price below minimum
- **WHEN** productCategory is `other` AND price is `5`
- **THEN** no legend SHALL be displayed
