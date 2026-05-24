## MODIFIED Requirements

### Requirement: Variation image upload in publish form

The publish form SHALL display a multi-image upload widget for each variation row when the seller enables "Este producto tiene variaciones". Each variation row SHALL contain: name input (`key`), stock input, and a multi-image uploader supporting 1..3 images. The first image slot of every variation is REQUIRED — submission SHALL be blocked while any active variation lacks an image in slot 0.

The main product image field SHALL always be visible. Its requirement is now conditional (see the `product-images` spec): required for `art` and for `other`-without-variations; optional for `other`-with-variations.

The variation row's uploader SHALL start with a single empty image slot. After that slot is filled, a small "Añadir otra imagen" affordance SHALL appear to add a second slot (up to a maximum of 3 slots). Slots beyond the first SHALL render a small red remove control to remove that slot and its image.

The helper text under each variation's image slots SHALL read `"Imágenes (obligatoria al menos 1, hasta {MAX_PRODUCT_IMAGES})"` (changed from the previous `"Imágenes (opcional, hasta {MAX_PRODUCT_IMAGES})"`).

#### Scenario: Seller creates product without variations
- **WHEN** the seller does not check "Este producto tiene variaciones"
- **THEN** the form SHALL show only the main product image upload (labeled "Imagen para el listado de productos") and the global stock field, with no per-variation image inputs
- **AND** the main product image SHALL be required

#### Scenario: Seller creates product with variations
- **WHEN** the seller checks "Este producto tiene variaciones"
- **THEN** each variation row SHALL display a name input, stock input, and a multi-image upload widget (1..3 images, with slot 0 required)
- **AND** the main product image SHALL become optional

#### Scenario: Seller adds a new variation row
- **WHEN** the seller clicks "Agregar variación"
- **THEN** a new variation row SHALL appear with empty name, empty stock, and one empty image slot

#### Scenario: Seller removes a variation row
- **WHEN** the seller removes a variation row
- **THEN** the row and all its associated image previews SHALL be removed from the form
- **AND** any object URLs for that row's previews SHALL be revoked

#### Scenario: Seller uploads multiple images to a variation
- **WHEN** a variation has one filled image slot and the seller clicks the variation's "Añadir otra imagen" control
- **THEN** a second image slot SHALL appear with its own red remove control
- **AND** after reaching 3 filled slots, the variation's "Añadir otra imagen" control SHALL no longer be rendered

#### Scenario: Seller submits with a variation missing its first image
- **WHEN** the seller enables variations and submits with one variation whose slot 0 is empty
- **THEN** the form SHALL block submission with a validation error of the form `{ field: 'variations[<i>].images', message: 'La variación <key|index+1> debe tener al menos una imagen' }`

#### Scenario: Seller submits with every variation having at least one image
- **WHEN** the seller enables variations, every variation has at least one image in slot 0, and the global image section is empty
- **THEN** the form SHALL accept the submission and `POST /api/others` SHALL be called with zero files under `images` and one or more files under each `variation_<i>_images`

### Requirement: Backend variation image storage

The backend SHALL accept per-variation images via the `variation_<i>_images` multipart fields, where `<i>` is the zero-based index of the variation in the submitted `variations` array. Each variation image SHALL be stored in `uploads/others/` (or the `others/` prefix in S3) with a UUID-based filename. The image association SHALL be persisted as a row in `product_images` with `product_type = 'other_var'` and `product_id` equal to the corresponding `other_vars.id`. Position within the variation SHALL be assigned in upload-order (0, 1, 2).

The `other_vars` table SHALL NOT contain a `basename` column. Variation images are read from `product_images` joined on `(product_type='other_var', product_id=other_vars.id)`.

