## MODIFIED Requirements

### Requirement: Dynamic commission percentage in Monedero
The Monedero section SHALL display both commission percentages dynamically using the
**authenticated seller's** rates returned by `GET /api/seller/wallet`
(`commissionRateArt`, `commissionRateOther`), NOT from the
`NEXT_PUBLIC_DEALER_COMMISSION_ART` / `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
environment variables.

#### Scenario: Commission text reflects the seller's rates
- **WHEN** the authenticated seller's `dealer_commission_art` is `15` and `dealer_commission_other` is `10`
- **THEN** the Monedero description text SHALL read "Se aplica una comisión del 15% en obras de arte y del 10% en otros productos sobre el total de las transacciones realizadas."

#### Scenario: Two sellers see their own rates
- **WHEN** seller A (`dealer_commission_art = 25`) and seller B (`dealer_commission_art = 30`) each open their Monedero
- **THEN** seller A SHALL see "25%" for art and seller B SHALL see "30%" for art
