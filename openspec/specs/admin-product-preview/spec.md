## ADDED Requirements

### Requirement: Admin preview API endpoint
The system SHALL provide a `GET /api/admin/products/:id/preview?type=art|others` endpoint that returns the full product data from the `art` or `others` table regardless of `status`, `visible`, or `is_sold` values. The endpoint MUST be protected by admin authentication. For `others` products, the response MUST include variations from `other_vars`.

#### Scenario: Preview a pending art product
- **WHEN** admin requests `GET /api/admin/products/42/preview?type=art`
- **THEN** the response contains the full product row from the `art` table joined with seller info (`seller_full_name`, `seller_slug`), even if `status = 'pending'` and `visible = 0`

#### Scenario: Preview an others product with variations
- **WHEN** admin requests `GET /api/admin/products/15/preview?type=others`
- **THEN** the response contains the full product row from the `others` table with seller info, plus a `variations` array from `other_vars`

#### Scenario: Invalid or missing type parameter
- **WHEN** admin requests `GET /api/admin/products/42/preview` without a `type` query parameter, or with an invalid value
- **THEN** the response is 400 with an error message

#### Scenario: Product not found
- **WHEN** admin requests a preview for a non-existent product ID
- **THEN** the response is 404

### Requirement: Admin preview page renders product as public detail page
The system SHALL provide a page at `/admin/products/[id]/preview` (with `type` query param) that renders the product using the same visual layout as the public product detail pages. The page MUST be wrapped in `AuthGuard` with `requireRole="admin"`. Cart functionality (add/remove) MUST be disabled — the page is read-only preview.

#### Scenario: Art product preview page
- **WHEN** admin navigates to `/admin/products/42/preview?type=art`
- **THEN** the page displays the art product image (1:1 square), name, price, description, support type, author name, and AI-generated badge (if applicable) — identical to the public `/galeria/p/[id]` layout, but without cart buttons

#### Scenario: Others product preview page
- **WHEN** admin navigates to `/admin/products/15/preview?type=others`
- **THEN** the page displays the product image, name, price, description, author, AI-generated badge, and variations selector — identical to the public `/tienda/p/[id]` layout, but without cart buttons

#### Scenario: Unauthenticated or non-admin access
- **WHEN** a non-admin user or unauthenticated visitor tries to access the preview page
- **THEN** access is denied by `AuthGuard`

### Requirement: Preview link in new product notification email
The `sendNewProductNotificationEmail` function MUST accept the product ID and product type as additional parameters. The email body MUST include a direct link to the admin preview page (`{CLIENT_URL}/admin/products/{id}/preview?type={productType}`).

#### Scenario: Art product notification includes preview link
- **WHEN** a seller creates an art product with ID 42
- **THEN** the notification email sent to the admin includes a clickable link to `/admin/products/42/preview?type=art`

#### Scenario: Others product notification includes preview link
- **WHEN** a seller creates an others product with ID 15
- **THEN** the notification email sent to the admin includes a clickable link to `/admin/products/15/preview?type=others`

### Requirement: Preview button in admin author products table
The products table on the admin author detail page (`/admin/authors/[id]`) MUST include a preview icon button for each product that links to the admin preview page.

#### Scenario: Clicking preview on an art product
- **WHEN** admin clicks the preview button on an art product row
- **THEN** they are navigated to `/admin/products/{id}/preview?type=art`

#### Scenario: Clicking preview on an others product
- **WHEN** admin clicks the preview button on an others product row
- **THEN** they are navigated to `/admin/products/{id}/preview?type=others`