**Validation rules (per-variation minimum):**
- If the submitted `variations` payload contains AT LEAST ONE entry with `key !== null` (i.e., the seller declared named variations), the backend SHALL require AT LEAST ONE file per such variation under `variation_<i>_images`. Missing images SHALL be rejected with `{ field: 'variation_<i>_images[0]', message: 'La variación <key> debe tener al menos una imagen' }`.
- If the submitted `variations` payload contains AT LEAST ONE entry with `key !== null`, the backend SHALL NOT require any files under the global `images` field. Zero global images is accepted in this mode.
- If ALL entries in `variations` have `key === null` (single anonymous variation = "no variations" UI mode), the backend SHALL require ≥1 file under `images` (per the existing rule), and SHALL ignore any `variation_<i>_images` fields.

#### Scenario: Product created with variation images for multiple variations (no globals)
- **WHEN** the backend receives a create request with zero files under `images`, plus `variation_0_images` (2 files) and `variation_1_images` (1 file), and `variations = [{ key: 'Rojo', stock: 5 }, { key: 'Azul', stock: 3 }]`
- **THEN** the system SHALL insert 2 `product_images` rows for variation 0 (`product_type='other_var', product_id=<id0>`, `position` 0..1)
- **AND** insert 1 `product_images` row for variation 1 (`product_type='other_var', product_id=<id1>`, `position=0`)
- **AND** insert zero `product_images` rows with `product_type='other'`
- **AND** the response SHALL be 201 with the created product

#### Scenario: Product created with named variations but missing image on one variation
- **WHEN** the backend receives a create request with `variations = [{ key: 'A', stock: 1 }, { key: 'B', stock: 1 }]`, with `variation_0_images` containing 1 file and `variation_1_images` containing 0 files
- **THEN** the system SHALL reject the request with `{ field: 'variation_1_images[0]', message: 'La variación B debe tener al menos una imagen' }`
- **AND** SHALL NOT write any files or insert any rows

#### Scenario: Product created without variations (legacy single anonymous variation)
- **WHEN** the backend receives a create request with `images` containing 1 file, no `variation_<i>_images` fields, and `variations = [{ key: null, stock: 10 }]`
- **THEN** the system SHALL insert one `product_images` row with `product_type='other'`
- **AND** the single `other_vars` row (with `key IS NULL`) SHALL have no associated `product_images` rows
- **AND** the request SHALL succeed

#### Scenario: Product with named variations rejects empty globals when globals are not the source
- **WHEN** the backend receives a create request with `variations = [{ key: 'X', stock: 1 }]`, `variation_0_images` containing 1 file, and zero files under `images`
- **THEN** the system SHALL accept the request (no error on missing globals)

### Requirement: Variation image display on detail page

The product detail page SHALL display variation images inside the shared `ProductImageCarousel`. When the selected variation has at least one image, the carousel images SHALL be `[...selectedVariant.images, ...product.images]` and the carousel SHALL start at index 0 (first variation image). When the selected variation has no images, the carousel SHALL show only `product.images`. Changing the selected variation SHALL reset the carousel to index 0.

#### Scenario: Buyer views product with variation images
- **WHEN** a buyer selects a variation that has its own images
- **THEN** the detail page carousel SHALL show the variation's images first, then the product's global images, starting at the first variation image

#### Scenario: Buyer switches between variations
- **WHEN** a buyer changes the selected variation in the dropdown
- **THEN** the carousel SHALL reset to index 0 and display the first image of the new variation (or the first global image if the new variation has no images)

#### Scenario: Variation without its own images
- **WHEN** a buyer selects a variation that has no images (legacy pre-rule product)
- **THEN** the carousel SHALL show only the product's global images, starting at index 0

## ADDED Requirements

### Requirement: Product grid surfaces variation thumbnails for others products with 2+ variations

The `ProductGrid` component SHALL render a row of variation thumbnails overlaid on top of the product image when the product has `variation_thumbnails.length >= 2`. The row SHALL be absolutely positioned inside the square image area, anchored to the bottom-right corner, on top of the main image and on top of the image-area link.

