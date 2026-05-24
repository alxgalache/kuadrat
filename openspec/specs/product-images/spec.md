### Requirement: Polymorphic product_images table

The system SHALL store every product image (art products, others products, and other_vars variations) in a single `product_images` table keyed by a polymorphic `(product_type, product_id)` pair. The `basename` columns on `art`, `others`, and `other_vars` SHALL NOT exist.

The table schema SHALL include: `id` (PK), `product_type` (TEXT, CHECK IN `'art'`, `'other'`, `'other_var'`), `product_id` (INTEGER), `basename` (TEXT, NOT NULL, globally unique), `position` (INTEGER, NOT NULL, default 0), `created_at` (DATETIME, default CURRENT_TIMESTAMP). Indexes: `(product_type, product_id, position)` and a unique index on `basename`.

#### Scenario: Schema initialization creates product_images
- **WHEN** `initializeDatabase()` runs on a fresh database
- **THEN** the system SHALL create the `product_images` table with the polymorphic columns and required indexes
- **AND** the system SHALL NOT include a `basename` column in the `art`, `others`, or `other_vars` `CREATE TABLE` statements

#### Scenario: Inserting an image for an art product
- **WHEN** a row is inserted into `product_images` with `product_type = 'art'`, `product_id = <art.id>`, a unique `basename`, and `position = 0`
- **THEN** the insert SHALL succeed and the row SHALL be retrievable via `(product_type, product_id)` lookup

#### Scenario: Inserting an image for a variation
- **WHEN** a row is inserted with `product_type = 'other_var'` and `product_id = <other_vars.id>`
- **THEN** the insert SHALL succeed and SHALL belong only to that variation, not to the parent `others` product

#### Scenario: Invalid product_type rejected
- **WHEN** a row is inserted with `product_type = 'others'` (plural) or any value outside the CHECK set
- **THEN** the database SHALL reject the insert

#### Scenario: Duplicate basename rejected
- **WHEN** a row is inserted with a `basename` that already exists in any other row
- **THEN** the unique index SHALL reject the insert

### Requirement: Up to 3 images per product or variation

The system SHALL accept and store up to 3 image rows per `(product_type, product_id)` pair. Attempts to insert more than 3 images for the same pair during product creation SHALL be rejected with a validation error.

The 3-image cap applies independently to: each art product, each others product (its global images), and each variation of an others product.

#### Scenario: Creating an art product with 1, 2, or 3 images
- **WHEN** the seller submits a `POST /api/art` request with 1, 2, or 3 image files
- **THEN** the system SHALL create one `product_images` row per uploaded file with `position` 0, 1, 2 in upload order

#### Scenario: Creating an art product with 0 images
- **WHEN** the seller submits a `POST /api/art` request with no image files
- **THEN** the system SHALL reject the request with a validation error indicating at least one image is required

#### Scenario: Creating an others product with 3 global images and 3 images on each of 2 variations
- **WHEN** the seller submits a `POST /api/others` request with 3 files under `images` and 3 files under each of `variation_0_images` and `variation_1_images`
- **THEN** the system SHALL create 3 + 3 + 3 = 9 rows in `product_images` (3 with `product_type='other'`, 3 with `product_type='other_var'` for each variation), with `position` 0..2 within each group

#### Scenario: Attempt to create more than 3 images
- **WHEN** the seller submits a request with 4 or more files for any image field
- **THEN** the multer middleware SHALL reject the upload before reaching the controller

### Requirement: Multi-file upload endpoints

The endpoints `POST /api/art` and `POST /api/others` SHALL accept multi-image uploads via multer field naming:
- `images`: array of up to 3 files for the global product images (replaces the legacy single `image` field).
- `variation_<i>_images`: array of up to 3 files for the variation at zero-based index `<i>`, present only for `POST /api/others`.

Each uploaded file SHALL be validated for MIME type (PNG/JPG/WEBP), file size (≤ 10MB), and minimum dimensions (600×600 px). Validation errors SHALL be returned together with explicit field names (e.g., `images[1]`, `variation_0_images[2]`).

