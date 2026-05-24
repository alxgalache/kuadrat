## Context

The shipped `multi-image-products` change established that:
- Each `art` / `others` product carries 1..3 global images in `product_images (product_type IN ('art','other'))`.
- Each `other_vars` variation can carry 0..3 images in `product_images (product_type='other_var')` with **fallback** to the product's global images on the detail-page carousel.
- `POST /api/others` requires ≥1 global image; variation images are entirely optional.
- The publish form (`client/app/seller/publish/page.js`) enforces "primera imagen del producto es obligatoria" without exception.
- `ProductGrid.js` renders a single `<Image>` per card. The card uses the classic Next.js anchor-overlay pattern: a tiny `<span className="absolute inset-0" />` inside the title `<Link>` covers the whole `.group.relative` wrapper, so clicks anywhere on the card navigate to the detail page. Today there is no per-card interactive state.

The product owner now wants two distinct refinements:

1. **Form rules**: For `others` products with named variations, the global image becomes redundant. Sellers should not be forced to upload it. Conversely, when variations are used, each variation must carry at least one image (otherwise the listing has no images at all).

2. **Grid affordance**: Buyers can't perceive variations from the grid today. We want a non-disruptive overlay (a "+" badge plus small thumbnails) that lets buyers preview each variation without leaving the grid.

The change touches one backend list query path, one backend create controller's validation block, the publish form's validation + helper text, and the `ProductGrid` component's structure.

## Goals / Non-Goals

**Goals:**
- Make the global "main image" optional in `/seller/publish` exclusively when `productCategory === 'other'` AND `hasVariations === true`. All other cases keep today's rule.
- Make each enabled variation carry at least one image (slot 0 required). The publish form rejects submission otherwise; the backend rejects with `variation_<i>_images[0]` errors.
- Surface each `others` product's variations in the grid via a small thumbnails row over the product image, only when there are 2+ variations to choose between.
- Tapping a thumbnail swaps the card's main image (`<Image fill>`) to that variation's first image, locally to the card. Tapping anywhere else on the image area still navigates to the product detail page.
- Keep the design consistent across desktop and touch screens. No hover-only affordances for the swap; thumbnails work on tap.
- Keep backend list-endpoint cost predictable: one extra batched query per page of `others` products to fetch variation thumbnails.

**Non-Goals:**
- Editing images after publish. Still out of scope; no edit form.
- Showing variations in the *art* grid (art has no variations).
- Showing variations on the auction / draw cards. Those surfaces use their own components (`AuctionImageMosaic`, `DrawGridItem`) and are deliberately untouched.
- Persisting the buyer's per-card variation selection in URL / localStorage / context. Selection resets on each grid mount.
- Backend thumbnail generation (sharp / ImageMagick). We rely on Next.js Image's built-in optimizer.
- Drag/swipe gesture support inside the grid card for thumbnail navigation. Click/tap only.
- Changing the product detail page behavior (the carousel is unchanged).

## Decisions

### 1. Conditional "global image required" rule

**Decision:** The rule "the first global image is required" is gated by `!(productCategory === 'other' && hasVariations)`. When variations are enabled on an `others` product, no global image is required. When `hasVariations === false` (or product is `art`), the existing rule stands.

**Backend mirror:** `createOthersProduct` inspects the parsed `variations` payload. If **any** entry has `key !== null` (= the seller declared named variations), the controller requires ≥1 image per variation and accepts zero global `images`. If **all** entries have `key === null` (= the legacy single anonymous variation = "no variations" UI mode), the controller requires ≥1 global image and ignores variation image fields.

**Rationale:** The frontend already encodes the two modes by the shape of `variations` payload it sends (`{key: null, stock}` for no-variations mode vs `{key: '...', stock}` per row for variations mode). Inferring the mode from `key !== null` keeps the API contract uniform — no need to add an explicit `has_variations` field on the request.

**Alternatives considered:**
- Add a `has_variations` boolean to the multipart payload. Rejected — duplicates information already implicit in `variations[].key`. The single source of truth for "is this a variations product" should remain the variation shape.
- Always require ≥1 image *somewhere* (global OR any variation), letting the seller pick. Rejected — too loose; sellers would still face confusing "must I upload a global image or not?" UX. The proposed rule is binary and easy to communicate ("variations: yes → image per variation; variations: no → global image").

### 2. New required rule: each variation has ≥1 image

**Decision:** When variations are enabled, every variation's `imageSlots[0]` is required at the publish form level. On submit, the form pushes a validation error per variation lacking slot 0, with field name `variations[i].images`. The backend mirrors: for each variation with `key !== null` and zero files under `variation_<i>_images`, push `{ field: 'variation_<i>_images[0]', message: 'La primera imagen de la variación N es obligatoria' }`.

