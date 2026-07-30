## MODIFIED Requirements

### Requirement: Seller endpoints expose the VAT rates
`GET /api/seller/commission-rates` SHALL additionally return `taxVatArt` and
`taxVatOther` (whole percentages) AND `artVatRegime`
(`'art_rebu' | 'standard_vat'`, derived via `api/utils/vatRegime.js`) for the
authenticated seller. `GET /api/seller/wallet` SHALL additionally return
`taxVatArt`, `taxVatOther` and `artVatRegime` (derived the same way), so the
client never derives the regime itself.

#### Scenario: Commission-rates endpoint includes VAT rates and regime
- **GIVEN** an authenticated seller with `tax_vat_art = 21` and `tax_vat_other = 21`
- **WHEN** they call `GET /api/seller/commission-rates`
- **THEN** the response SHALL include `taxVatArt: 21`, `taxVatOther: 21` and `artVatRegime: 'standard_vat'` alongside the commission rates

#### Scenario: Commission-rates endpoint derives REBU for author artists
- **GIVEN** an authenticated seller with `tax_vat_art = 10`
- **WHEN** they call `GET /api/seller/commission-rates`
- **THEN** the response SHALL include `artVatRegime: 'art_rebu'`

#### Scenario: Wallet endpoint includes the derived art regime
- **GIVEN** an authenticated seller with `tax_vat_art = 10`
- **WHEN** they call `GET /api/seller/wallet`
- **THEN** the response SHALL include `taxVatArt: 10`, `taxVatOther: 21` and `artVatRegime: 'art_rebu'`