#### Scenario: Successful upload writes files and rows
- **WHEN** a valid multipart request is received with 2 global images and 1 variation image
- **THEN** the system SHALL write all 3 files to the appropriate storage (S3 `art/` or `others/` prefix, or local `uploads/art/` / `uploads/others/`)
- **AND** the system SHALL insert one `product_images` row per file with the correct `(product_type, product_id, position, basename)`

#### Scenario: One invalid file rolls back everything
- **WHEN** the request contains 2 valid global images and 1 oversized image
- **THEN** the system SHALL return a 400 with validation errors enumerated per offending field
- **AND** the system SHALL NOT create the product row, the `product_images` rows, or write any files to storage

#### Scenario: DB error after files written triggers cleanup
- **WHEN** all files are written successfully but the `INSERT INTO art` / `INSERT INTO others` query fails
- **THEN** the system SHALL delete all just-written files from storage before re-raising the error

### Requirement: API response shape exposes images array

The endpoints listed below SHALL return an `images` array on each product (and on each variation, where applicable) with `[{ id, basename, position }]` items ordered by `position ASC, id ASC`.

Endpoints affected:
- `GET /api/art` (list), `GET /api/art/:id` (detail), `GET /api/art/author/:slug`
- `GET /api/others` (list), `GET /api/others/:id` (detail), `GET /api/others/author/:slug`
- Seller dashboard: `GET /api/seller/art`, `GET /api/seller/others`
- Admin endpoints that surface products (admin product approval, admin product preview)

Additionally, each row in a list response SHALL include a top-level convenience field `thumbnail_basename` equal to `images[0]?.basename ?? null`, so that grid/list consumers don't need to dereference into the array.

#### Scenario: Detail response carries full images array
- **WHEN** `GET /api/art/:id` is called for a product with 3 images
- **THEN** the response `product.images` SHALL be an array of length 3, ordered by `position ASC`

#### Scenario: Detail response for others includes per-variation images
- **WHEN** `GET /api/others/:id` is called for a product with 2 variations, where variation A has 2 images and variation B has 0 images
- **THEN** the response `product.variations[0].images` SHALL have length 2 and `product.variations[1].images` SHALL be an empty array `[]`

#### Scenario: List response includes thumbnail_basename
- **WHEN** `GET /api/art?page=1` is called
- **THEN** each product in the response SHALL include `thumbnail_basename` set to the first image's basename, or `null` if the product has no images

#### Scenario: Product with zero images
- **WHEN** any list or detail endpoint returns a product that has no rows in `product_images` (e.g., a legacy row that lost its images during the schema reset)
- **THEN** the response SHALL include `images: []` and `thumbnail_basename: null` without erroring

### Requirement: Image-serving endpoints stay basename-based

The endpoints `GET /api/art/images/:basename` and `GET /api/others/images/:basename` SHALL continue to serve image files by basename without modification. Files are written to disk/S3 under the `art/` directory when `product_type = 'art'` and under the `others/` directory when `product_type IN ('other','other_var')`.

#### Scenario: Art image served by basename
- **WHEN** `GET /api/art/images/<basename>` is called with a basename present on disk/S3
- **THEN** the system SHALL serve the file with the existing cache-control headers

#### Scenario: Variation image served by basename
- **WHEN** `GET /api/others/images/<basename>` is called with a basename that corresponds to a `product_type = 'other_var'` row
- **THEN** the system SHALL serve the file from the `others/` storage location (same physical bucket/directory as global others images)

### Requirement: Product detail page shows image carousel with prev/next buttons

Both `ArtProductDetail` (`/galeria/p/[id]`) and `OthersProductDetail` (`/tienda/p/[id]`) SHALL render the product image inside a shared `ProductImageCarousel` component that displays one image at a time in the same square frame as today. When the carousel has more than one image, two small round buttons SHALL be rendered INSIDE the image at the left and right edges, vertically centered, to navigate to the previous and next image.

The buttons SHALL NOT auto-rotate the image. The image SHALL change ONLY when the user clicks one of the buttons, or (for others products) when the user changes the selected variation.

