## ADDED Requirements

### Requirement: Order count stat card
The stats section SHALL display a "Número de pedidos" card showing the count of orders for the logged-in seller, filtered by the currently selected date range. This card SHALL replace the former "Disponible para retirar" card.

#### Scenario: Order count with week filter
- **WHEN** the seller views stats with "Esta semana" filter selected
- **THEN** the "Número de pedidos" card SHALL display the count of orders containing the seller's items created within the current week

#### Scenario: Order count with "all" filter
- **WHEN** the seller views stats with "Todos" filter selected
- **THEN** the "Número de pedidos" card SHALL display the total count of all orders containing the seller's items

#### Scenario: Order count comparison badge
- **WHEN** the date filter is not "Todos"
- **THEN** the "Número de pedidos" card SHALL display a comparison badge showing the percentage change relative to the previous period

### Requirement: Stat card info tooltips
Each stat card in the "Gestión de pedidos" section SHALL have an information icon (ℹ) next to its title. Clicking the icon SHALL display a tooltip with an explanatory description of the stat.

#### Scenario: Info icon displays tooltip on click
- **WHEN** the seller clicks the information icon next to a stat card title
- **THEN** a tooltip SHALL appear with a Spanish-language description explaining what that metric represents

#### Scenario: Tooltip content for "Número de pedidos"
- **WHEN** the seller clicks the info icon on the "Número de pedidos" card
- **THEN** the tooltip SHALL explain that this is the number of orders containing the seller's products in the selected time period

#### Scenario: Tooltip content for "Total de ventas"
- **WHEN** the seller clicks the info icon on the "Total de ventas" card
- **THEN** the tooltip SHALL explain that this is the total revenue from sales after commission deduction in the selected time period

#### Scenario: Tooltip content for "Total sin comisión"
- **WHEN** the seller clicks the info icon on the "Total sin comisión" card
- **THEN** the tooltip SHALL explain that this is the sum of the subtotal of the filtered orders list for the logged-in seller

#### Scenario: Tooltip content for "Pendiente de confirmación"
- **WHEN** the seller clicks the info icon on the "Pendiente de confirmación" card
- **THEN** the tooltip SHALL explain that this is the amount from orders that have been paid/sent/arrived but not yet confirmed by the buyer

### Requirement: Total sin comisión stat card
The stats section SHALL display a "Total sin comisión" card showing the sum of the subtotal of the filtered orders list for the logged-in seller. This card SHALL replace the former "Total retirado" card.

#### Scenario: Total sin comisión calculation
- **WHEN** the seller views stats with a date filter applied
- **THEN** the "Total sin comisión" card SHALL display the sum of the subtotal without commission of all orders matching the filter

### Requirement: Remove "Disponible para retirar" stat card
The "Disponible para retirar" stat card SHALL be removed from the stats section, as this information is now displayed exclusively in the "Monedero" section.

#### Scenario: Stat card no longer present
- **WHEN** the seller views the orders dashboard
- **THEN** there SHALL be no stat card with the title "Disponible para retirar"

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
