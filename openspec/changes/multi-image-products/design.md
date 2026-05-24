## Context

Today, images are coupled to the product entities themselves:
- `art.basename` (NOT NULL)
- `others.basename` (NOT NULL)
- `other_vars.basename` (NULLABLE, with fallback to `others.basename`)

The detail pages render a single `<Image>` per product. The publish form has a single dropzone for the main image and one optional dropzone per variation. There is no edit form for products (only the variation edit modal, which deliberately does not allow image changes).

Image basenames are read from `a.basename` / `o.basename` in dozens of SQL queries across `ordersController.js`, `paymentsController.js`, `auctionService.js`, `drawService.js`, `sellerOrdersController.js`, etc. Cart line items and order line items snapshot the `basename` string at add-to-cart / order-creation time.

The product owner confirmed:
- Up to 3 images per art / others product, plus up to 3 per variation.
- Variation images become optional with fallback to the global product images (currently they are required when the product has named variations).
- No data migration is needed — existing rows will be re-seeded clean.
- No seller edit form for products is in scope.

## Goals / Non-Goals

**Goals:**
- New `product_images` table that stores up to 3 images per art/others/other_vars row using a polymorphic `(product_type, product_id)` pair, modeled on the existing `shipping_zones` polymorphic pattern.
- Multi-image upload UI in `/seller/publish` with an "Añadir otra imagen" button and per-slot remove buttons; same pattern inside each variation row.
- Shared `ProductImageCarousel` component used by both `ArtProductDetail` and `OthersProductDetail`. Prev/next buttons rendered inside the image (left and right). No autoplay.
- For `others` with a selected variation: carousel cycles `[variation images..., global images...]`; changing variation resets to the first variation image (or first global image if the variation has none).
- All API endpoints that surface a product (detail, list, admin, seller dashboard, cart payloads) return `images: [{ id, basename, position }]` arrays and, for `others`, embed `images` inside each variation.
- All existing call sites that consume `a.basename` / `o.basename` are migrated to read from the new structure. Cart / order snapshots capture `product.images[0].basename` going forward; legacy snapshots keep working as long as files survive on disk/S3.

**Non-Goals:**
- Editing images of already-published products. No backend or frontend code path for this.
- Data migration for legacy rows. They will lose their image association; cleanup of orphan image files is operational, not in code.
- Drag-and-drop reordering of images. Images are ordered by upload order (= `position` ascending, ties broken by `id`).
- Image cropping, editing, or thumbnail generation. We continue to serve original files via `getArtProductImage` / `getOthersProductImage`.
- Touch swipe gestures on the carousel. Prev/next buttons are the only navigation; the spec explicitly says "manualmente con los dos botones".

## Decisions

### 1. Polymorphic `product_type` values: `'art' | 'other' | 'other_var'`

The existing `shipping_zones` polymorphism uses `product_type` `'art'` and `'other'` (singular). We extend with `'other_var'` to keep singular naming consistent. We do **not** use table names (`'others'`, `'other_vars'`) because:
- It breaks the precedent set by `shipping_zones`.
- Plural-singular asymmetry (`'art'` vs `'others'`) inside the same column would be confusing.

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_type TEXT NOT NULL CHECK(product_type IN ('art','other','other_var')),
  product_id INTEGER NOT NULL,
  basename TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_type, product_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_basename ON product_images(basename);
```

**Alternatives considered:**
- Keep `basename` columns on the entity tables and only add an `additional_images` table. Rejected — splits the image story into "the main image" + "extras" and clutters every read path with two sources of truth. The spec explicitly asks for the columns to be removed.
- Three separate tables (`art_images`, `other_images`, `other_var_images`). Rejected — less ergonomic, three duplicate schemas, three duplicate controllers; polymorphic is the established pattern in this codebase.

### 2. Image file storage path stays the same

Files live under `uploads/art/<basename>` and `uploads/others/<basename>` (or `art/<basename>` and `others/<basename>` in S3). The `product_type` of the row in `product_images` decides which bucket/directory the file lives in:
- `product_type IN ('art')` → art bucket/directory.
- `product_type IN ('other','other_var')` → others bucket/directory.

This keeps `getArtProductImage` / `getOthersProductImage` unchanged and means the existing image-serving endpoints continue to work without modification.

### 3. Multer field naming for multi-image upload

Both `POST /api/art` and `POST /api/others` switch their multer config to `.fields([...])` (others already uses `.fields`).

**Field names:**
- `images` — array of up to 3 files for the global product images. Multer maxCount = 3.
- `variation_<i>_images` — array of up to 3 files for the variation at index `i` (0-based). One field per variation. Multer maxCount = 3 per field.

We pre-register the maximum number of variation-image fields multer expects. To avoid having to know the variation count in middleware, we use **dynamic multer setup**: a small helper that builds the fields array based on `req.body.variation_count` is fragile (multer parses files before body). Instead we hardcode an upper bound matching what the form can produce.

**Decision: Use a hardcoded upper bound of 20 variations × 3 images = 60 fields** in the multer config (`variation_0_images` .. `variation_19_images`, each maxCount 3). This costs nothing at runtime if unused (`req.files['variation_5_images']` is just undefined) and removes the dependency on body-parsing order.

**Alternative considered:** Receive one `variation_images` flat array plus a separate `variation_image_counts` array that maps how many images belong to each variation. Rejected because reconstructing the boundary on the server is error-prone — using indexed field names lets multer do the partitioning for us.

### 4. Variation image fallback

The spec says variation images are optional and fall back to the global product images. The carousel logic codifies this as:

```js
const carouselImages = selectedVariant?.images?.length > 0
  ? [...selectedVariant.images, ...product.images]
  : product.images;