**Rationale:** This guarantees every saved listing has at least one renderable image (either at product or variation level), preventing imageless products in the grid.

**Alternatives considered:**
- Require ≥1 variation to have ≥1 image, the others optional. Rejected — produces a mixed grid where some variation thumbnails are placeholders, which looks broken. Per-variation guarantee is cleaner.

### 3. UI affordance on the publish form

**Decision:** When `productCategory === 'other'` AND `hasVariations === true`:
- The global "Imagen para el listado de productos" section keeps its label but its helper text changes from `"Puedes añadir hasta {MAX_PRODUCT_IMAGES} imágenes. La primera es obligatoria."` to `"Opcional cuando el producto tiene variaciones con imagen propia. Hasta {MAX_PRODUCT_IMAGES} imágenes."`.
- The per-variation images helper text changes from `"Imágenes (opcional, hasta {MAX_PRODUCT_IMAGES})"` to `"Imágenes (obligatoria al menos 1, hasta {MAX_PRODUCT_IMAGES})"`.

In all other cases, today's labels are preserved verbatim.

**Rationale:** Sellers need an unambiguous signal of which images they must upload. The conditional helper text is the lowest-cost way to communicate the new rule.

### 4. Backend list response: `variation_thumbnails` field

**Decision:** `getAllOthersProducts`, `getOthersProductsByAuthorSlug`, and `getSellerOthersProducts` attach a slim `variation_thumbnails: [{ id, key, basename }]` array per product. Each entry corresponds to one variation, ordered by `other_vars.id ASC`. Only variations that have at least one image (a row in `product_images` with `product_type='other_var', product_id=<var.id>`) are included. The `basename` is the variation's first image (lowest `position`, ties broken by `id`).

**Implementation:** A new helper `attachVariationThumbnails(products)` in `api/utils/productImages.js` performs a single batched query:

```sql
SELECT v.id AS variation_id, v.other_id AS product_id, v.key AS variation_key,
       (SELECT pi.basename FROM product_images pi
        WHERE pi.product_type = 'other_var' AND pi.product_id = v.id
        ORDER BY pi.position ASC, pi.id ASC LIMIT 1) AS basename
FROM other_vars v
WHERE v.other_id IN (?, ?, ...) AND v.key IS NOT NULL
ORDER BY v.other_id ASC, v.id ASC;
```

Rows where `basename IS NULL` (variation with no images — legacy or partial) are excluded. The result is grouped by `product_id` in JS and attached as `product.variation_thumbnails`. Products with no named variations (or no variation images) get `variation_thumbnails: []`.

**Decision on `thumbnail_basename` fallback:** After `attachProductImages` runs, the helper iterates products: if a product's `thumbnail_basename` is `null` and its `variation_thumbnails[0]?.basename` exists, the helper sets `product.thumbnail_basename = variation_thumbnails[0].basename`. This guarantees the grid's main image is always populated when at least one image exists somewhere on the product.

**Alternatives considered:**
- Include full `variations[]` with full `images[]` per variation in list responses. Rejected — bloats payload and duplicates the detail endpoint's job. The grid only needs one thumbnail per variation.
- N+1 query per product. Rejected — already-known anti-pattern; mirrors the `attachProductImages` batched approach.

### 5. Frontend grid refactor: discrete image link + interactive thumbnails

**Decision:** Replace the current single-link pattern with two distinct `<Link>` elements:

```jsx
<div className="group relative">
  <div className="relative aspect-square w-full rounded-md bg-gray-200 overflow-hidden">
    <Link href={...} className="block w-full h-full" aria-label={product.name}>
      <Image fill src={getImageUrl(displayedBasename)} ... />
    </Link>
    {showVariationsRow && (
      <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1">
        <span className="rounded-full bg-white/80 p-1" aria-hidden="true">
          <PlusIcon className="size-3 text-gray-700" />
        </span>
        {product.variation_thumbnails.map((thumb) => (
          <button
            key={thumb.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setDisplayedBasename(thumb.basename) }}
            title={thumb.key}
            className="size-6 overflow-hidden rounded-sm ring-1 ring-white/80 transition-transform hover:scale-110 focus:outline-2 focus:outline-offset-1 focus:outline-black"
            aria-label={`Mostrar variación ${thumb.key}`}
          >
            <Image src={getImageUrl(thumb.basename)} alt={thumb.key} width={24} height={24} sizes="24px" className="size-full object-cover" />
          </button>
        ))}
      </div>
    )}
  </div>
  <div className="mt-6">
    <p className="text-sm text-gray-500">{product.seller_full_name}</p>
    <h3 className="mt-1 font-semibold text-gray-900">
      <Link href={...}>{product.name}</Link>
    </h3>
    <p className="mt-1 text-gray-900">€{product.price.toFixed(2)}</p>
  </div>
</div>
```

