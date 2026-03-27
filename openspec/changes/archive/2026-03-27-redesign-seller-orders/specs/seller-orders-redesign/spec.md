## ADDED Requirements

### Requirement: Orders grouped by order_id in API response

The `GET /api/seller/orders` endpoint SHALL return orders grouped by `order_id` instead of flat individual items. Each order object SHALL contain an `items` array with all the seller's products in that order. Items with the same `(product_type, product_id, variant_id)` SHALL be aggregated with a `quantity` count.

#### Scenario: Seller has multiple items in one order
- **WHEN** a seller has 3 art items and 2 other items (same variant) in order #1023
- **THEN** the response contains one order object with `orderId: 1023` and an `items` array with 3 art entries (quantity 1 each) and 1 other entry (quantity 2)

#### Scenario: Seller has items across multiple orders
- **WHEN** a seller has items in orders #1023, #1024, and #1025
- **THEN** the response contains 3 separate order objects, each with their respective items

### Requirement: Orders sorted by creation date descending

The `GET /api/seller/orders` endpoint SHALL return orders sorted by the order's `created_at` timestamp in descending order (newest first).

#### Scenario: Multiple orders with different creation dates
- **WHEN** the seller has orders created on March 25, March 20, and March 15
- **THEN** the orders appear in the response in order: March 25, March 20, March 15

### Requirement: Pagination by orders

The `GET /api/seller/orders` endpoint SHALL paginate by order count (not by item count). The `pagination.total` field SHALL reflect the total number of distinct orders, and `pagination.totalPages` SHALL be calculated based on orders.

#### Scenario: 25 orders with limit 20
- **WHEN** the seller has 25 orders and requests page 1 with limit 20
- **THEN** the response contains 20 orders, with `pagination: { page: 1, limit: 20, total: 25, totalPages: 2 }`

### Requirement: Status filter applies to all items in order

The `GET /api/seller/orders?status=paid` endpoint SHALL return orders where all of the seller's items in that order match the given status.

#### Scenario: Filter by paid status
- **WHEN** the seller filters by `status=paid` and all items in order #1023 have status 'paid'
- **THEN** order #1023 appears in the response

#### Scenario: All statuses tab
- **WHEN** no status filter is provided
- **THEN** all orders are returned regardless of item statuses

### Requirement: Seller config included in response

The `GET /api/seller/orders` response SHALL include a `sellerConfig` object at the top level containing the seller's `firstMile` value and `defaultAddress` fields from `user_sendcloud_configuration`.

#### Scenario: Seller has sendcloud configuration
- **WHEN** the seller has a record in `user_sendcloud_configuration` with `first_mile='pickup'` and a complete sender address
- **THEN** the response includes `sellerConfig.firstMile: 'pickup'` and `sellerConfig.defaultAddress` with all address fields

#### Scenario: Seller has no sendcloud configuration
- **WHEN** the seller has no record in `user_sendcloud_configuration`
- **THEN** the response includes `sellerConfig: null`

### Requirement: Order response includes variant information

For "others" type products, each item in the order response SHALL include a `variantName` field from the `other_vars` table. For "art" type products, `variantName` SHALL be null.

#### Scenario: Order with others product variants
- **WHEN** an order contains 2 units of "Camiseta" variant "Talla M" and 1 unit of "Camiseta" variant "Talla L"
- **THEN** the items array contains two entries: one with `variantName: "Talla M", quantity: 2` and another with `variantName: "Talla L", quantity: 1`

### Requirement: Order response includes pickup status

Each order object in the response SHALL include a `pickup` field. If a pickup exists in `sendcloud_pickups` for that `(order_id, seller_id)`, it SHALL contain `{ id, status, createdAt }`. Otherwise, it SHALL be null.

#### Scenario: Order with scheduled pickup
- **WHEN** order #1023 has a record in `sendcloud_pickups` with status 'ANNOUNCING'
- **THEN** the order object includes `pickup: { id: 294, status: 'ANNOUNCING', createdAt: '...' }`

#### Scenario: Order without pickup
- **WHEN** order #1023 has no record in `sendcloud_pickups`
- **THEN** the order object includes `pickup: null`

### Requirement: Page layout uses max-w-7xl

The seller orders page SHALL use the `max-w-7xl` container width class, consistent with all other admin and seller pages in the application.

#### Scenario: Page renders at standard width
- **WHEN** the seller navigates to `/seller/pedidos`
- **THEN** the page content container uses `max-w-7xl px-4 py-16 sm:px-6 lg:px-8`

### Requirement: Order card displays product images in horizontal row

Each order card SHALL display product images in a horizontal scrollable row at the top of the card. Each image SHALL show a quantity badge (circle with number) in the top-left corner. The variant name SHALL appear below each image (or with a translucent white background overlay at the bottom of the image, falling back to below the image if text length is an issue).

#### Scenario: Order with multiple products
- **WHEN** order #1023 has 3 products: Art A (qty 1), Others B variant M (qty 2), Others B variant L (qty 1)
- **THEN** three product images are displayed horizontally, with badges showing "1", "2", and "1" respectively, and variant names "Talla M" and "Talla L" shown for the Others products

#### Scenario: Many products overflow horizontally
- **WHEN** an order has 10+ distinct products
- **THEN** the product images row is horizontally scrollable

### Requirement: Order card displays order information

Below the product images row, each order card SHALL display order metadata: creation date/time formatted in Spanish (e.g., "Pedido realizado el 25 de Marzo de 2026 a las 17:47") and the delivery address.

#### Scenario: Order with full delivery address
- **WHEN** order #1023 was created on 2026-03-25T17:47:00 with delivery to "Paseo del Rector Esperabe 18 2B, 37008, Salamanca, ES"
- **THEN** the card shows "Pedido realizado el 25 de Marzo de 2026 a las 17:47. Direccion de entrega: Paseo del Rector Esperabe 18 2B, 37008, Salamanca, Espana"

### Requirement: Order card displays action buttons in horizontal row

Below the order information, each order card SHALL display action buttons in a uniform horizontal row. Available actions: "Descargar etiqueta" (if sendcloud_shipment_id exists), "Ver seguimiento" (if sendcloud_tracking_url exists), and "Programar recogida" (conditionally visible per pickup requirements). All buttons SHALL share the same visual style.

#### Scenario: Order with shipment and tracking
- **WHEN** order items have sendcloud_shipment_id and sendcloud_tracking_url
- **THEN** both "Descargar etiqueta" and "Ver seguimiento" buttons appear in a horizontal row with consistent styling

#### Scenario: Order in paid status with pickup-eligible seller
- **WHEN** order status is 'paid', seller's firstMile is 'pickup' or null/empty, and no pickup exists
- **THEN** "Programar recogida" button also appears alongside other action buttons

### Requirement: Status badge on order card

Each order card SHALL display a single status badge using the status of any one item (all items of the same seller in the same order are assumed to share the same status).

#### Scenario: Order with all items paid
- **WHEN** all seller items in order #1023 have status 'paid'
- **THEN** the card shows a "Pagado" badge with yellow styling
