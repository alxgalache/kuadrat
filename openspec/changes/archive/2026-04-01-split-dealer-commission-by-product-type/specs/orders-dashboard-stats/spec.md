## MODIFIED Requirements

### Requirement: Dynamic commission percentage in Monedero
The Monedero section SHALL display both commission percentages dynamically from the `NEXT_PUBLIC_DEALER_COMMISSION_ART` and `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` environment variables instead of a single value from `NEXT_PUBLIC_DEALER_COMMISSION`.

#### Scenario: Commission text reflects both environment variables
- **WHEN** `NEXT_PUBLIC_DEALER_COMMISSION_ART` is set to `15` and `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` is set to `10`
- **THEN** the Monedero description text SHALL read "Se aplica una comisión del 15% en obras de arte y del 10% en otros productos sobre el total de las transacciones realizadas."

#### Scenario: Default values when variables are not set
- **WHEN** `NEXT_PUBLIC_DEALER_COMMISSION_ART` and `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` are not defined
- **THEN** the Monedero description text SHALL use `15` as the default for both values
