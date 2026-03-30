## MODIFIED Requirements

### Requirement: Order item details displayed

Each order card SHALL display the carrier name below the delivery address, and the "Pagados" tab SHALL include global action buttons above the orders list.

#### Scenario: Carrier name displayed on order card
- **WHEN** an order has items with a `sendcloudCarrierCode` set
- **THEN** the order card SHALL display "Empresa de envío: {carrier name}" below the delivery address, with the carrier code formatted as capitalized words (e.g., `correos_express` → "Correos Express")

#### Scenario: No carrier info on order card
- **WHEN** an order has no items with a `sendcloudCarrierCode`
- **THEN** the carrier line SHALL NOT be displayed on the order card

#### Scenario: Global actions bar in Pagados tab
- **WHEN** the seller is viewing the "Pagados" tab
- **THEN** a row of global action buttons ("Programar recogida", "Consultar puntos de entrega") SHALL be displayed between the tab bar and the orders list, subject to their individual visibility conditions
