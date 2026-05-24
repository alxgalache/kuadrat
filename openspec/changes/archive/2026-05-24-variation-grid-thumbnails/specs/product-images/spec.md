## MODIFIED Requirements

### Requirement: Publish form supports up to 3 global images with add/remove controls

The `/seller/publish` form SHALL allow the seller to upload between 0 and 3 global product images, with the following conditional minimum:

- When `productCategory === 'art'`: the first global image (`imageSlots[0]`) is REQUIRED.
- When `productCategory === 'other'` AND "Este producto tiene variaciones" is NOT checked: the first global image is REQUIRED.
- When `productCategory === 'other'` AND "Este producto tiene variaciones" IS checked: the first global image is OPTIONAL. The seller MAY submit with zero global images.

The first image dropzone SHALL always be present on screen. Below the last present dropzone, the form SHALL render a button labeled "Añadir otra imagen" while fewer than 3 dropzones are visible. Each dropzone beyond the first SHALL render a small red remove control below it that, when clicked, removes that dropzone and its associated image. The dropzone at index 0 SHALL NEVER render a remove button.

The helper text under the global images section SHALL adapt to the mode:
- When the first image is REQUIRED (art, or other-without-variations): `"Puedes añadir hasta {MAX_PRODUCT_IMAGES} imágenes. La primera es obligatoria."` (unchanged).
- When the first image is OPTIONAL (other-with-variations): `"Opcional cuando el producto tiene variaciones con imagen propia. Hasta {MAX_PRODUCT_IMAGES} imágenes."`.

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

#### Scenario: Form submit sends all uploaded images (art product)
- **WHEN** the seller submits an `art` product with 3 global images
- **THEN** the request SHALL include 3 files under the `images` multipart field, in dropzone order

#### Scenario: Preview column reflects upload order
- **WHEN** the seller has uploaded 3 images
- **THEN** the right-column preview SHALL render the 3 previews stacked vertically in the same order as the dropzones

#### Scenario: Art product requires first global image
- **WHEN** the seller submits an `art` product with zero global images
- **THEN** the form SHALL block submission with the validation error `{ field: 'images', message: 'La primera imagen del producto es obligatoria' }`

#### Scenario: Others product without variations requires first global image
- **WHEN** the seller selects `productCategory = 'other'`, leaves "Este producto tiene variaciones" unchecked, and submits with zero global images
- **THEN** the form SHALL block submission with the validation error `{ field: 'images', message: 'La primera imagen del producto es obligatoria' }`

#### Scenario: Others product with variations does NOT require global images
- **WHEN** the seller selects `productCategory = 'other'`, checks "Este producto tiene variaciones", fills every variation with at least one image, and submits with zero global images
- **THEN** the form SHALL NOT raise the "first image is required" validation
- **AND** the form SHALL successfully submit the `POST /api/others` request with zero files under the `images` field

#### Scenario: Helper text reflects optional mode
- **WHEN** the seller selects `productCategory = 'other'` and checks "Este producto tiene variaciones"
- **THEN** the helper text under "Imagen para el listado de productos" SHALL read `"Opcional cuando el producto tiene variaciones con imagen propia. Hasta {MAX_PRODUCT_IMAGES} imágenes."`
- **WHEN** the seller unchecks "Este producto tiene variaciones"
- **THEN** the helper text SHALL revert to `"Puedes añadir hasta {MAX_PRODUCT_IMAGES} imágenes. La primera es obligatoria."`

### Requirement: API response shape exposes images array

The endpoints listed below SHALL return an `images` array on each product (and on each variation, where applicable) with `[{ id, basename, position }]` items ordered by `position ASC, id ASC`.

Endpoints affected:
- `GET /api/art` (list), `GET /api/art/:id` (detail), `GET /api/art/author/:slug`
- `GET /api/others` (list), `GET /api/others/:id` (detail), `GET /api/others/author/:slug`
- Seller dashboard: `GET /api/seller/art`, `GET /api/seller/others`
- Admin endpoints that surface products (admin product approval, admin product preview)

