## 1. Backend: variation_thumbnails helper

- [x] 1.1 In `api/utils/productImages.js`, add `attachVariationThumbnails(products)` that takes an array of `others` product rows and, in a single batched query, fetches the first image basename per named variation for those products
- [x] 1.2 The query SHALL be: `SELECT v.id, v.other_id AS product_id, v.key, (SELECT pi.basename FROM product_images pi WHERE pi.product_type='other_var' AND pi.product_id=v.id ORDER BY pi.position ASC, pi.id ASC LIMIT 1) AS basename FROM other_vars v WHERE v.other_id IN (?,?,...) AND v.key IS NOT NULL ORDER BY v.other_id ASC, v.id ASC`
- [x] 1.3 Group the result rows by `product_id` and assign `product.variation_thumbnails = [{ id, key, basename }, ...]`. Filter out rows where `basename IS NULL`. Products without named variations or with no variation images receive `variation_thumbnails: []`
- [x] 1.4 After grouping, iterate products and apply the `thumbnail_basename` fallback: if `product.thumbnail_basename == null` AND `product.variation_thumbnails[0]?.basename` exists, set `product.thumbnail_basename = product.variation_thumbnails[0].basename`
- [x] 1.5 Tolerate empty input (no query, return early). Co-locate a smoke test in `api/tests/productImages.test.js` covering: product with 2 variations both with images, product with 1 variation, product with anonymous variation (key NULL), product with no globals (fallback applied)

## 2. Backend: list endpoint integration

- [x] 2.1 In `api/controllers/othersController.js`, after the existing `await attachProductImages(products, 'other')` call in `getAllOthersProducts`, add `await attachVariationThumbnails(products)` so each product gets its `variation_thumbnails` and the fallback `thumbnail_basename`
- [x] 2.2 Repeat the same call sequence in `getOthersProductsByAuthorSlug` and `getSellerOthersProducts`
- [x] 2.3 Do NOT call `attachVariationThumbnails` in `getOthersProductById` — the detail endpoint already returns full `variations[i].images[]` and does not need the slim field

## 3. Backend: createOthersProduct validation update

- [x] 3.1 In `api/controllers/othersController.js` `createOthersProduct`, after the existing parse of `variations`, compute `const hasNamedVariations = parsedVariations.some(v => v.key !== null && v.key !== undefined && String(v.key).trim() !== '')`
- [x] 3.2 When `hasNamedVariations === false`: keep today's rule — require ≥1 file under `images` (push `{ field: 'images', message: 'El archivo de imagen es obligatorio' }` otherwise) and ignore any `variation_<i>_images` fields
- [x] 3.3 When `hasNamedVariations === true`: do NOT require any files under `images`. For each variation index `i` where `parsedVariations[i].key !== null`, require `req.files?.['variation_' + i + '_images']?.length >= 1`. On missing, push `{ field: 'variation_' + i + '_images[0]', message: 'La variación ' + (parsedVariations[i].key || (i+1)) + ' debe tener al menos una imagen' }`
- [x] 3.4 Keep the per-file MIME / size / dimensions validation block unchanged; the only new failure mode is "missing first image" for variations
- [x] 3.5 Update the existing test fixtures (`api/tests/othersController.test.js` if it exists) to cover: (a) variations mode with zero globals succeeds; (b) variations mode with one variation lacking its first image returns 400 with the correct field

## 4. Frontend: publish form — global image validation

- [x] 4.1 In `client/app/seller/publish/page.js` `handleSubmit`, replace the unconditional check `if (filledGlobalSlots.length === 0 || !imageSlots[0]) { validationErrors.push({ field: 'images', message: 'La primera imagen del producto es obligatoria' }) }` with a guarded version: only push the error when `!(productCategory === 'other' && hasVariations)`
- [x] 4.2 NOTE: the form uses `productCategory === 'other'` (singular). Check that the conditional matches exactly — do not introduce `productCategory === 'others'`
- [x] 4.3 Keep the existing behavior of submitting whatever files the seller uploaded (zero is now legal for the variations case); the existing `for (const slot of filledGlobalSlots) { formData.append('images', slot.file) }` already handles zero correctly (no-op)

## 5. Frontend: publish form — variation image validation

- [x] 5.1 In `client/app/seller/publish/page.js` `handleSubmit`, when `productCategory === 'other'` AND `hasVariations === true`, iterate `variations` and for each, check `if (!v.imageSlots[0]) { validationErrors.push({ field: 'variations[' + index + '].images', message: 'La variación ' + (v.key?.trim() || (index + 1)) + ' debe tener al menos una imagen' }) }`
- [x] 5.2 Place this check inside the existing `if (productCategory === 'other')` block, after the `forEach` that validates `key` and `stock`
- [x] 5.3 Keep the existing per-file validation (`validateImageFile`) untouched — the new rule is a missing-image rule, not a format rule

## 6. Frontend: publish form — helper text

- [x] 6.1 In the global images section JSX (around line 960), replace the static `<p>` containing `"Puedes añadir hasta {MAX_PRODUCT_IMAGES} imágenes. La primera es obligatoria."` with a conditional expression that renders the OPTIONAL variant `"Opcional cuando el producto tiene variaciones con imagen propia. Hasta {MAX_PRODUCT_IMAGES} imágenes."` when `productCategory === 'other' && hasVariations`, otherwise the existing required variant
- [x] 6.2 In the per-variation images block (around line 835), change the helper text `"Imágenes (opcional, hasta {MAX_PRODUCT_IMAGES})"` to `"Imágenes (obligatoria al menos 1, hasta {MAX_PRODUCT_IMAGES})"`
- [x] 6.3 Visual QA: open the form, toggle `productCategory` and `hasVariations`, verify helper text updates in real time

