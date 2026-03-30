## ADDED Requirements

### Requirement: Admin seller shipments page

The system SHALL provide an admin page at `/admin/envios-seller` for viewing any seller's shipments in read-only mode.

#### Scenario: Page requires admin authentication
- **WHEN** a non-admin user navigates to `/admin/envios-seller`
- **THEN** the system SHALL redirect them away (AuthGuard with `requireRole="admin"`)

#### Scenario: Initial state with no seller selected
- **WHEN** the admin navigates to `/admin/envios-seller` without selecting a seller
- **THEN** the page SHALL display a seller dropdown at the top and an empty state message: "Selecciona un vendedor para ver sus envíos"

### Requirement: Seller selector dropdown

The page SHALL display a dropdown at the top populated with all sellers/artists.

#### Scenario: Dropdown populated with sellers
- **WHEN** the page loads
- **THEN** the dropdown SHALL list all users with role='seller', showing their full name and email, sorted alphabetically by name

#### Scenario: Seller selection loads shipments
- **WHEN** the admin selects a seller from the dropdown
- **THEN** the page SHALL load and display that seller's shipments using the same card layout as the seller's own "Mis envíos" page

### Requirement: Status tabs

The page SHALL display status filter tabs identical to the seller's page.

#### Scenario: Tab options
- **WHEN** a seller is selected
- **THEN** the page SHALL display tabs: "Todos", "Pagados", "Enviados", "Entregados", "Confirmados"

#### Scenario: Tab filtering
- **WHEN** the admin clicks a status tab
- **THEN** the shipments list SHALL filter to show only orders with that status

#### Scenario: Tab resets on seller change
- **WHEN** the admin selects a different seller
- **THEN** the active tab SHALL reset to "Todos" and page SHALL reset to 1

### Requirement: Order cards display

Each order card SHALL display the same information as the seller's page but without action buttons.

#### Scenario: Card content
- **WHEN** shipments are displayed
- **THEN** each order card SHALL show: product image thumbnails with quantity badges, variant names, order date, delivery address, carrier name ("Empresa de envío: ..."), order ID, and status badge

#### Scenario: No action buttons
- **WHEN** order cards are displayed for admin
- **THEN** the cards SHALL NOT display any of: "Descargar etiqueta", "Programar recogida", "Consultar puntos de entrega" buttons

#### Scenario: No bulk actions bar
- **WHEN** the admin is viewing the "Pagados" tab
- **THEN** no bulk action buttons ("Programar recogida masiva", "Consultar puntos de entrega") SHALL be displayed

### Requirement: Pagination

The page SHALL support pagination identical to the seller's page.

#### Scenario: Pagination controls
- **WHEN** a seller has more orders than fit on one page
- **THEN** "Anterior" and "Siguiente" buttons with page indicator SHALL be displayed

### Requirement: Admin seller shipments API endpoint

The system SHALL provide a `GET /api/admin/orders/seller-shipments` endpoint.

#### Scenario: Returns seller shipments
- **WHEN** an authenticated admin calls `GET /api/admin/orders/seller-shipments?sellerId=X`
- **THEN** the response SHALL return the same data structure as `GET /api/seller/orders` (orders array with items, pagination, sellerConfig) but for the specified seller

#### Scenario: Supports status filter
- **WHEN** the admin calls with `?sellerId=X&status=paid`
- **THEN** the response SHALL only include orders with that status

#### Scenario: Supports pagination
- **WHEN** the admin calls with `?sellerId=X&page=2&limit=20`
- **THEN** the response SHALL return the appropriate page of results

#### Scenario: Missing sellerId returns error
- **WHEN** the admin calls without a `sellerId` parameter
- **THEN** the system SHALL return a 400 error

#### Scenario: Invalid sellerId returns empty
- **WHEN** the admin calls with a `sellerId` that doesn't match any seller
- **THEN** the response SHALL return an empty orders array

### Requirement: Navigation link

The admin navigation menu SHALL include a link to the seller shipments page.

#### Scenario: Desktop menu link
- **WHEN** the admin opens the navigation popover on desktop
- **THEN** "Envíos vendedor" SHALL appear as a link to `/admin/envios-seller`

#### Scenario: Mobile menu link
- **WHEN** the admin opens the mobile navigation menu
- **THEN** "Envíos vendedor" SHALL appear as a link to `/admin/envios-seller`