Key points:
- `showVariationsRow = (product.variation_thumbnails?.length ?? 0) >= 2`.
- The image `<Link>` covers exclusively the square image area, NOT the title block. The title gets its own `<Link>` (no absolute overlay span).
- The thumbnails are `<button>` siblings of the image link, positioned absolutely on top of it via `z-10`. Because they sit later in DOM and have `z-10`, taps land on them first.
- `e.stopPropagation()` is a belt-and-suspenders measure to keep the click from bubbling to the parent image link in case browser quirks cause double events.
- State: each `ProductGridItem` calls `const [displayedBasename, setDisplayedBasename] = useState(null)`. The actual rendered basename is `displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename ?? null`. On grid remount (route change, refetch), state resets to `null` → falls back to the server-computed thumbnail.
- Extract per-card markup into a `ProductGridItem` function inside `ProductGrid.js` (or a sibling file `ProductGridItem.js`). Keeps `ProductGrid.js` readable and the per-card state local.

**Rationale for two `<Link>` elements over the absolute-overlay span:** The overlay span pattern only works when the entire card has a single navigation target and nothing else interactive overlaps it. The moment we want clickable sub-areas (thumbnails) inside the image, we either (a) need preventDefault-on-thumbnails (works but feels fragile and requires comment explaining intent) or (b) restructure so the image-area link is real and bounded. Option (b) is clearer in markup and accessibility tree.

**Trade-off:** With two separate `<Link>` elements, the visited-link styling and `:hover` effects on the title no longer cascade automatically with the image. We keep `.group` on the wrapper so any `.group-hover:*` Tailwind effects continue to apply if needed later.

### 6. Thumbnail size and Next.js Image optimization

**Decision:** Render variation thumbnails at 24px square (`width={24} height={24}`) with explicit `sizes="24px"`. The DOM box can be slightly larger (e.g. `size-6 = 24px` or `size-7 = 28px`) to give a touch target around the visible thumbnail. The "+" badge is `p-1` with a 12px icon inside, giving a similar visual weight to the thumbs.

We do NOT pre-generate small thumbnails on the backend. Instead, in production Next.js Image's optimizer creates a small variant on demand (cached on the CDN). The first request after deploy may pull the original (≤600x600, typically 50-200KB) but subsequent requests get a tiny ~3-8KB WebP. In development (`NODE_ENV=development`) Next.js images are `unoptimized: true` per `next.config.js`, so the full image loads — acceptable, dev only.

**Alternatives considered:**
- Add a `sharp` dependency and pre-generate a `<basename>_thumb.webp` at upload time. Rejected — introduces new infrastructure (a second filename to track, a second `getXxxImageUrl` helper for the thumb variant, cleanup logic on delete), and Next.js Image already handles this in production for free.
- Serve the same original full-size image. Rejected — wastes bandwidth and is a bad citizen for users on slow networks.

**Touch target accessibility:** WCAG recommends ≥24px touch targets; ≥44px ideal. Our thumbnails are exactly at the WCAG minimum. We can bump the button's hit area to `size-7` (28px) without enlarging the displayed image by using `padding` or `p-px`. This is a minor visual tweak settled during implementation.

### 7. Click-target collision: how the image-area link vs thumbnails resolve clicks

**Decision:** The image-area `<Link>` is a sibling of the thumbnail buttons (both children of the `relative aspect-square` div). The thumbnail buttons are absolutely positioned and have `z-10`. Because they sit later in document order with a higher z-index, they capture pointer events first. The image link receives clicks only when the user taps anywhere on the image area NOT covered by a thumbnail or the "+" badge.

This works identically on touch screens: the first element to receive `touchend` (or its synthesized click) is the topmost element under the touch point.

**Belt and suspenders:** Each thumbnail button calls `e.stopPropagation()` in `onClick`. This is defensive — without it the click should not bubble to the Link anyway because the button is not a descendant of the Link. But explicit is cheap and forestalls regression if the markup is restructured later.

### 8. Avoiding navigation when a thumbnail is touched

**Decision:** Thumbnails are `<button type="button">`, not `<a>`. They have no `href`, so they cannot cause navigation. Even if `e.stopPropagation` were absent, a button click is just a button click — it never navigates.

