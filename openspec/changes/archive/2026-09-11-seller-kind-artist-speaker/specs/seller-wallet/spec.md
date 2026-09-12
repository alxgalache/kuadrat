# seller-wallet (MODIFIED)

## MODIFIED Requirements

### Requirement: Seller dashboard surfaces both balances
The seller wallet page (`/seller/monedero`, «Monedero») SHALL display both balances with their regime labels in es-ES ("Arte (REBU)" and "Productos y servicios (21%)") plus a combined total. When the wallet endpoint reports `artVatRegime = 'standard_vat'` for the seller, the standard bucket SHALL additionally display a note in es-ES indicating that the seller's artworks accrue there (e.g. "Incluye tus obras de arte (IVA 21%)"), since their new art sales no longer feed the REBU bucket.

The page SHALL be reachable by both seller kinds. A speaker earns exclusively through paid events, which credit `available_withdrawal_standard_vat`; their REBU bucket will read `0,00 €` and SHALL still be rendered, so the two buckets and the total always describe the same fiscal model regardless of who is looking.

The buckets SHALL NOT be rendered on `/orders` any more. That page is about physical sales; the wallet was only there for historical reasons and its presence is what tied seeing your money to having products to sell.

#### Scenario: Seller with credits in both buckets
- **GIVEN** a seller with `available_withdrawal_art_rebu = 120` and `available_withdrawal_standard_vat = 80`
- **WHEN** the seller opens `/seller/monedero`
- **THEN** they see the REBU bucket at "120.00 €", the standard bucket at "80.00 €", and a combined total "200.00 €"

#### Scenario: Speaker with only event credits
- **GIVEN** a seller with `seller_kind = 'speaker'`, `available_withdrawal_art_rebu = 0` and `available_withdrawal_standard_vat = 45`
- **WHEN** the speaker opens `/seller/monedero`
- **THEN** they see the standard bucket at "45.00 €" and the REBU bucket at "0.00 €"
- **AND** the combined total reads "45.00 €"

#### Scenario: Cooperative artist sees the art note on the standard bucket
- **GIVEN** a seller whose `tax_vat_art` is `21` (wallet returns `artVatRegime = 'standard_vat'`)
- **WHEN** the seller opens `/seller/monedero`
- **THEN** the standard bucket shows the note that their artworks are included there
- **AND** the REBU bucket keeps showing any legacy REBU balance

#### Scenario: Author artist sees no extra note
- **GIVEN** a seller whose `tax_vat_art` is `10`
- **WHEN** the seller opens `/seller/monedero`
- **THEN** the buckets render exactly as before this change, with no additional note

#### Scenario: The orders page no longer shows the balance
- **WHEN** any seller opens `/orders`
- **THEN** no balance, no commission line and no payout button SHALL be rendered there
