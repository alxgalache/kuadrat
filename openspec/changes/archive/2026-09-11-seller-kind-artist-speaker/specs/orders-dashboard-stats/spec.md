# orders-dashboard-stats (MODIFIED)

## MODIFIED Requirements

### Requirement: Dynamic commission percentage in Monedero
The Monedero page (`/seller/monedero`) SHALL display both commission percentages dynamically using the
**authenticated seller's** rates returned by `GET /api/seller/wallet`
(`commissionRateArt`, `commissionRateOther`), NOT from the
`NEXT_PUBLIC_DEALER_COMMISSION_ART` / `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`
environment variables.

The commission line SHALL live with the balance it explains. It moves out of `/orders` along with the rest of the wallet block.

#### Scenario: Commission text reflects the seller's rates
- **WHEN** the authenticated seller's `dealer_commission_art` is `15` and `dealer_commission_other` is `10`
- **THEN** the Monedero page description text SHALL read "Se aplica una comisión del 15% en obras de arte y del 10% en otros productos sobre el total de las transacciones realizadas."

#### Scenario: Two sellers see their own rates
- **WHEN** seller A (`dealer_commission_art = 25`) and seller B (`dealer_commission_art = 30`) each open their Monedero
- **THEN** seller A SHALL see "25%" for art and seller B SHALL see "30%" for art

#### Scenario: The commission line is not on the orders page
- **WHEN** a seller opens `/orders`
- **THEN** the commission description text SHALL NOT be rendered there

### Requirement: Real balance display in Monedero
The Monedero page (`/seller/monedero`) SHALL display the seller's actual balance fetched from the `GET /api/seller/wallet` endpoint, instead of a hardcoded value.

#### Scenario: Balance reflects server value
- **WHEN** the seller's combined wallet balance in the database is `150.50`
- **THEN** the Monedero page SHALL display `150.50 €` as the total available for withdrawal

#### Scenario: Zero balance display
- **WHEN** the seller's combined wallet balance is `0`
- **THEN** the Monedero page SHALL display `0.00 €`
- **AND** the payout button SHALL be disabled

## ADDED Requirements

### Requirement: The orders page is about orders

`/orders` SHALL carry a single heading, about orders, and SHALL contain only the date filter, the stat cards and the list of orders.

The page carried TWO `<h1>` elements: «Monedero» at the top and «Gestión de pedidos» below the wallet block — one screen answering two unrelated questions under two different names, reached from a menu entry that named only the second. Removing the wallet block leaves «Gestión de pedidos» in place, which is the accurate heading and needs no new copy. Splitting the two is what allows a seller with no products to still see and collect their money.

The page SHALL keep being rendered for artists only; it is not offered to speakers, whose order list is empty by construction.

#### Scenario: One heading, about orders
- **WHEN** an artist opens `/orders` from the «Pedidos» menu entry
- **THEN** the page SHALL render exactly one `<h1>`, reading «Gestión de pedidos»
- **AND** no heading SHALL read «Monedero»

#### Scenario: Stats and list are unchanged
- **WHEN** an artist opens `/orders`
- **THEN** the stat cards, the date filter and the order list SHALL behave exactly as before this change