## 7. Frontend: ProductGrid refactor — extract per-card component

- [x] 7.1 In `client/components/ProductGrid.js`, extract the per-card markup into a sibling function component `ProductGridItem({ product, getImageUrl, baseRoute })` defined in the same file (or in a new sibling file `client/components/ProductGridItem.js` — pick whichever keeps imports cleaner)
- [x] 7.2 In `ProductGridItem`, declare `const [displayedBasename, setDisplayedBasename] = useState(null)` (import `useState` from React)
- [x] 7.3 Compute the displayed basename: `const mainBasename = displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename ?? null`
- [x] 7.4 The parent `ProductGrid` becomes a thin map: `{products.map((p) => <ProductGridItem key={p.id} product={p} getImageUrl={getImageUrl} baseRoute={baseRoute} />)}`

## 8. Frontend: ProductGrid refactor — link structure

- [x] 8.1 Replace the single `<Link>` with absolute-overlay `<span>` pattern. The new structure SHALL be:
  - Outer `<div className="group relative">` wraps the whole card
  - Inner `<div className="relative aspect-square w-full rounded-md bg-gray-200 overflow-hidden">` is the image area
  - Inside the image area: ONE `<Link href={...} className="block size-full" aria-label={product.name}>` wrapping the `<Image>` (the image area is the link's clickable surface)
  - Sibling to that Link (still inside the image area `<div>`): the thumbnails row (conditional, see task 9)
  - Below the image area `<div>`: the existing `<div className="mt-6">` with seller name, title `<Link>`, and price
- [x] 8.2 Remove the `<span className="absolute inset-0" />` line entirely
- [x] 8.3 The title `<h3>` continues to wrap its content in its own `<Link href={...}>` (today this is already the case; just no longer relies on the absolute span)
- [x] 8.4 Visual QA: the entire image area should remain clickable (navigating to detail); the title text remains clickable (same destination); no other area of the card should be clickable

## 9. Frontend: ProductGrid — variation thumbnails row

- [x] 9.1 Inside the image area `<div>`, after the image `<Link>`, conditionally render the thumbnails row when `(product.variation_thumbnails?.length ?? 0) >= 2`
- [x] 9.2 Markup outline:
  ```jsx
  <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1">
    <span className="rounded-full bg-white/80 p-1" aria-hidden="true">
      <PlusIcon className="size-3 text-gray-700" />
    </span>
    {product.variation_thumbnails.map((thumb) => (
      <button
        key={thumb.id}
        type="button"
        title={thumb.key}
        aria-label={`Mostrar variación ${thumb.key}`}
        onClick={(e) => { e.stopPropagation(); setDisplayedBasename(thumb.basename) }}
        className="size-6 overflow-hidden rounded-sm ring-1 ring-white/80 transition-transform hover:scale-110 focus:outline-2 focus:outline-offset-1 focus:outline-black"
      >
        <Image src={getImageUrl(thumb.basename)} alt={thumb.key} width={24} height={24} sizes="24px" className="size-full object-cover" />
      </button>
    ))}
  </div>
  ```
- [x] 9.3 Import `PlusIcon` from `@heroicons/react/20/solid` (smaller size variant — verify the existing import style in the file)
- [x] 9.4 The button-level `e.stopPropagation()` is required even though buttons don't bubble navigation through Links — keep it as defensive code with no comment needed (it's a single line)

## 10. Frontend: ProductGrid — main image sourced from local state

- [x] 10.1 The `<Image>` inside the image `<Link>` SHALL use `getImageUrl(mainBasename)` (where `mainBasename` is computed per task 7.3), NOT `getImageUrl(product.thumbnail_basename || product.images?.[0]?.basename)`
- [x] 10.2 Wrap the `<Image>` render with `mainBasename && (...)` so the gray placeholder shows when no image is available anywhere (existing behavior with `thumb && (...)` is functionally identical)
- [x] 10.3 Verify the `sizes` attribute on the main image is unchanged (`"(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"`)

## 11. Verification

- [x] 11.1 Run the existing backend test suite (`cd api && npm test`) — must pass; add new tests per tasks 1.5 and 3.5
- [x] 11.2 Manual smoke (publish form):
  - Create an `art` product with 0 images → form blocks with "primera imagen obligatoria"
  - Create an `other` product without variations and 0 images → form blocks
  - Create an `other` product with variations but one variation lacking image → form blocks with the per-variation error
  - Create an `other` product with variations, 2 variations with 1 image each, 0 globals → form submits, `POST /api/others` returns 201
  - Same as above but with 1 global image → still submits successfully
- [x] 11.3 Manual smoke (grid):
  - `GET /tienda` shows products. Products with 2+ named variations and per-variation images show the "+" badge and thumbnails in the bottom-right of the card image
  - Click a thumbnail on desktop → main image swaps, URL unchanged
  - Click the main image → navigates to detail page
  - Click the product title → navigates to detail page
  - Hover a thumbnail → native tooltip with variation key after ~1s
  - On mobile / touch device: tap a thumbnail → main image swaps (does not navigate); tap elsewhere on image → navigates
  - Tab through the card with keyboard → focus lands on image link, then each thumbnail, then title link in that order
  - Navigate away from grid and back → swapped image resets to server-computed `thumbnail_basename`
- [x] 11.4 Verify `GET /api/others?page=1` response payload includes `variation_thumbnails` per product and the `thumbnail_basename` fallback works for a product with 0 globals
