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

#### Scenario: Tooltip content for "Total retirado"
- **WHEN** the seller clicks the info icon on the "Total retirado" card
- **THEN** the tooltip SHALL explain that this is the total amount withdrawn by the seller in the selected time period

#### Scenario: Tooltip content for "Pendiente de confirmación"
- **WHEN** the seller clicks the info icon on the "Pendiente de confirmación" card
- **THEN** the tooltip SHALL explain that this is the amount from orders that have been paid/sent/arrived but not yet confirmed by the buyer

### Requirement: Remove "Disponible para retirar" stat card
The "Disponible para retirar" stat card SHALL be removed from the stats section, as this information is now displayed exclusively in the "Monedero" section.

#### Scenario: Stat card no longer present
- **WHEN** the seller views the orders dashboard
- **THEN** there SHALL be no stat card with the title "Disponible para retirar"

### Requirement: Dynamic commission percentage in Monedero
The Monedero section SHALL display the commission percentage dynamically from the `NEXT_PUBLIC_DEALER_COMMISSION` environment variable instead of a hardcoded value.

#### Scenario: Commission text reflects environment variable
- **WHEN** `NEXT_PUBLIC_DEALER_COMMISSION` is set to `20`
- **THEN** the Monedero description text SHALL read "Se aplica una comisión del 20% sobre el total de las transacciones realizadas"

### Requirement: Real balance display in Monedero
The Monedero section SHALL display the seller's actual `available_withdrawal` balance fetched from the `GET /api/seller/wallet` endpoint, instead of a hardcoded value.

#### Scenario: Balance reflects server value
- **WHEN** the seller's `available_withdrawal` in the database is `150.50`
- **THEN** the Monedero section SHALL display "150.50 EUR disponible para retirada a tu cuenta"

#### Scenario: Zero balance display
- **WHEN** the seller's `available_withdrawal` is `0`
- **THEN** the Monedero section SHALL display "0.00 EUR disponible para retirada a tu cuenta"
