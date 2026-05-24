## Why

Today, every product (art and others) is limited to a single image stored in the `basename` column of its table, and each variation of an "others" product is limited to a single image in `other_vars.basename`. Sellers cannot showcase a piece from multiple angles or contexts, which hurts conversion on a visual marketplace. We want sellers to upload up to 3 images per product (and up to 3 per variation) and let buyers swipe through them on the product detail page.

This also requires refactoring image storage out of the entity tables into a dedicated polymorphic `product_images` table, which scales cleanly to N images per entity and decouples image lifecycle from product/variation rows.

## What Changes

- **BREAKING (DB schema)**: Replace the `basename` column on `art`, `others`, and `other_vars` with rows in a new `product_images` table. Polymorphic columns `product_type` (`'art' | 'others' | 'other_vars'`) and `product_id`, plus `basename` and an `position` ordering integer.
- **BREAKING (API responses)**: `GET /api/art/:id`, `GET /api/others/:id`, and list endpoints return an `images: [{ id, basename, position }]` array instead of a single `basename` field. Variations include their own `images` array.
- **BREAKING (API create)**: `POST /api/art` and `POST /api/others` accept up to 3 image files for the product (field `images[]` or `image_1..3`) and, for `others` with named variations, up to 3 images per variation. Variation images become optional (fallback to global product images when empty).
- **Product detail UI (galería + tienda)**: Both `ArtProductDetail` and `OthersProductDetail` show the same carousel: image fills the same square area, with two small round prev/next buttons overlaid on the left and right edges INSIDE the image. Buttons appear only when more than one image is available. Auto-rotation is NOT supported.
- **`others` carousel logic**: When a variation is selected, the carousel cycles through `[variation_images..., global_product_images...]`. If the selected variation has no images, the carousel shows only the global product images. Changing the variation via the select resets the carousel to the new variation's first image. Otherwise the image only changes via user clicks on prev/next.
- **Publish form (`/seller/publish`)**: Below the main image dropzone, add a "Añadir otra imagen" button that reveals additional dropzones (up to 3 total). Each extra dropzone has a red "Eliminar" button below it (the first one cannot be removed). Each variation row gets the same multi-image UX.
- **Right-column preview**: Show all uploaded global product images stacked vertically (in upload order). Each variation row keeps its compact inline previews next to the uploader.
- **No data migration**: Existing products will be re-seeded clean (acknowledged by product owner). `database.js` will simply drop the legacy `basename` columns from the `CREATE TABLE` statements and assume fresh state.
- **Out of scope**: There is no seller edit form for products; this change does not introduce one. Image URL helpers (`getArtImageUrl`, `getOthersImageUrl`) keep their basename-based contract; only the source of the basename changes.

## Capabilities

### New Capabilities
- `product-images`: Polymorphic storage of up to 3 images per product (art/others) and per variation, including the `product_images` table schema, the multi-file upload pipeline in `createArtProduct` / `createOthersProduct`, the API response shape (`images[]`), and the carousel UI on both product detail pages with prev/next navigation.

### Modified Capabilities
- `variation-images`: Per-variation images go from a single `basename` column to up to 3 entries in `product_images` with `product_type = 'other_vars'`. Variation images become **optional with fallback to global product images** (previously required when variations had named keys). The publish form gains multi-image upload per variation row.

## Impact

**Backend**
- `api/config/database.js`: drop `basename` from `art`, `others`, `other_vars`; add `product_images` table + indexes (`product_type, product_id`, `position`).
- `api/controllers/artController.js`: `createArtProduct` accepts multi-file upload, inserts into `product_images`; `getArtProductById` + `getAllArtProducts` + `getArtProductsByAuthorSlug` + `getSellerArtProducts` join/return `images[]`; `deleteArtProduct` cleans up rows + files; `getArtProductImage` (basename serving) unchanged.
- `api/controllers/othersController.js`: same shape of changes, plus handling of variation images (field naming, fallback logic on read), `deleteOthersProduct` cleans up all variation + product images.
- `api/routes/artRoutes.js` and `api/routes/othersRoutes.js`: multer config switches from `.single('image')` / fixed fields to `.fields([...])` supporting `image_1..3` and `variation_<i>_image_1..3` (or similar — exact naming in design.md).
- `api/validators/productSchemas.js`: update Zod schemas if any product creation validation depends on `image` shape (most validation is in the controller today, so likely minimal).
- All admin endpoints that surface products (`/api/admin/products/*`, admin product approval, admin preview) must return `images[]` for the admin UI to render any of them; verify no breakage.

**Frontend**
- `client/app/seller/publish/page.js`: refactor `imageFile`/`previewUrl` into arrays of up to 3, add "Añadir otra imagen" button + per-slot remove button, replicate the same pattern inside the variation row component, update `FormData` assembly to send all images under the new field names.
- `client/app/galeria/p/[id]/ArtProductDetail.js`: replace single `<Image>` with a carousel component reading `product.images[]`, prev/next buttons styled per spec.
- `client/app/tienda/p/[id]/OthersProductDetail.js`: same carousel; cycle logic combines `selectedVariant.images` + `product.images`; reset to variation's first image when variation changes.
- New shared component `client/components/ProductImageCarousel.js` (or co-located) used by both detail pages — keeps behavior identical and avoids drift.
- `client/lib/api.js`: no signature change; `getArtImageUrl` / `getOthersImageUrl` keep basename input.
- Any product listing card that today reads `product.basename` (galería grid, tienda grid, seller dashboard, admin tables, cart line items, order line items, auction cards, draw cards if they surface product images, etc.) must read the first image from `product.images[]` (or a derived helper like `product.thumbnail_basename`). This is the **largest blast radius** of the change — audit needed in design.md.

**Data**
- All existing `art`, `others`, and `other_vars` rows lose their image association on deploy (acknowledged). Image files on disk / S3 should be cleaned up by an operator (out of scope of code change).

**Risk**
- The cart and order systems persist `basename` inside cart items / order line items today (see `CartContext`, `ordersController`). Existing carts/orders will keep their now-orphan `basename` strings, which still resolve as image URLs because files remain. New carts/orders will need to capture a `basename` from `product.images[0]` at add-to-cart time. Design must spell this out.
