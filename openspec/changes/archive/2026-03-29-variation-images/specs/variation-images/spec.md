## ADDED Requirements

### Requirement: Variation image upload in publish form

The publish form SHALL display an image upload field for each variation row when the seller enables "Este producto tiene variaciones". Each variation row SHALL contain: name input, stock input, and image upload input. The main product image field SHALL always be visible and required, with label "Imagen para el listado de productos".

#### Scenario: Seller creates product without variations
- **WHEN** the seller does not check "Este producto tiene variaciones"
- **THEN** the form SHALL show only the main product image upload (labeled "Imagen para el listado de productos") and the global stock field, with no per-variation image inputs

#### Scenario: Seller creates product with variations
- **WHEN** the seller checks "Este producto tiene variaciones"
- **THEN** each variation row SHALL display a name input, stock input, and image upload field
- **AND** the main product image field SHALL remain visible and required

#### Scenario: Seller adds a new variation row
- **WHEN** the seller clicks "Agregar variación"
- **THEN** a new variation row SHALL appear with empty name, stock, and image fields

#### Scenario: Seller removes a variation row
- **WHEN** the seller removes a variation row
- **THEN** the row and its associated image preview SHALL be removed from the form

### Requirement: Variation image validation

Each variation image SHALL be validated with the same rules as the main product image: PNG, JPG, or WEBP format; maximum 10MB file size; minimum 600x600 pixel dimensions.

#### Scenario: Variation image with invalid format
- **WHEN** the seller uploads a non-PNG/JPG/WEBP file for a variation
- **THEN** the system SHALL reject the upload and display an error message

#### Scenario: Variation image too small
- **WHEN** the seller uploads an image smaller than 600x600 pixels for a variation
- **THEN** the system SHALL reject the upload and display an error message

#### Scenario: Missing variation image on submit
- **WHEN** the seller submits the form with variations enabled but a variation row has no image
- **THEN** the system SHALL display a validation error for the missing variation image

### Requirement: Backend variation image storage

The backend SHALL accept per-variation images via the `variation_images` field in multipart form data. Each variation image SHALL be stored in `uploads/others/` with a UUID-based filename. The `other_vars` table SHALL store the image basename in a `basename` column.

#### Scenario: Product created with variation images
- **WHEN** the backend receives a create request with `image` (main) and `variation_images` (per-variation)
- **THEN** the system SHALL save the main image to `others.basename` and each variation image to the corresponding `other_vars.basename`

#### Scenario: Product created without variations
- **WHEN** the backend receives a create request with only `image` (no `variation_images`)
- **THEN** the system SHALL save the main image to `others.basename` and the single `other_vars` row SHALL have `basename` as NULL

### Requirement: Variation image display on detail page

The product detail page SHALL display the selected variation's image when the variation has a basename. When the variation has no basename, the detail page SHALL fall back to the main product image.

#### Scenario: Buyer views product with variation images
- **WHEN** a buyer selects a variation that has its own image
- **THEN** the detail page SHALL display that variation's image

#### Scenario: Buyer switches between variations
- **WHEN** a buyer changes the selected variation in the dropdown
- **THEN** the displayed image SHALL update to show the newly selected variation's image

#### Scenario: Variation without its own image
- **WHEN** a buyer selects a variation that has no basename (NULL)
- **THEN** the detail page SHALL display the main product image (`product.basename`)

### Requirement: Image file cleanup on hard delete

When a product is hard-deleted, the system SHALL delete the main product image file and all variation image files from disk.

#### Scenario: Hard delete product with variation images
- **WHEN** an "others" product with variation images is hard-deleted
- **THEN** the system SHALL delete `others.basename` file and all `other_vars.basename` files from `uploads/others/`
- **AND** if a file deletion fails, the system SHALL log the error but not block the database deletion

#### Scenario: Hard delete product without variation images
- **WHEN** an "others" product without variation images is hard-deleted
- **THEN** the system SHALL delete only the `others.basename` file from `uploads/others/`

### Requirement: Variation images not editable after creation

The VariationEditModal (used from the seller products list) SHALL NOT allow image upload or modification. Only variation name and stock SHALL be editable.

#### Scenario: Seller opens variation edit modal
- **WHEN** the seller opens the "Editar variaciones" modal for a product with variation images
- **THEN** the modal SHALL show name and stock fields only, with no image upload capability
