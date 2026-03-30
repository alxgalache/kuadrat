## ADDED Requirements

### Requirement: Global service points lookup button

The system SHALL provide a "Consultar puntos de entrega" button above the orders list in the "Pagados" tab that opens a modal for looking up service points by carrier.

#### Scenario: Button visibility
- **WHEN** the seller is viewing the "Pagados" tab and there are orders with a carrier code
- **THEN** the "Consultar puntos de entrega" button SHALL be displayed above the orders list

#### Scenario: Button hidden when no carriers available
- **WHEN** the seller is viewing the "Pagados" tab but no orders have a carrier code
- **THEN** the "Consultar puntos de entrega" button SHALL NOT be displayed

#### Scenario: Button hidden on other tabs
- **WHEN** the seller is viewing any tab other than "Pagados"
- **THEN** the bulk "Consultar puntos de entrega" button SHALL NOT be displayed

### Requirement: Carrier selection for service points

The global service points modal SHALL display a carrier dropdown as its first step.

#### Scenario: Carrier dropdown populated from current orders
- **WHEN** the global service points modal opens
- **THEN** the carrier dropdown SHALL list unique carrier codes from the visible paid orders

#### Scenario: Carrier display format
- **WHEN** carrier codes are shown in the dropdown
- **THEN** they SHALL be displayed with underscores replaced by spaces and capitalized (e.g., `correos_express` → "Correos Express")

### Requirement: Service points view after carrier selection

After selecting a carrier, the modal SHALL display the same service points view as the per-order ServicePointsInfoModal.

#### Scenario: Service points view rendered
- **WHEN** the seller selects a carrier in the dropdown
- **THEN** the modal SHALL display the postal code search input, map, and service points list, using the same logic and layout as ServicePointsInfoModal

#### Scenario: Initial postal code from first matching order
- **WHEN** a carrier is selected
- **THEN** the postal code input SHALL be pre-filled with the postal code from the delivery address of the first paid order matching that carrier

#### Scenario: Full service point interaction
- **WHEN** the service points view is displayed
- **THEN** the seller SHALL be able to search by postal code, click map markers, and view opening times — identical to the per-order service points modal
