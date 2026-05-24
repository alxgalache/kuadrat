## Why

The recently shipped `multi-image-products` change makes every product (art or other) require at least one global image. For `others` products with named variations — where each variation already carries its own images — the global image becomes a redundant, unhelpful field: the seller is forced to upload a "main" image that has no semantic role beyond filling a slot.

At the same time, the gallery/tienda grid (`ProductGrid.js`) shows a single thumbnail per product. For `others` products with multiple variations the buyer cannot perceive that the product comes in colors/sizes/etc. until they open the detail page. We want to surface variations directly in the grid so buyers can scan available variants and preview them without leaving the listing.

## What Changes

### Publish form validation (`/seller/publish`)

- **BREAKING (publish form)**: When `productCategory === 'other'` AND "Este producto tiene variaciones" is checked, the global product image (`imageSlots[0]`) is NO LONGER required.
- **BREAKING (publish form)**: When variations are enabled, every variation MUST have at least one image (slot 0 of each `variation.imageSlots` becomes required). The previous rule "variation images are optional" is removed for the variations-enabled case.
- Art products (`productCategory === 'art'`) and `others` products without variations keep today's rule: the first global image stays required.

### Backend validation (`POST /api/others`)

- **BREAKING (API)**: When the submitted `variations` payload contains any variation with a non-null `key` (i.e., the seller declared named variations), the backend SHALL require at least one image for every such variation (under its `variation_<i>_images` field) and SHALL accept zero global `images`. When all variation keys are `null` (anonymous single variation = "no variations" UI mode), the backend keeps today's rule of requiring at least one global image.

### Backend list response shape

- **BREAKING (API)**: `GET /api/others`, `GET /api/others/author/:slug`, and `GET /api/seller/others` SHALL include a slim `variation_thumbnails` array on each product: `[{ id, key, basename }]` containing the first image of each variation, in `other_vars.id ASC` order. Variations without images are omitted from the array. The array is empty when the product has no named variations.
- For grid display correctness: when an `others` product has no global images but has variations, `thumbnail_basename` SHALL fall back to the first non-empty `variation_thumbnails[0].basename`. This ensures the grid's main image is always populated when at least one image exists anywhere on the product.

### Frontend grid (`ProductGrid.js`)

- **BREAKING (component refactor)**: Each grid card grows interactive thumbnail-swap state. The single inert `<Link>` overlay pattern (`<span className="absolute inset-0" />` covering the whole card) is replaced with a discrete image-area `<Link>` so that a thumbnail row can sit on top of the image and intercept its own clicks without preventing card navigation.
- New thumbnails row: shown ONLY when a product has `variation_thumbnails.length >= 2`. Rendered absolutely positioned inside the image area, bottom-right, on top of the image. Composed of:
  - A leading non-interactive "+" badge (circular, light translucent background) indicating "this product has variants".
  - One thumbnail per variation (small square, e.g. 24-32px, rounded), in `other_vars.id ASC` order. Each thumbnail is a `<button>` with `title=variation.key` (desktop tooltip) and `onClick` that swaps the card's displayed main image to that variation's first image. No router navigation occurs when a thumbnail is clicked.