The row SHALL contain, in order:
1. A leading non-interactive "+" badge — small (≈16-20px), circular, light translucent background (`bg-white/80`), containing a `PlusIcon`. The badge SHALL communicate "this product has variants" and SHALL NOT trigger any action when tapped. `aria-hidden="true"`.
2. One `<button type="button">` per entry in `product.variation_thumbnails`, in array order (which is `other_vars.id ASC`). Each button:
   - Renders the variation's first image at ≈24px square with `<Image width={24} height={24} sizes="24px">`.
   - Carries `title={variation.key}` for desktop tooltip and `aria-label={`Mostrar variación ${variation.key}`}` for accessibility.
   - On click, swaps the card's main displayed image to that variation's basename via local `useState`. The button SHALL call `e.stopPropagation()`.
   - SHALL NOT navigate (it is a `<button>`, not an `<a>`).

When the row is rendered, the buttons SHALL sit on a higher stacking level (`z-10`) than the image-area link so that taps on a thumbnail land on the button, while taps anywhere else on the image area land on the image link and navigate to the product detail page.

The card's displayed main image SHALL be derived as: `displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename ?? null`. The local `displayedBasename` SHALL reset to `null` on component remount (route change or refetch). It SHALL NOT persist across sessions or be reflected in the URL.

The product title SHALL navigate to the product detail page via its own `<Link>` (no shared absolute-overlay span across the card).

#### Scenario: Product with one variation does not render the row
- **WHEN** a grid card renders a product with `variation_thumbnails.length === 1`
- **THEN** the thumbnails row SHALL NOT be rendered
- **AND** the card SHALL render the main image and the title link as today

#### Scenario: Product with no variation_thumbnails does not render the row
- **WHEN** a grid card renders an `art` product (no `variation_thumbnails` field), or an `other` product with `variation_thumbnails: []`
- **THEN** the thumbnails row SHALL NOT be rendered

#### Scenario: Product with 2+ variations renders the row
- **WHEN** a grid card renders an `other` product with `variation_thumbnails = [{ id: 1, key: 'Rojo', basename: 'r.jpg' }, { id: 2, key: 'Azul', basename: 'b.jpg' }]`
- **THEN** the thumbnails row SHALL render with a leading "+" badge followed by 2 thumbnail buttons, anchored to the bottom-right corner of the image area
- **AND** the main image SHALL show `product.thumbnail_basename` (= the first variation's image when the product has no globals, per the `product-images` fallback rule)

#### Scenario: Buyer taps a thumbnail to swap the main image
- **WHEN** the buyer taps the second thumbnail (key "Azul", basename "b.jpg")
- **THEN** the card's main image SHALL update to display "b.jpg"
- **AND** the browser SHALL NOT navigate
- **AND** the URL SHALL remain unchanged

#### Scenario: Buyer taps the main image
- **WHEN** the buyer taps anywhere on the image area NOT covered by a thumbnail or the "+" badge
- **THEN** the browser SHALL navigate to the product detail page (`{baseRoute}/p/{slug}`)

#### Scenario: Buyer taps the product title
- **WHEN** the buyer taps the product title
- **THEN** the browser SHALL navigate to the product detail page

#### Scenario: Desktop tooltip on thumbnail hover
- **WHEN** the buyer hovers a thumbnail with a pointer device
- **THEN** the browser SHALL display the native tooltip with text equal to the variation's `key`

#### Scenario: Selection resets on grid remount
- **WHEN** the buyer has swapped a card's main image to variation B, then navigates away and back to the grid
- **THEN** the card SHALL display its `thumbnail_basename` (server-computed) as the main image, NOT the previously swapped variation

#### Scenario: Touch tap precedence
- **WHEN** a user on a touch device taps directly on a thumbnail
- **THEN** the button SHALL receive the tap (not the underlying image link) due to z-index ordering
- **AND** the main image SHALL swap

#### Scenario: Keyboard navigation through the card
- **WHEN** a user tabs through the page
- **THEN** focus SHALL land on the image-area link first, then each thumbnail button in order, then the title link
- **AND** pressing Enter on a thumbnail SHALL swap the main image (not navigate)