#### Scenario: Art product with 1 image
- **WHEN** an art product with exactly 1 image is rendered
- **THEN** the carousel SHALL show the single image
- **AND** the carousel SHALL NOT render any navigation buttons

#### Scenario: Art product with 3 images, user navigates
- **WHEN** an art product with 3 images is rendered and the user clicks the right button
- **THEN** the carousel SHALL advance to image at index 1
- **AND** clicking right again SHALL advance to index 2
- **AND** clicking right again SHALL wrap around to index 0
- **AND** clicking left from index 0 SHALL wrap around to index 2

#### Scenario: No autoplay
- **WHEN** the carousel renders any product
- **THEN** the image SHALL NOT change automatically after any timeout; only user clicks or variation changes SHALL trigger transitions

#### Scenario: Carousel buttons are visually inside the image
- **WHEN** the carousel renders with more than one image
- **THEN** the prev and next buttons SHALL be absolutely positioned inside the image area at the left and right edges (small, round, with a light-on-dark or translucent background) and SHALL not extend beyond the image bounds

### Requirement: Others product carousel combines variation and global images

When `OthersProductDetail` renders, the carousel images SHALL be derived as follows:
- If a variation is selected and that variation has at least one image: carousel images = `[...selectedVariant.images, ...product.images]`.
- Otherwise (no variation selected, or selected variation has no images): carousel images = `product.images`.

When the user changes the selected variation, the carousel SHALL reset to index 0 (i.e., show the first image of the new variation, or the first global image if the new variation has none).

#### Scenario: Switching to a variation with images
- **WHEN** a buyer selects a variation that has 2 images while the carousel was showing a global image
- **THEN** the carousel SHALL reset to index 0
- **AND** the displayed image SHALL be the variation's first image

#### Scenario: Switching to a variation with no images
- **WHEN** a buyer selects a variation that has no images
- **THEN** the carousel SHALL show only the product's global images, starting at index 0

#### Scenario: Navigating across variation and global images
- **WHEN** a variation with 2 images is selected and the product has 3 global images, and the user clicks next from the first global image (index 2 in the combined list)
- **THEN** the carousel SHALL advance to index 3 (second global image), then to index 4, then wrap to index 0 (first variation image)

#### Scenario: Product with no variations selected
- **WHEN** an `others` product without named variations (single anonymous variation) is rendered
- **THEN** the carousel SHALL show only `product.images` and SHALL ignore the variation's images entirely

### Requirement: Publish form supports up to 3 global images with add/remove controls

The `/seller/publish` form SHALL allow the seller to upload between 1 and 3 global product images. The first image dropzone SHALL always be present and required. Below the last present dropzone, the form SHALL render a button labeled "Añadir otra imagen" while fewer than 3 dropzones are visible. Each dropzone beyond the first SHALL render a small red remove control below it that, when clicked, removes that dropzone and its associated image.

The right-column preview area SHALL render all uploaded images stacked vertically, in the upload order.

#### Scenario: Initial render
- **WHEN** the seller opens the publish form
- **THEN** the form SHALL render exactly one image dropzone and one "Añadir otra imagen" button below it
- **AND** the dropzone SHALL not show a remove button

#### Scenario: Adding a second and third dropzone
- **WHEN** the seller clicks "Añadir otra imagen" once
- **THEN** a second dropzone SHALL appear below the first, with a red remove button below it
- **WHEN** the seller clicks "Añadir otra imagen" again
- **THEN** a third dropzone SHALL appear with its own red remove button
- **AND** the "Añadir otra imagen" button SHALL NO LONGER be rendered

#### Scenario: Removing the second dropzone
- **WHEN** the form has 3 dropzones and the seller clicks the red remove button under dropzone index 1
- **THEN** dropzone index 1 SHALL be removed (its image preview disappears, dropzone 2 shifts to index 1)
- **AND** the "Añadir otra imagen" button SHALL re-appear

#### Scenario: First dropzone cannot be removed
- **WHEN** the form has 2 or 3 dropzones
- **THEN** the dropzone at index 0 SHALL NEVER render a red remove button

