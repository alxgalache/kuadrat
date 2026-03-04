## ADDED Requirements

### Requirement: Total sin comisión stat card
The stats section SHALL display a "Total sin comisión" card showing the summation of the "Subtotal" column from the currently filtered orders list for the logged-in seller.

#### Scenario: Total sin comisión matches filtered list
- **WHEN** the seller views the orders dashboard and a specific time filter is applied
- **THEN** the "Total sin comisión" card SHALL display the sum of the `subtotal` property of all orders currently visible in the list

#### Scenario: Total sin comisión is updated when filters change
- **WHEN** the seller changes the time filter on the orders dashboard
- **THEN** the "Total sin comisión" card SHALL dynamically update its value based on the new filtered dataset

## MODIFIED Requirements

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
- **THEN** the tooltip SHALL explain that this is the total revenue from sales before applying the platform commission, matching the sum of subtotals in the list

#### Scenario: Tooltip content for "Pendiente de confirmación"
- **WHEN** the seller clicks the info icon on the "Pendiente de confirmación" card
- **THEN** the tooltip SHALL explain that this is the amount from orders that have been paid/sent/arrived but not yet confirmed by the buyer

## REMOVED Requirements

### Requirement: Total retirado stat card
**Reason**: Replaced by "Total sin comisión" card for clearer visibility into raw sales.
**Migration**: Use the "Total sin comisión" card in the UI.