Additionally, each row in a list response SHALL include a top-level convenience field `thumbnail_basename` equal to `images[0]?.basename ?? null`, so that grid/list consumers don't need to dereference into the array.

For `others` product list endpoints (`GET /api/others`, `GET /api/others/author/:slug`, `GET /api/seller/others`), the `thumbnail_basename` SHALL fall back to the first variation's first image when the product itself has no global images. The fallback rule is: `thumbnail_basename = images[0]?.basename ?? variation_thumbnails[0]?.basename ?? null`. This guarantees that grid consumers always have a renderable basename when at least one image exists anywhere on the product (global or per-variation).

Detail endpoints (`GET /api/others/:id`) do NOT apply the fallback to `thumbnail_basename` — the detail page consumes the full `product.images[]` and `product.variations[i].images[]` arrays directly.

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

#### Scenario: Others list — thumbnail_basename falls back to first variation image
- **WHEN** `GET /api/others?page=1` returns an `others` product that has zero global images but whose first variation (by `other_vars.id ASC`) has at least one image with basename `<X>`
- **THEN** the response SHALL include `images: []`, `variation_thumbnails: [{ id: <varId>, key: <varKey>, basename: <X> }, ...]`, and `thumbnail_basename: <X>`

#### Scenario: Others list — no fallback needed
- **WHEN** `GET /api/others?page=1` returns an `others` product that has at least one global image with basename `<G>` and also variations with images
- **THEN** `thumbnail_basename` SHALL equal `<G>` (the first global image), NOT the first variation's image

## ADDED Requirements

### Requirement: Others list endpoints include variation_thumbnails

The endpoints `GET /api/others`, `GET /api/others/author/:slug`, and `GET /api/seller/others` SHALL include a `variation_thumbnails` array on each product. Each entry SHALL have shape `{ id: <other_vars.id>, key: <other_vars.key>, basename: <first image basename> }`. The array SHALL be ordered by `other_vars.id ASC`.

Only variations that have at least one image in `product_images` (joined on `product_type='other_var', product_id=<var.id>`) SHALL appear in the array. Variations with no images SHALL be omitted. Products with no named variations (anonymous single variation, `key IS NULL`) SHALL receive `variation_thumbnails: []`.

The lookup SHALL execute as a single batched query per response page (not N+1), using `other_vars.other_id IN (?, ?, ...)` with the page's product IDs.

#### Scenario: Product with two variations, each with images
- **WHEN** `GET /api/others?page=1` returns a product with variations `[{ id: 10, key: 'Rojo' }, { id: 11, key: 'Azul' }]`, each having at least one `product_images` row
- **THEN** the response SHALL include `variation_thumbnails: [{ id: 10, key: 'Rojo', basename: '<r>' }, { id: 11, key: 'Azul', basename: '<b>' }]`

#### Scenario: Product without named variations
- **WHEN** `GET /api/others?page=1` returns a product with a single anonymous variation (`key IS NULL`)
- **THEN** the response SHALL include `variation_thumbnails: []`

#### Scenario: Variation with no images is omitted
- **WHEN** a product has variations `[{ id: 20, key: 'A', images: 1 }, { id: 21, key: 'B', images: 0 }]`
- **THEN** the response SHALL include `variation_thumbnails: [{ id: 20, key: 'A', basename: '<a>' }]` (B is omitted)

#### Scenario: Detail endpoint does not include variation_thumbnails
- **WHEN** `GET /api/others/:id` is called
- **THEN** the response SHALL NOT include `variation_thumbnails` (the detail page consumes `product.variations[i].images[]` directly)

#### Scenario: One batched query per page
- **WHEN** `GET /api/others?page=1` returns 12 products
- **THEN** the controller SHALL execute exactly one extra query to populate `variation_thumbnails` for the entire page, using `WHERE other_id IN (...)` with all 12 product IDs
