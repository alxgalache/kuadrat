### Requirement: VAT rate environment variables
The system SHALL expose VAT rates via environment variables for both API and client:
- API: `TAX_VAT_ART_ES` (default `0.10`) registered in `api/config/env.js` under `config.payment.vatArtEs`.
- Client: `NEXT_PUBLIC_TAX_VAT_ES` (default `21`) and `NEXT_PUBLIC_TAX_VAT_ART_ES` (default `10`).
- Infrastructure files (Docker, docker-compose) SHALL propagate the new client env vars.

#### Scenario: API config registers art VAT rate
- **WHEN** the API starts with `TAX_VAT_ART_ES=0.10` in the environment
- **THEN** `config.payment.vatArtEs` SHALL equal `0.10`

#### Scenario: API config defaults art VAT rate when not set
- **WHEN** the API starts without `TAX_VAT_ART_ES` in the environment
- **THEN** `config.payment.vatArtEs` SHALL default to `0.10`

#### Scenario: Client reads VAT rates from environment
- **WHEN** `NEXT_PUBLIC_TAX_VAT_ES=21` and `NEXT_PUBLIC_TAX_VAT_ART_ES=10` are set
- **THEN** the publish form SHALL use `21` as the general VAT percentage and `10` as the art VAT percentage

#### Scenario: Client defaults VAT rates when not set
- **WHEN** `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` are not defined
- **THEN** the publish form SHALL default to `21` for general VAT and `10` for art VAT

### Requirement: Net earnings legend for art products (REBU)
When a seller is publishing an art product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings calculated under the REBU fiscal regime.

The formula SHALL be:
- `commissionRate = NEXT_PUBLIC_DEALER_COMMISSION_ART / 100`
- `vatRate = NEXT_PUBLIC_TAX_VAT_ART_ES / 100`
- `grossToArtist = price × (1 - commissionRate)`
- `netToArtist = grossToArtist / (1 + vatRate)`

The legend text SHALL read: `Recibirás {net}€ netos por la venta ({gross}€ incluyendo el IVA({vatPercent}%))` where `{net}` and `{gross}` are formatted to 2 decimal places and `{vatPercent}` is the integer VAT percentage.

#### Scenario: Art product with default rates and price 1000
- **WHEN** productCategory is `art` AND price is `1000` AND `NEXT_PUBLIC_DEALER_COMMISSION_ART=25` AND `NEXT_PUBLIC_TAX_VAT_ART_ES=10`
- **THEN** the legend SHALL display `Recibirás 681.82€ netos por la venta (750.00€ incluyendo el IVA(10%))`

#### Scenario: Art product with price below minimum
- **WHEN** productCategory is `art` AND price is `5`
- **THEN** no legend SHALL be displayed

#### Scenario: Art product with empty price
- **WHEN** productCategory is `art` AND price is empty
- **THEN** no legend SHALL be displayed

### Requirement: Net earnings legend for other products (General Regime)
When a seller is publishing an "other" product and enters a valid price (>= 10), the system SHALL display a legend below the price input showing the seller's net earnings calculated under the general fiscal regime.

The formula SHALL be:
- `commissionRate = NEXT_PUBLIC_DEALER_COMMISSION_OTHERS / 100`
- `vatRate = NEXT_PUBLIC_TAX_VAT_ES / 100`
- `basePrice = price / (1 + vatRate)`
- `artistBase = basePrice × (1 - commissionRate)` (this is the net)
- `artistGross = artistBase × (1 + vatRate)`

The legend text SHALL read: `Recibirás {net}€ netos por la venta ({gross}€ incluyendo el IVA({vatPercent}%))` where `{net}` and `{gross}` are formatted to 2 decimal places and `{vatPercent}` is the integer VAT percentage.

#### Scenario: Other product with default rates and price 121
- **WHEN** productCategory is `other` AND price is `121` AND `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS=10` AND `NEXT_PUBLIC_TAX_VAT_ES=21`
- **THEN** the legend SHALL display `Recibirás 90.00€ netos por la venta (108.90€ incluyendo el IVA(21%))`

#### Scenario: Other product with price below minimum
- **WHEN** productCategory is `other` AND price is `5`
- **THEN** no legend SHALL be displayed

### Requirement: Legend updates in real-time
The net earnings legend SHALL update immediately as the seller types in the price input, without requiring blur or form submission. It SHALL also recalculate when the seller switches the product category selector between `art` and `other`.

#### Scenario: Seller types incrementally
- **WHEN** the seller types `1`, then `10`, then `100` in the price field
- **THEN** the legend SHALL not appear for `1`, SHALL appear for `10`, and SHALL update with the new calculation for `100`

#### Scenario: Seller switches product category
- **WHEN** the seller has entered price `1000` with productCategory `art` showing `Recibirás 681.82€ netos por la venta (750.00€ incluyendo el IVA(10%))` AND then switches productCategory to `other`
- **THEN** the legend SHALL recalculate using the others formula and display the updated amounts with 21% IVA