```

- If the variation has its own images, those come **first** in the carousel and become the initial slide.
- If the variation has no images, the carousel only shows the product's global images.
- Changing the variation always resets the carousel index to 0 (= first variation image, or first global image if variation has none).
- The existing variation-images requirement "Missing variation image on submit blocks the form" is removed; missing variation images are now legal.

### 5. Read-side strategy: scalar subqueries vs JOINs vs API-level hydration

Many SQL queries today select `a.basename` / `o.basename` directly. We need to replace these reads with the new model.

**Decision: API-level hydration via a small helper.** Controllers run their existing queries (with `a.basename` / `o.basename` removed), then call a helper `attachProductImages(rows, productType)` that does a single `SELECT id, basename, position, product_id FROM product_images WHERE product_type = ? AND product_id IN (?, ?, ...) ORDER BY position ASC, id ASC` and merges the results back into each row as `row.images = [...]`.

- This collapses N+1 to **one extra query per list** (regardless of size).
- It works uniformly whether the calling SQL is a simple select or a complex multi-join (orders, draws, auctions).
- It keeps the existing SQL strings minimally invasive — just drop the `a.basename` / `o.basename` selectors.

For order/cart line items, we also expose `thumbnail_basename` (= first image basename) to keep template code simple. This is a **computed field** in the API response, not a denormalized column.

For queries that today use `COALESCE(a.basename, o.basename) AS basename` (e.g., `drawService.js:487`, `auctionService.js:1052`), we replace with two attach calls (art and other) and let the API response carry `thumbnail_basename` per row, computed by the helper.

**Alternatives considered:**
- Denormalized `thumbnail_basename` column on `art` / `others`, kept in sync with the first image. Rejected — duplicates state, easy to drift, especially when removing images (which is out of scope for this change but might come later).
- Inline scalar subquery `(SELECT basename FROM product_images WHERE ... LIMIT 1) AS thumbnail_basename`. Rejected — every single existing query gets harder to read, and a list endpoint still needs a join or extra query to fetch all 3 images, so we end up with two patterns anyway. The helper is uniform.

### 6. Cart / order line item snapshots

Cart items snapshot `basename` at add-to-cart time (see `CartContext.js:85,119`). Order items snapshot via the SQL queries in `ordersController.js` etc.

**Decision:**
- In `CartContext`, the `addToCart` consumers in `ArtProductDetail` and `OthersProductDetail` pass `basename: product.images[0]?.basename` (for art) or `selectedVariant.images[0]?.basename || product.images[0]?.basename` (for others). The cart context API stays unchanged.
- In `ordersController` and other order-creation paths, the SQL queries that fetch `a.basename` / `o.basename` become `(SELECT basename FROM product_images WHERE product_type=? AND product_id=a.id ORDER BY position ASC, id ASC LIMIT 1) AS basename`. This keeps the downstream consumers (email templates, invoice PDF, etc.) unchanged.

This is the **one place** we accept a scalar subquery, because the order/payment paths are atomic snapshots — not list/detail reads where we want the full image array.

### 7. UI: shared carousel component

New component `client/components/ProductImageCarousel.js`:

```js
<ProductImageCarousel images={[{ basename, alt? }, ...]} imageType="art|others" priority />
```

- Renders the same square aspect, `bg-gray-200`, rounded-lg as today.
- Renders a single `<Image fill>` showing the current slide.
- Renders prev/next round buttons (`size-8`, `bg-white/70`, `text-gray-900`, hover `bg-white`) absolutely positioned at `left-2` and `right-2`, vertically centered (`top-1/2 -translate-y-1/2`), with `aria-label` "Imagen anterior" / "Imagen siguiente".
- Buttons render only when `images.length > 1`.
- Uses internal `useState(0)` for current index. Wraps around: prev from 0 → last, next from last → 0.
- Accepts an external `key={...}` from parents (e.g., `key={selectedVariant?.id || 'no-variant'}`) so that variation changes naturally reset the carousel to index 0.

The `imageType` prop drives which `getXxxImageUrl` helper builds the URL. Avoids importing both helpers in the component.

### 8. UI: publish form — image upload widget

We refactor the form state from single `imageFile` / `previewUrl` to arrays:

```js
const [imageFiles, setImageFiles] = useState([null])  // length 1..3, never 0
const [previewUrls, setPreviewUrls] = useState([''])  // mirrors imageFiles
```

Each entry corresponds to one dropzone slot. "Añadir otra imagen" pushes `null` to both arrays (max 3). Per-slot remove (visible only when `length > 1` and index `> 0`) splices both arrays.

**Why index 0 cannot be removed:** The form already treats the first image as the canonical "Imagen para el listado de productos". This matches the spec ("del primero, que nunca se podrá eliminar"). The label of slot 0 stays as today; slots 1 and 2 get a smaller label like "Imagen adicional" or no label.

Each variation row mirrors the same pattern with its own arrays:

```js
{
  key: '',
  stock: '',
  imageFiles: [null],
  previewUrls: ['']
}
```

The variation row's "Imagen de variación" button gets the same multi-upload UX. The "Sin imagen" hint stays for slot 0 when empty; "Imagen cargada" stays for non-empty slots.

**Right-column preview:** The current single-preview block becomes a stack of all previews from `previewUrls` (only the non-empty ones). They render vertically with `space-y-4` and the same `<NextImage>` props as today.

### 9. Backward compatibility on the wire

Because there is no data migration, immediately after deploy all existing products render with `images: []`. Frontends that render an image when `images.length === 0` would crash. We harden every consumer to handle the empty-array case (render the `bg-gray-200` placeholder, or nothing for thumbnails). This is the safest path because product owner accepts that existing products won't render images.

## Risks / Trade-offs

- **[Risk: huge SQL audit]** Dozens of SQL queries select `a.basename` / `o.basename`. Missing one means a broken endpoint. → Mitigation: a single grep `grep -rn "\.basename" api/` plus a test pass per surface (orders dashboard, seller orders, admin orders, auction product card, draw product card, cart, checkout, payment intent metadata, invoice email, invoice PDF).
- **[Risk: legacy carts in localStorage]** Carts saved before the deploy carry `basename` strings that came from columns that no longer exist. The image file is still on disk/S3, so they keep rendering. → Mitigation: none needed, accepted as part of "clean slate".
- **[Risk: existing products become imageless]** After deploy, every art and other product loses its visible image until reseeded. → Mitigation: communicated and accepted by product owner.
- **[Risk: multer field explosion]** Hardcoding `variation_0_images` .. `variation_19_images` × 3 = 60 multer fields feels excessive. → Mitigation: it's free at runtime (multer just registers the slots); we cap variation count at the form level (already implicit through "Agregar variación"). If a seller really needs >20 variations, that's a separate concern.
- **[Trade-off: API hydration adds one query per list]** vs SQL JOINs that bloat result rows. → We pay one extra round-trip per list endpoint, but the response payload stays clean and the controller code stays readable. Acceptable for our scale.
- **[Risk: order snapshot scalar subquery]** If `product_images` row is deleted (out of scope today but possible later), the subquery returns NULL and the order loses its captured image. → Mitigation: noted; if image deletion is ever added, we should snapshot the basename string at order time, not query at email-render time. Today, image deletion only happens on product delete, and product delete requires `is_sold = 0`, so no live order references it.

## Migration Plan

1. Land DB schema change (drop `basename` from `art`/`others`/`other_vars`, add `product_images`). Because the file is idempotent and uses `CREATE TABLE IF NOT EXISTS`, this requires recreating the affected tables. Since we are accepting data loss, the cleanest path is:
   - Drop the affected tables in `initializeDatabase()` only on a one-shot opt-in flag (e.g., `RESET_PRODUCT_IMAGES=1`), OR
   - Have the operator drop the tables manually before deploying, then let `initializeDatabase()` recreate them.

   **Recommended:** the operator drops the affected tables (`DROP TABLE art; DROP TABLE others; DROP TABLE other_vars;` after stopping the API) before the deploy. `database.js` then recreates them with the new schema and creates `product_images` fresh. No code-side reset flag is added; it would be dead code immediately.

2. Deploy backend + frontend together. Old API + new client (or vice versa) will not interoperate because the response shape changes.

3. No rollback after step 1 except restore from DB backup, because dropping `basename` columns loses data.

## Open Questions

None — all open points were resolved with the product owner before this design (variation image count, optionality, migration policy, edit-form scope).
