## ADDED Requirements

### Requirement: Admin can approve pending products via API
The system SHALL provide an admin-only endpoint `PUT /api/admin/products/:id/status` that updates the `status` column of a product in the `art` or `others` table to `"approved"`. The request body MUST include `product_type` (`"art"` or `"others"`) and `status` (`"approved"`). The endpoint MUST verify the product exists and is not soft-deleted (`removed = 0`). The endpoint MUST return a success message upon update.

#### Scenario: Approve a pending art product
- **WHEN** admin sends `PUT /api/admin/products/42/status` with body `{ "product_type": "art", "status": "approved" }`
- **THEN** the system updates `art.status` to `"approved"` where `id = 42` and returns `{ title: "Producto aprobado", message: "El estado del producto ha sido actualizado a aprobado" }`

#### Scenario: Approve a pending others product
- **WHEN** admin sends `PUT /api/admin/products/15/status` with body `{ "product_type": "others", "status": "approved" }`
- **THEN** the system updates `others.status` to `"approved"` where `id = 15` and returns a success message

#### Scenario: Product not found
- **WHEN** admin sends approval request for a non-existent or soft-deleted product
- **THEN** the system returns HTTP 404 with message "Producto no encontrado"

#### Scenario: Invalid product type
- **WHEN** admin sends a request with missing or invalid `product_type`
- **THEN** the system returns HTTP 400 with message "Tipo de producto inválido"

### Requirement: Admin preview page shows approve button for pending products
The admin product preview page SHALL display an "Aprobar" button when the product's `status` is `"pending"`. The button MUST call the approval API endpoint and update the UI on success. The button SHALL NOT appear when the product is already approved.

#### Scenario: Pending product shows approve button
- **WHEN** admin views the preview of a product with `status = "pending"`
- **THEN** an "Aprobar" button is visible in the preview banner area

#### Scenario: Approved product hides approve button
- **WHEN** admin views the preview of a product with `status = "approved"`
- **THEN** no approve button is shown

#### Scenario: Admin clicks approve
- **WHEN** admin clicks the "Aprobar" button on a pending product preview
- **THEN** the system calls the approval endpoint, shows a success notification, and updates the displayed status

### Requirement: Hide variant selector for single-variant others products
The `OthersProductDetail` component SHALL hide the variant `<select>` dropdown when the product has only one variation. The single variant MUST still be auto-selected internally so that add-to-cart functionality works unchanged. When the product has more than one variation, the selector MUST be shown as before.

#### Scenario: Product with one variation
- **WHEN** a buyer views an "others" product detail page for a product with exactly one variation
- **THEN** no variant selector dropdown is shown, and the single variant is auto-selected

#### Scenario: Product with multiple variations
- **WHEN** a buyer views an "others" product detail page for a product with two or more variations
- **THEN** the variant selector dropdown is shown with all options, functioning as before
