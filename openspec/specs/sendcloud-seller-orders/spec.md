## ADDED Requirements

### Requirement: Seller orders page

The system SHALL provide a seller-facing page at `/seller/pedidos/` showing all orders containing the seller's products, with status, tracking, and label access.

#### Scenario: Seller views their orders
- **WHEN** an authenticated seller navigates to `/seller/pedidos/`
- **THEN** the page SHALL display a list of orders containing their products, sorted by most recent first

#### Scenario: Order item details displayed
- **WHEN** order items are displayed
- **THEN** each item SHALL show: product name, product image thumbnail, quantity (for others), sale price, order date, current status, and buyer name

#### Scenario: Carrier name displayed on order card
- **WHEN** an order has items with a `sendcloudCarrierCode` set
- **THEN** the order card SHALL display "Empresa de envío: {carrier name}" below the delivery address, with the carrier code formatted as capitalized words (e.g., `correos_express` → "Correos Express")

#### Scenario: No carrier info on order card
- **WHEN** an order has no items with a `sendcloudCarrierCode`
- **THEN** the carrier line SHALL NOT be displayed on the order card

#### Scenario: Global actions bar in Pagados tab
- **WHEN** the seller is viewing the "Pagados" tab
- **THEN** a row of global action buttons ("Programar recogida", "Consultar puntos de entrega") SHALL be displayed between the tab bar and the orders list, subject to their individual visibility conditions

#### Scenario: Sendcloud tracking info displayed
- **WHEN** an order item has `sendcloud_shipment_id` set
- **THEN** the item SHALL display: carrier name, tracking number, a link to the tracking URL, and current status

#### Scenario: Label download available
- **WHEN** an order item has a Sendcloud shipment with a generated label
- **THEN** a "Descargar etiqueta" button SHALL be displayed that downloads the shipping label PDF

#### Scenario: Status is read-only for Sendcloud items
- **WHEN** an order item is managed by Sendcloud (has `sendcloud_shipment_id`)
- **THEN** the seller SHALL NOT be able to manually change the status (status is updated via webhooks)

#### Scenario: Auto-confirm countdown displayed
- **WHEN** an order item has status `arrived` and is Sendcloud-managed
- **THEN** the page SHALL display the date when auto-confirmation will occur (e.g., "Confirmación automática: 1 abr 2026")

### Requirement: Seller orders API endpoint

The system SHALL provide a `GET /api/seller/orders` endpoint that returns orders containing the authenticated seller's products.

#### Scenario: Returns seller's order items
- **WHEN** an authenticated seller calls `GET /api/seller/orders`
- **THEN** the response SHALL include all art_order_items and other_order_items where the product's `seller_id` matches the authenticated user, joined with order info (order date, buyer name) and Sendcloud tracking fields

#### Scenario: Pagination support
- **WHEN** the seller has many orders
- **THEN** the endpoint SHALL support pagination via `?page=1&limit=20` query parameters

#### Scenario: Status filter
- **WHEN** the seller calls `GET /api/seller/orders?status=sent`
- **THEN** the response SHALL only include order items with the specified status

### Requirement: Label download API endpoint

The system SHALL provide a `GET /api/seller/orders/:itemType/:itemId/label` endpoint that returns the Sendcloud shipping label for a specific order item.

#### Scenario: Seller downloads their own label
- **WHEN** an authenticated seller requests the label for an order item that belongs to their products
- **THEN** the system SHALL retrieve the label from Sendcloud and return it as a PDF

#### Scenario: Seller cannot access other sellers' labels
- **WHEN** a seller requests the label for an order item belonging to a different seller
- **THEN** the system SHALL return a 403 error

#### Scenario: No label available
- **WHEN** a seller requests the label for an order item without a `sendcloud_shipment_id`
- **THEN** the system SHALL return a 404 error

### Requirement: Admin shipping pages conditional visibility

The legacy admin shipping configuration pages SHALL be hidden when Sendcloud is active for the relevant product type.

#### Scenario: Hide shipping method management when Sendcloud active
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and `SENDCLOUD_ENABLED_OTHERS` is `true`
- **THEN** the admin navigation SHALL hide or disable the `/admin/envios/` section and display a notice that shipping is managed by Sendcloud

#### Scenario: Show legacy pages when Sendcloud partially active
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` but `SENDCLOUD_ENABLED_OTHERS` is `false`
- **THEN** the admin shipping pages SHALL remain accessible (needed for managing legacy others shipping) but display a notice that art shipping is managed by Sendcloud