- The card's main image continues to navigate to the product detail page when clicked. The product title continues to navigate to the same place. Only the thumbnail buttons opt out of navigation.
- Touch behavior: on tap, the topmost element receives the event. Because thumbnails are absolutely positioned on top of the image link with their own click handler, taps on a thumbnail swap the image; taps anywhere else on the image area navigate to the detail page.
- State scope: image-swap state is local to each grid card and resets on remount (scroll-back is fine; route changes reset to the first variation's image).

### Thumbnail rendering strategy (decision)

- **No backend thumbnail generation.** We continue to serve original full-size images via the existing `GET /api/{art,others}/images/:basename` endpoints. The grid thumbnails use `<Image>` from `next/image` with an explicit `sizes` attribute (e.g. `sizes="32px"`) so Next.js's image optimizer serves a CDN-cached small variant in production. This avoids adding a `sharp` dependency, a new upload pipeline, and a second filename to manage. (Alternatives considered in `design.md`.)

### Capabilities

#### New Capabilities
- None.

#### Modified Capabilities
- `product-images`: Tightens "Publish form supports up to 3 global images" — the first global image is no longer universally required; it becomes conditional on product category and variation mode. List API response shape gains the `variation_thumbnails` field and the `thumbnail_basename` fallback rule for `others` products with no globals.
- `variation-images`: Flips "Variation images are OPTIONAL" — when the product has named variations, every variation requires at least one image. Adds grid-display requirements (variation thumbnails row, click-to-swap behavior, threshold for visibility).

## Impact

**Backend**
- `api/controllers/othersController.js`:
  - `createOthersProduct` — replace current "global images required, variation images optional" rule with the conditional logic: if any submitted variation has `key !== null`, require ≥1 image per such variation and drop the global-images requirement; otherwise keep the global-image requirement.
  - `getAllOthersProducts`, `getOthersProductsByAuthorSlug`, `getSellerOthersProducts` — for each result page, fetch a single batched query of `other_vars` (id, key) joined with `product_images` (first image per variation) to populate `variation_thumbnails` per product. Adjust `thumbnail_basename` so it falls back to the first variation's first image when the product has no globals.
- `api/utils/productImages.js` — add a helper (e.g., `attachVariationThumbnails(products)`) that batches the variation+image lookup for a list of `others` products and applies the fallback rule. Reuses the same single-query-per-list pattern as `attachProductImages`.
- `api/controllers/artController.js` — no change. Art products keep the existing required-image rule.

**Frontend**
- `client/app/seller/publish/page.js`:
  - Update `handleSubmit` validation: gate the "primera imagen obligatoria" check behind `!(productCategory === 'other' && hasVariations)`.
  - Add a new validation rule that, when variations are enabled, every `variation.imageSlots[0]` is required (collect `variations[i].images` validation errors).
  - Adjust the UI affordance: the global-image section's "primera es obligatoria" helper text should toggle to "(opcional si el producto tiene variaciones con imagen propia)" when applicable; the variations block label should mark images as required (drop the existing "(opcional, hasta 3)" hint when in variations mode).
- `client/components/ProductGrid.js`:
  - Refactor: extract per-card markup into a small `ProductGridItem` sub-component (in the same file or a sibling file) so each card holds local React state (`useState` for the currently-displayed basename).
  - Replace the `<span className="absolute inset-0" />` link-cover pattern with two discrete `<Link>` elements (image area + title), so the new thumbnail row can sit on top of the image link without intercepting card clicks.
  - Render the variation thumbnails row when `product.variation_thumbnails?.length >= 2`. Thumbnails are `<button>` elements with `onClick` calling `setDisplayedBasename(thumb.basename)` and `title={thumb.key}`. They must `e.stopPropagation()` to remain inert against the parent image link.
  - The displayed main image is `displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename`.

**Data**
- No schema change. `product_images` table and existing data shape are untouched.
- No migration needed. Existing `others` products without variations remain unchanged (global image still required). Existing `others` products with variations that today have no variation images would fail the NEW validation if re-edited — but there is no edit form, so this only affects newly created products going forward.

**Risk**
- Sellers who have memorized the current "global image always required" mental model may be confused by the new conditional behavior. Mitigated by clear helper text on the publish form.
- Grid card refactor changes the click target geometry of the image area. Light-touch QA needed on mobile to verify taps near the thumbnail row don't accidentally navigate when the seller intended to tap a thumbnail (and vice versa). Padding around thumbnails will help.
- The `variation_thumbnails` field adds one extra batched query per `others` list page (already paginated to ~12-24 items). Acceptable, mirrors the existing `attachProductImages` pattern.
- No backwards-compatibility shim: API consumers that don't expect `variation_thumbnails` will simply ignore it. Frontend consumers reading `thumbnail_basename` continue to work because the field still exists (with the new fallback).
