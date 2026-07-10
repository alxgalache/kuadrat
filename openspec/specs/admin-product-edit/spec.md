# admin-product-edit

Admin-only full editing of art and others products: entry actions in the admin author products table, an edit form identical to the seller publish form pre-populated from current product data, and backend update endpoints covering fields, images, and variations.

### Requirement: Admin edit action in the author products table

The admin author detail page (`/admin/authors/[id]`) SHALL display a full-edit action for every product row, both `art` and `others`, using the pencil icon, linking to the admin product edit page for that product. For `others` rows, the pre-existing stock/variations modal action SHALL remain available but SHALL use a distinct non-pencil icon (stock/variations-themed) with title "Editar stock y variaciones".

#### Scenario: Edit action on an art product

- **WHEN** an admin views the products table of an author and a row is of type `art`
- **THEN** the row shows a pencil edit action linking to `/admin/products/<id>/edit?type=art`
- **AND** no stock/variations modal action is shown for that row

#### Scenario: Edit and variations actions on an others product

- **WHEN** an admin views the products table of an author and a row is of type `others`
- **THEN** the row shows a pencil edit action linking to `/admin/products/<id>/edit?type=others`
- **AND** the row shows a separate stock/variations action with a non-pencil icon that opens the existing variations modal unchanged

### Requirement: Admin product edit page

The system SHALL provide an admin-only page at `/admin/products/[id]/edit?type=art|others` that renders the same product form as the seller publish page, pre-populated with the product's current data: name, description, price, type/soporte (art), weight, dimensions, checkboxes (`for_auction`, `ai_generated`, and `can_copack` for others), existing images, and — for others — global stock or named variations with their images. The product category selector SHALL NOT allow changing the product's type. The page SHALL be protected by admin role guard on the client and admin authentication on every API call it makes.

#### Scenario: Form pre-populated for an art product

- **WHEN** an admin opens `/admin/products/<id>/edit?type=art` for an existing art product
- **THEN** the form fields display the product's current values and its existing images appear in the image slots as previews

#### Scenario: Form pre-populated for an others product with variations

- **WHEN** an admin opens `/admin/products/<id>/edit?type=others` for a product with named variations
- **THEN** the variations mode is active and each variation row shows its current key, stock, and existing images

#### Scenario: Non-admin access rejected

- **WHEN** a non-admin user requests the edit page or its backing endpoints
- **THEN** access is denied (client-side guard redirect; API returns an authorization error)

### Requirement: Publish flow remains unchanged

The seller publish page (`/seller/publish`) SHALL retain exactly its current appearance, validations, submit behavior, success flow, and API calls after the form is extracted into a shared component.

#### Scenario: Seller creates a product after the refactor

- **WHEN** a seller fills and submits the publish form
- **THEN** the product is created via the same public create endpoints with the same payloads, validation messages, success notification, and redirect as before this change

### Requirement: Admin full-update endpoints

The system SHALL expose admin-only endpoints `PUT /api/admin/art/:id` and `PUT /api/admin/others/:id` accepting the same multipart field structure as the corresponding creation endpoints, plus image manifests describing kept existing images and their order. Updates SHALL apply the same field validation rules as creation. The endpoints SHALL NOT modify the product's `slug` or `status`.

#### Scenario: Successful art product update

- **WHEN** an admin submits valid changes to an art product's name, price, and description
- **THEN** the `art` row is updated with the new values, `slug` and `status` remain unchanged, and the response returns the updated product

#### Scenario: Validation failure on update

- **WHEN** an admin submits an update with a description shorter than 100 characters
- **THEN** the endpoint responds with the same validation error structure and Spanish message used by the creation endpoint, and no changes are persisted

#### Scenario: Rename keeps public URL stable

- **WHEN** an admin changes a product's name
- **THEN** the product's `slug` is not regenerated and existing public product URLs keep resolving

### Requirement: Image reconciliation on edit

On update, the system SHALL reconcile product images against a client-provided manifest of kept existing basenames plus newly uploaded files, preserving the 1..3 images limit and per-file validation (PNG/JPG/WEBP, minimum 600×600). Existing images absent from the manifest SHALL be removed from `product_images` and their files deleted from storage after the database update succeeds. Final `position` values SHALL match the manifest order. Manifest basenames that do not belong to the product SHALL be rejected.

#### Scenario: Replace one image and keep another

- **WHEN** an admin keeps the first existing image, removes the second, and uploads a new file in its place
- **THEN** after saving, the product has the kept image at position 0 and the new image at position 1, and the removed image's row and storage file are deleted

#### Scenario: Foreign basename rejected

- **WHEN** the manifest references a basename not registered to this product
- **THEN** the update is rejected with a validation error and nothing is persisted

#### Scenario: Required first image enforced

- **WHEN** an admin removes all global images from an art product and submits
- **THEN** the form blocks submission with the same "first image required" validation as creation

### Requirement: Variation reconciliation on edit

For `others` products, the update endpoint SHALL reconcile variations by `id`: payload entries carrying an existing variation `id` are updated (key, stock, images), entries without `id` are inserted, and existing variations missing from the payload are deleted together with their variation images (rows and storage files). Per-variation images follow the same manifest reconciliation and 1..3 limits as global images, with the first image required for each named variation.

#### Scenario: Add, edit, and remove variations in one save

- **WHEN** an admin renames variation A, adds a new variation B with an image, and removes variation C
- **THEN** after saving, A has the new key, B exists with its uploaded image, and C and its images are deleted

#### Scenario: Switching from global stock to variations

- **WHEN** an admin enables variations on a product that previously had only global stock and defines a named variation with an image
- **THEN** the product's variations are replaced accordingly, matching the same rules the creation endpoint applies to variation payloads

### Requirement: Edit data endpoint

The system SHALL expose an admin-only endpoint `GET /api/admin/products/:id/edit-data?type=art|others` returning the full product row with hydrated `images` and, for others, `variations` each hydrated with their images, plus the seller's commission rates for the net-earnings preview.

#### Scenario: Edit data for an others product

- **WHEN** an admin requests edit data for an existing others product
- **THEN** the response contains the product fields, ordered `images` with basenames, all variations with their `id`, key, stock and ordered images, and the seller's `other` commission rate

#### Scenario: Product not found

- **WHEN** an admin requests edit data for a non-existent or removed product id
- **THEN** the endpoint responds 404 with a Spanish error message