#### Scenario: Form submit sends all uploaded images
- **WHEN** the seller submits with 3 global images
- **THEN** the request SHALL include 3 files under the `images` multipart field, in dropzone order

#### Scenario: Preview column reflects upload order
- **WHEN** the seller has uploaded 3 images
- **THEN** the right-column preview SHALL render the 3 previews stacked vertically in the same order as the dropzones

### Requirement: Cart and order line items snapshot the primary image basename

When a buyer adds a product to the cart, the cart line item SHALL store the basename of the product's first image (or, for an `others` product with a selected variation that has its own images, the first image of that variation). Existing fields in the cart line item SHALL remain unchanged in name (the value is still called `basename`); only the source of the value changes.

When an order is created, the SQL queries that fetch product line item details SHALL fetch the basename via a subquery against `product_images` so that order emails, invoices, and order detail pages continue to render the product thumbnail without further code changes downstream.

#### Scenario: Art product added to cart
- **WHEN** a buyer clicks "Añadir a la cesta" on an art product whose `product.images[0].basename` is `<X>`
- **THEN** the cart context SHALL store `basename: <X>` in the new cart line item

#### Scenario: Others product with variation added to cart
- **WHEN** a buyer adds a variation that has images, with `selectedVariant.images[0].basename = <Y>`
- **THEN** the cart line item SHALL store `basename: <Y>`

#### Scenario: Others product with variation that has no images
- **WHEN** a buyer adds a variation with no images, where `product.images[0].basename = <Z>`
- **THEN** the cart line item SHALL store `basename: <Z>` (fallback to global product first image)

#### Scenario: Order emails render product thumbnails
- **WHEN** an order is created and the order confirmation email is sent
- **THEN** the email template SHALL render product thumbnails using the basename selected by the SQL subquery, with the same image URL format as today

### Requirement: All product listings render via images array or thumbnail_basename

Every UI surface that today renders a product image (galería grid, tienda grid, seller products list, admin products tables, admin product preview, admin orders, customer orders pages, cart drawer, auction product cards, draw product cards, payment receipt pages) SHALL read the image from either `product.thumbnail_basename` (for single-image surfaces) or `product.images[index]` (for the carousel on detail pages). Surfaces SHALL handle `thumbnail_basename = null` / `images = []` gracefully by rendering the existing `bg-gray-200` placeholder without throwing.

#### Scenario: Grid card with no image
- **WHEN** a product appears in a grid with `thumbnail_basename: null`
- **THEN** the card SHALL render the gray placeholder background without crashing

#### Scenario: Seller dashboard list
- **WHEN** the seller dashboard renders the list of products
- **THEN** each row SHALL render its `thumbnail_basename` if present, or the placeholder otherwise

### Requirement: Hard delete cleans up all product_images rows and files

When an art or others product is hard-deleted, the system SHALL delete every row in `product_images` belonging to that product (and, for others, every row belonging to its variations), and SHALL delete the corresponding files from storage. File-delete failures SHALL be logged but SHALL NOT abort the database deletion.

#### Scenario: Deleting an art product with 3 images
- **WHEN** `DELETE /api/art/:id` succeeds
- **THEN** all 3 rows in `product_images` with `product_type='art', product_id=<id>` SHALL be deleted
- **AND** all 3 files SHALL be deleted from S3 or `uploads/art/`

#### Scenario: Deleting an others product with global images and variation images
- **WHEN** `DELETE /api/others/:id` succeeds for a product with 2 global images and 2 variations carrying 1 and 3 images respectively
- **THEN** all 6 rows in `product_images` SHALL be deleted (2 with `product_type='other'`, 1 + 3 with `product_type='other_var'`)
- **AND** all 6 files SHALL be deleted from `others/` storage
- **AND** the `other_vars` rows SHALL be deleted as today

#### Scenario: One file delete fails
- **WHEN** deletion of one of the storage files fails
- **THEN** the system SHALL log the error with `logger.error` and SHALL continue deleting the remaining files and DB rows
- **AND** the API SHALL still respond with 204
