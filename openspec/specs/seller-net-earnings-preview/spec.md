### Requirement: Net earnings legend for art products (REBU)
When a seller is publishing an art product and enters a valid price (>= 10), and the seller's art VAT regime is `art_rebu`, the system SHALL display a legend below the price input showing the seller's net earnings.

The commission rate SHALL be the **authenticated seller's** `dealer_commission_art`
and the VAT rate SHALL be the **authenticated seller's** `tax_vat_art`, both
obtained from the API (`GET /api/seller/commission-rates`), NOT from any
`NEXT_PUBLIC_*` environment variable. The regime SHALL be the `artVatRegime`
value returned by the API — the client SHALL NOT derive it from the rate. In
edit mode (admin), the rates AND the regime SHALL be the **product owner's**,
supplied by the edit-data endpoint.

The formula SHALL be:
- `commissionRate = sellerDealerCommissionArt / 100`
- `vatRate = sellerTaxVatArt / 100`
- `grossToArtist = price × (1 - commissionRate)`
- `netToArtist = grossToArtist / (1 + vatRate)`

The legend text SHALL read: `Recibirás {net}€ netos por la venta ({gross}€ incluyendo {vatPercent}% IVA)` where `{net}` and `{gross}` are formatted to 2 decimal places and `{vatPercent}` is the seller's `tax_vat_art`.

The legend SHALL only render once the commission rate, the VAT rate AND the art
VAT regime for the active category are available; while the regime is unknown
(rates fetch pending or failed) no art legend SHALL render.

#### Scenario: Author artist with rate 25 and price 1000
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `25` AND the seller's `artVatRegime` is `art_rebu` (with `tax_vat_art = 10`)
- **THEN** the legend SHALL show net `681.82€` and gross `750.00€` with VAT `10%`

#### Scenario: Art product reflects a different seller rate
- **WHEN** productCategory is `art` AND price is `1000` AND the seller's `dealer_commission_art` is `30` AND the seller's `artVatRegime` is `art_rebu`
- **THEN** the gross to artist SHALL be `700.00€` (price × 0.70)

#### Scenario: Art product with price below minimum
- **WHEN** productCategory is `art` AND price is `5`
- **THEN** no legend SHALL be displayed

### Requirement: Gross earnings legend for standard-regime art products
When a seller is publishing an art product and enters a valid price (>= 10), and the seller's art VAT regime is `standard_vat` (e.g. an artist invoicing through a cooperative), the system SHALL display a gross-earnings legend instead of the REBU net-earnings legend.

The commission rate SHALL be the seller's `dealer_commission_art` and the regime
the API-provided `artVatRegime`, sourced exactly as in the REBU legend (owner's
values in edit mode). The formula SHALL mirror the sale-time split
(`api/utils/artCommission.js`) so the previewed amount equals the amount later
credited to the seller's wallet, with `V` being the platform margin VAT constant
(currently `0.21`), NOT the seller's `tax_vat_art`:

- `commissionRate = sellerDealerCommissionArt / 100`
- `grossToArtist = round2(price × (1 - commissionRate) / (1 + commissionRate × V))`

The legend text SHALL read: `Recibirás {gross}€ brutos por la venta` where
`{gross}` is formatted to 2 decimal places. No VAT breakdown SHALL be shown
(the deductions on that amount — the cooperative's VAT and internal commission —
happen outside the platform).

The same rendering gates apply as for the REBU legend (price >= 10, rates and
regime loaded). `other` products are unaffected by the regime and keep their
existing legend.

#### Scenario: Cooperative reference case (PVP 337, commission 25)
- **WHEN** productCategory is `art` AND price is `337` AND the seller's `dealer_commission_art` is `25` AND the seller's `artVatRegime` is `standard_vat`
- **THEN** the legend SHALL read `Recibirás 240.14€ brutos por la venta`
- **AND** `240.14` SHALL equal the wallet credit the seller receives when that item is later sold and confirmed

#### Scenario: Gross legend honors a different commission rate
- **WHEN** productCategory is `art` AND price is `337` AND the seller's `dealer_commission_art` is `30` AND the seller's `artVatRegime` is `standard_vat`
- **THEN** the legend SHALL show `221.92€` (no hardcoded 75/25 split)

#### Scenario: Standard-regime seller switching to other products sees the standard legend
- **WHEN** a seller whose `artVatRegime` is `standard_vat` switches productCategory from `art` to `other` with price `121` and `dealer_commission_other = 10`, `tax_vat_other = 21`
- **THEN** the legend SHALL show the existing others format (net `90.00€`, gross `108.90€` with `21%` IVA), unchanged by this feature

#### Scenario: Below-minimum price shows no legend
- **WHEN** productCategory is `art` AND price is `5` AND the seller's `artVatRegime` is `standard_vat`
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

### Requirement: Legend updates in real-time
The earnings legend (net or gross, per the active regime) SHALL update immediately as the seller types in the price input, without requiring blur or form submission. It SHALL also recalculate when the seller switches the product category selector between `art` and `other`.

#### Scenario: Seller types incrementally
- **WHEN** the seller types `1`, then `10`, then `100` in the price field
- **THEN** the legend SHALL not appear for `1`, SHALL appear for `10`, and SHALL update with the new calculation for `100`

#### Scenario: Seller switches product category
- **WHEN** the seller has entered price `1000` with productCategory `art` showing `Recibirás 681.82€ netos por la venta (750.00€ incluyendo el IVA(10%))` AND then switches productCategory to `other`
- **THEN** the legend SHALL recalculate using the others formula and display the updated amounts with 21% IVA

#### Scenario: Cooperative seller sees the gross legend update while typing
- **WHEN** a seller whose `artVatRegime` is `standard_vat` types `337` in the price field with productCategory `art`
- **THEN** the gross legend SHALL appear and update in real time as the digits are typed