The "+" badge is a non-interactive `<span>` (or `<div aria-hidden="true">`) so it's invisible to keyboard / screen readers and inert against pointer events at the JS layer. It still occupies pixel space (taps on it do nothing). This is OK because the badge is small (~16-20px) and adjacent to thumbnails; users either tap thumbnails (action) or tap elsewhere (navigate). The badge is a dead zone in the same way.

If keyboard accessibility matters: tabbing through the grid card lands on the image-area link, then each thumbnail button, then the title link. Screen readers announce "Mostrar variación Rojo XL" thanks to `aria-label`.

### 9. Tooltip / variation name display

**Decision:** Each thumbnail button gets a native `title={variation.key}` attribute. On desktop, hovering reveals the standard browser tooltip after the OS-defined delay (~1 second). On touch devices, there is no equivalent — but `aria-label` carries the same information for accessibility tools.

**Alternatives considered:**
- Custom tooltip component (Headless UI Tooltip / Radix). Rejected — too heavy for a grid item, adds a new dependency or larger bundle. Native `title` is good enough for the marketplace minimalism aesthetic.
- Always-visible label below thumbnail. Rejected — clutters the grid card and competes with the product title.

### 10. Where to introduce `variation_thumbnails` in the API contract

**Decision:** `getAllOthersProducts`, `getOthersProductsByAuthorSlug`, `getSellerOthersProducts` return the field. `getOthersProductById` does NOT — the detail page already has `product.variations[i].images[]` with full image arrays, which is strictly more information.

Admin list endpoints (`/api/admin/products/others`, if surfaced today) are out of scope unless they consume `ProductGrid` directly. We'll grep during implementation; if any admin grid view uses `ProductGrid`, add the field there too.

## Risks / Trade-offs

- **[Risk: collision between thumbnail tap and image-area tap on small screens]** Thumbnails sit very close to the image edge. A user trying to navigate by tapping the edge of the image may inadvertently tap a thumbnail. → Mitigation: position thumbnails with `bottom-1.5 right-1.5` (8px from each edge); button size 24-28px with no additional padding outside; rely on the user understanding that "small images on top of the big image are buttons" via convention. QA pass on real device.
- **[Risk: legacy `others` products with variations have no per-variation images]** If a legacy product (pre-deploy) is loaded into the grid, it has variations but `variation_thumbnails: []` (because no `product_images` rows for those variations). → Mitigation: the grid simply doesn't render the thumbnails row (threshold check fails). The main image falls back to global thumbnail or, if absent, the bg-gray-200 placeholder. No crash.
- **[Risk: variation_thumbnails query cost on author-page lists]** Some authors list many `others` products. The batched query scans `other_vars` joined with the (sub-)query on `product_images`. → Mitigation: existing index `idx_product_images_product (product_type, product_id, position)` handles the subquery efficiently. `other_vars` is indexed on `other_id` per the existing schema. Negligible at expected volumes.
- **[Trade-off: extracting `ProductGridItem` adds a new component]** vs keeping everything inline. → Worth it: per-card local state belongs in a per-card component, not in a `.map` callback. Co-located in the same file keeps the change minimal.
- **[Risk: thumbnails row collides with future product badges]** If we later add a "Subasta" / "Sorteo" / "Reservado" badge, the bottom-right corner becomes contested. → Note in design: badges should occupy top-right or top-left so thumbnails keep the bottom edge. Not a blocker today.
- **[Trade-off: rejecting variation without image in backend may surprise API consumers]** A direct API caller (curl) used to be able to create an `others` product with named variations and no images. They no longer can. → Acceptable: the only known caller is our own frontend. The change is documented in the modified spec.

## Migration Plan

1. Land backend + frontend together.
   - Backend changes are additive on the response shape (`variation_thumbnails` is new; existing fields keep their meaning). Old clients ignore the new field.
   - Backend validation tightens: API callers must now send variation images when variations have non-null keys. Our publish form is the only caller; it ships in the same deploy.
2. No DB migration. The schema is unchanged.
3. No rollback risk on the data layer. Frontend / backend can be rolled back independently if needed, with the caveat that rolling back only the frontend leaves the seller unable to create variations without images (because backend still requires them).

## Open Questions

- Should the "+" badge use the existing `PlusIcon` from `@heroicons/react/24/solid` (currently used elsewhere in the form) or the smaller `@heroicons/react/20/solid` variant? Leaning toward `20/solid` for the smaller footprint; settled during implementation.
- The variations row currently uses `bg-white/80` for the "+" badge and `ring-1 ring-white/80` for thumbnails. If the underlying image is very light (e.g., a white sculpture on white background), the badge may visually disappear. Acceptable for v1; revisit if it shows up in QA.
