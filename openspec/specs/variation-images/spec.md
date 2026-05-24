### Requirement: Variation image upload in publish form

The publish form SHALL display a multi-image upload widget for each variation row when the seller enables "Este producto tiene variaciones". Each variation row SHALL contain: name input, stock input, and a multi-image uploader supporting 0..3 images. The main product image field SHALL always be visible and require at least 1 image, with label "Imagen para el listado de productos".

The variation row's uploader SHALL start with a single image slot. When that slot is filled, a small "Añadir otra imagen" affordance SHALL appear to add a second slot (up to a maximum of 3 slots). Slots beyond the first SHALL render a small red remove control to remove that slot and its image. Variation images are OPTIONAL — a variation row may submit with zero images and still be valid.

#### Scenario: Seller creates product without variations
- **WHEN** the seller does not check "Este producto tiene variaciones"
- **THEN** the form SHALL show only the main product image upload (labeled "Imagen para el listado de productos") and the global stock field, with no per-variation image inputs

#### Scenario: Seller creates product with variations
- **WHEN** the seller checks "Este producto tiene variaciones"
- **THEN** each variation row SHALL display a name input, stock input, and multi-image upload widget (0..3 images)
- **AND** the main product image field SHALL remain visible and require at least one image

#### Scenario: Seller adds a new variation row
- **WHEN** the seller clicks "Agregar variación"
- **THEN** a new variation row SHALL appear with empty name, stock, and zero image slots seeded by one empty slot

#### Scenario: Seller removes a variation row
- **WHEN** the seller removes a variation row
- **THEN** the row and all its associated image previews SHALL be removed from the form

#### Scenario: Seller uploads multiple images to a variation
- **WHEN** a variation has one filled image slot and the seller clicks the variation's "Añadir otra imagen" control
- **THEN** a second image slot SHALL appear with its own red remove control
- **AND** after reaching 3 filled slots, the variation's "Añadir otra imagen" control SHALL no longer be rendered

#### Scenario: Seller submits with zero variation images
- **WHEN** the seller submits the form with variations enabled but no variation has any image uploaded
- **THEN** the system SHALL accept the submission (variation images are optional)

### Requirement: Variation image validation

Each variation image SHALL be validated with the same rules as the main product image: PNG, JPG, or WEBP format; maximum 10MB file size; minimum 600x600 pixel dimensions. Validation SHALL be enforced both client-side at upload time and server-side at submit time. Server-side validation errors SHALL identify the offending field as `variation_<i>_images[<j>]` where `<i>` is the variation index and `<j>` is the image slot index.

#### Scenario: Variation image with invalid format
- **WHEN** the seller uploads a non-PNG/JPG/WEBP file for a variation
- **THEN** the system SHALL reject the upload and display an error message identifying the variation and image slot

#### Scenario: Variation image too small
- **WHEN** the seller uploads an image smaller than 600x600 pixels for a variation
- **THEN** the system SHALL reject the upload and display an error message identifying the variation and image slot

### Requirement: Backend variation image storage

The backend SHALL accept per-variation images via the `variation_<i>_images` multipart fields, where `<i>` is the zero-based index of the variation in the submitted `variations` array. Each variation image SHALL be stored in `uploads/others/` (or the `others/` prefix in S3) with a UUID-based filename. The image association SHALL be persisted as a row in `product_images` with `product_type = 'other_var'` and `product_id` equal to the corresponding `other_vars.id`. Position within the variation SHALL be assigned in upload-order (0, 1, 2).

The `other_vars` table SHALL NOT contain a `basename` column. Variation images are read from `product_images` joined on `(product_type='other_var', product_id=other_vars.id)`.

#### Scenario: Product created with variation images for multiple variations
- **WHEN** the backend receives a create request with `images` (1..3 global), and `variation_0_images` (1..3) and `variation_1_images` (1..3)
- **THEN** the system SHALL insert one `product_images` row per uploaded global file with `product_type='other'` and `product_id=<others.id>`
- **AND** insert one `product_images` row per uploaded variation file with `product_type='other_var'` and `product_id=<other_vars.id>` for the matching variation
- **AND** assign `position` 0, 1, 2 within each group in upload order

#### Scenario: Product created with some variations missing images
- **WHEN** the backend receives a request where variation 0 has 2 images and variation 1 has 0 images
- **THEN** the system SHALL insert 2 `product_images` rows for variation 0 (`product_type='other_var', product_id=<id0>`)
- **AND** insert 0 rows for variation 1
- **AND** the request SHALL succeed

#### Scenario: Product created without variations
- **WHEN** the backend receives a create request with only `images` (no variation fields), creating a single anonymous variation
- **THEN** the system SHALL insert `product_images` rows only with `product_type='other'`
- **AND** the single `other_vars` row SHALL have no associated `product_images` rows

### Requirement: Variation image display on detail page

The product detail page SHALL display variation images inside the shared `ProductImageCarousel`. When the selected variation has at least one image, the carousel images SHALL be `[...selectedVariant.images, ...product.images]` and the carousel SHALL start at index 0 (first variation image). When the selected variation has no images, the carousel SHALL show only `product.images`. Changing the selected variation SHALL reset the carousel to index 0.

#### Scenario: Buyer views product with variation images
- **WHEN** a buyer selects a variation that has its own images
- **THEN** the detail page carousel SHALL show the variation's images first, then the product's global images, starting at the first variation image

#### Scenario: Buyer switches between variations
- **WHEN** a buyer changes the selected variation in the dropdown
- **THEN** the carousel SHALL reset to index 0 and display the first image of the new variation (or the first global image if the new variation has no images)

#### Scenario: Variation without its own images
- **WHEN** a buyer selects a variation that has no images
- **THEN** the carousel SHALL show only the product's global images, starting at index 0

### Requirement: Image file cleanup on hard delete

When a product is hard-deleted, the system SHALL delete every `product_images` row associated with the product (`product_type='other', product_id=<id>`) and every `product_images` row associated with any of its variations (`product_type='other_var', product_id IN (<var ids>)`), and SHALL delete the corresponding files from `uploads/others/` (or the `others/` prefix in S3).

#### Scenario: Hard delete product with variation images
- **WHEN** an "others" product with global images and variation images is hard-deleted
- **THEN** the system SHALL delete all `product_images` rows for that product and its variations
- **AND** SHALL delete all corresponding files from `uploads/others/`
- **AND** if a file deletion fails, the system SHALL log the error but not block the database deletion

#### Scenario: Hard delete product without variation images
- **WHEN** an "others" product with global images but no variation images is hard-deleted
- **THEN** the system SHALL delete only the global-image `product_images` rows and their files
