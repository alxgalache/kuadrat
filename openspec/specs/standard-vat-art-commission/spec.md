# standard-vat-art-commission

## Purpose

Regime-aware computation of the art `commission_amount` at sale time. Under
REBU the flat `price × c` split is correct, but for standard-regime art
(cooperative artists, `vat_regime = 'standard_vat'`) the gallery's margin must
carry its own 21% VAT on top of the artist's share. Reference model:
`docs/fiscalidad_cooperativa/140d-esquema-iva-cooperativa-desde-PVP.html`.

## Requirements

### Requirement: Regime-aware art commission helper
The system SHALL provide a single helper module (`api/utils/artCommission.js`)
that computes the `commission_amount` of an art sale from the sale price, the
seller's `dealer_commission_art` (whole percentage) and the sale's fiscal
regime (`'art_rebu' | 'standard_vat'` as derived by `api/utils/vatRegime.js`):

- `art_rebu`: `commission_amount = round2(price × c)` where `c = rate / 100`
  (the pre-existing flat split, preserved unchanged).
- `standard_vat`: the gallery margin is grossed up by the gallery's own margin
  VAT `V` on top of the artist's share:
  - `artistGross = round2(price × (1 − c) / (1 + c × V))`
  - `commission_amount = price − artistGross`

`round2` SHALL be half-away-from-zero rounding to 2 decimals
(`Math.round(n × 100) / 100`), consistent with `api/utils/vatCalculator.js`.

The rounding order is normative: the artist share is rounded FIRST and the
commission is obtained by difference, so that `artistGross + commission_amount`
equals the price exactly and every downstream consumer of
`price_at_purchase − commission_amount` (wallet credit, cancellation reversals,
seller emails, withdrawal lines) yields exactly the rounded `artistGross`.

No backend code SHALL compute an art `commission_amount` outside this helper.

#### Scenario: Cooperative reference case (PVP 337, commission 25)
- **WHEN** the helper is called with `price = 337`, `commissionRate = 25`, `vatRegime = 'standard_vat'`
- **THEN** the artist gross SHALL be `240.14` and the returned `commission_amount` SHALL be `96.86`
- **AND** the commission decomposes at withdrawal time into margin base `80.05` plus margin VAT `16.81` via `computeStandardVat`

#### Scenario: Cooperative case with a different seller commission rate
- **WHEN** the helper is called with `price = 337`, `commissionRate = 30`, `vatRegime = 'standard_vat'`
- **THEN** the artist gross SHALL be `round2(337 × 0.70 / 1.063) = 221.92` and `commission_amount` SHALL be `337 − 221.92 = 115.08` (no hardcoded 75/25 split)

#### Scenario: REBU behavior is byte-identical to the flat split
- **WHEN** the helper is called with `price = 320`, `commissionRate = 25`, `vatRegime = 'art_rebu'`
- **THEN** the returned `commission_amount` SHALL be `80.00`, identical to the pre-existing `price × c` computation

#### Scenario: Split identity holds after rounding
- **WHEN** the helper is called with any `standard_vat` inputs
- **THEN** `artistGross + commission_amount` SHALL equal `price` exactly

### Requirement: Margin VAT rate is the shared platform constant
The gross-up factor `V` used by the helper for `standard_vat` art SHALL be the
same constant used by the withdrawal-side VAT extraction
(`VAT_RATE_STANDARD` in `api/utils/vatCalculator.js`, currently `0.21`), NOT a
new literal and NOT the seller's `tax_vat_art`. The seller's `tax_vat_art` acts
only as the regime discriminator (via `api/utils/vatRegime.js`); it never
parameterizes the gross-up.

Rationale and evolution path (platform-level configurable rate preferred over
per-seller `tax_vat_*_gallery` columns; per-seller columns would additionally
require a per-item snapshot at sale time) are recorded in the
`standard-vat-art-commission` change's design.md, Decision 4.

#### Scenario: Sale-time and withdrawal-time use the same rate
- **WHEN** a `standard_vat` art item is sold and later withdrawn
- **THEN** the VAT rate used to gross up the margin at sale time SHALL be the same constant `computeStandardVat` uses to extract `taxableBase` and `vatAmount` from the stored commission

#### Scenario: Seller VAT rate does not alter the gross-up
- **WHEN** two `standard_vat` sellers with `tax_vat_art = 21` and `tax_vat_art = 4` each sell an art piece at the same price and commission rate
- **THEN** both sales SHALL store the same `commission_amount` (the gross-up uses the platform constant in both cases)
