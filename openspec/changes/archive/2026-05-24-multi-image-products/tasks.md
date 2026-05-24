## 1. Database schema

- [x] 1.1 In `api/config/database.js`, remove the `basename TEXT NOT NULL` (and `basename TEXT`) columns from the `CREATE TABLE` statements for `art`, `others`, and `other_vars`
- [x] 1.2 In `api/config/database.js`, add the `product_images` table with columns `id`, `product_type` (CHECK IN `'art'`, `'other'`, `'other_var'`), `product_id`, `basename`, `position`, `created_at`
- [x] 1.3 In `api/config/database.js`, add indexes `CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_type, product_id, position)` and `CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_basename ON product_images(basename)`
- [x] 1.4 Document in the change PR description: operator must `DROP TABLE art; DROP TABLE others; DROP TABLE other_vars;` before deploying so `initializeDatabase()` recreates them without the `basename` column (no data migration; existing rows are discarded)

## 2. Backend helpers

- [x] 2.1 Create `api/utils/productImages.js` with two functions: `attachProductImages(rows, productType, { idKey = 'id' } = {})` that fetches `product_images` for the given rows in one query and assigns `row.images = [...]` plus `row.thumbnail_basename = row.images[0]?.basename ?? null`; and `getPrimaryImageBasename(productType, productId)` that returns the basename of the first image or `null`
- [x] 2.2 In `api/utils/productImages.js`, ensure `attachProductImages` orders results by `position ASC, id ASC` and that it tolerates an empty rows array (no query) and rows with no images (`images: []`)
- [x] 2.3 Add unit-style smoke coverage for `attachProductImages` (single row, multiple rows, mixed art/other, empty result) — co-locate in `api/tests/productImages.test.js`

## 3. Multer configuration

- [x] 3.1 In `api/routes/artRoutes.js`, change multer config to `.fields([{ name: 'images', maxCount: 3 }])` and replace `upload.single('image')` on the `POST /` route
- [x] 3.2 In `api/routes/othersRoutes.js`, replace the multer config with `.fields([{ name: 'images', maxCount: 3 }, ...for i in 0..19: { name: \`variation_${i}_images\`, maxCount: 3 }])` — generate the array programmatically with a small `for` loop
- [x] 3.3 Verify the multer file-filter still rejects non-PNG/JPG/WEBP MIME types for every field

## 4. artController.createArtProduct

- [x] 4.1 Replace the `req.file` reference with `req.files?.['images']` (array of up to 3 files)
- [x] 4.2 Validate that at least one image is present; otherwise push validation error `{ field: 'images', message: 'El archivo de imagen es obligatorio' }`
- [x] 4.3 For each uploaded file, run the existing MIME + dimensions validation; collect errors as `images[<i>]` for clarity
- [x] 4.4 After product `INSERT INTO art`, generate a unique basename per file and write each file to S3 (`art/<basename>`) or local `uploads/art/<basename>` (preserve the existing write logic)
- [x] 4.5 Insert one `product_images` row per file: `(product_type='art', product_id=<artId>, basename, position=<i>)`
- [x] 4.6 On any write/DB failure after partial writes, clean up all files just written from storage (extend the existing cleanup block)
- [x] 4.7 Wrap the multiple inserts in `createBatch()` from `api/utils/transaction.js` so the art row + image rows are atomic
- [x] 4.8 Update the response to fetch `product_images` for the new product and attach `images` + `thumbnail_basename` via `attachProductImages`

## 5. othersController.createOthersProduct

- [x] 5.1 Replace `req.files?.['image']` with `req.files?.['images']` and validate at least one global image
- [x] 5.2 Replace the single `variation_images` field iteration with per-variation indexed lookups: for each variation `i`, read `req.files?.[\`variation_${i}_images\`] || []`
- [x] 5.3 Remove the existing validation that requires one image per named variation (variations are now allowed to have 0 images)
- [x] 5.4 Validate each uploaded file (MIME + size + dimensions); on errors return `images[<j>]` or `variation_<i>_images[<j>]` as the field name
- [x] 5.5 Insert `INSERT INTO others` (without `basename`); for each global image file, write to storage and insert `product_images` with `product_type='other', product_id=<othersId>, position=<j>`
- [x] 5.6 For each variation: `INSERT INTO other_vars` (without `basename`); then for each of that variation's image files, write to storage and insert `product_images` with `product_type='other_var', product_id=<otherVarId>, position=<j>`
- [x] 5.7 Extend the cleanup-on-failure block to remove all just-written files (global + every variation's) when any DB operation fails
- [x] 5.8 Use `createBatch()` to keep `others` + `other_vars` + `product_images` inserts atomic
- [x] 5.9 Update the response to attach `images` to the product and to each variation via `attachProductImages`

## 6. Read endpoints (art)

- [x] 6.1 In `getArtProductById`, remove `a.basename` from the SELECT (it no longer exists); after fetching, call `attachProductImages([product], 'art')`
- [x] 6.2 In `getAllArtProducts`, do the same: drop `a.basename` from the SELECT and call `attachProductImages(products, 'art')` before responding
- [x] 6.3 In `getArtProductsByAuthorSlug`, same treatment as 6.2
- [x] 6.4 In `getSellerArtProducts`, same treatment as 6.2

## 7. Read endpoints (others)

- [x] 7.1 In `getOthersProductById`, drop `o.basename` from the SELECT; after fetching the product, call `attachProductImages([product], 'other')`
- [x] 7.2 In `getOthersProductById`, after fetching variations from `other_vars`, drop the legacy `basename` consumer; call `attachProductImages(variationsResult.rows, 'other_var')` so each variation gets its own `images` and `thumbnail_basename`
- [x] 7.3 In `getAllOthersProducts`, drop `o.basename`, attach images via helper before responding
- [x] 7.4 In `getOthersProductsByAuthorSlug`, same treatment as 7.3
- [x] 7.5 In `getSellerOthersProducts`, same treatment, plus attach variation images for each product

## 8. Hard-delete cleanup

- [x] 8.1 In `deleteArtProduct`, before deleting the `art` row, query `product_images` for `(product_type='art', product_id=<id>)` to collect basenames; delete files from S3 or `uploads/art/`; then delete the `product_images` rows; then delete the `art` row
- [x] 8.2 In `deleteOthersProduct`, collect basenames from `product_images` for `product_type='other'` (the product) AND for `product_type='other_var', product_id IN (<var ids>)` (its variations); delete files; delete the `product_images` rows; delete `other_vars`; delete `others`
- [x] 8.3 Ensure file-delete failures are logged via `logger.error` but do not abort the database deletion (preserve current behavior)

## 9. Order / payment / auction / draw / email SQL refactors

- [x] 9.1 In `api/controllers/ordersController.js`, every SQL select that pulls `a.basename` (lines 616, 631, 723, 738, 960, 986, 1142, 1158, 1263, 1280, 1340, 1360, 1535, 1551, 1720, 1736, 1940, 1951, 1967, 1979, 2066, 2087, 2867, 2877 and 1044, 1050) MUST be replaced with `(SELECT basename FROM product_images WHERE product_type = ? AND product_id = a.id ORDER BY position ASC, id ASC LIMIT 1) AS basename` (and same for `o.basename` with `product_type='other'`)
- [x] 9.2 In `api/utils/paymentHelpers.js`, replace the `basename` selection in the two product lookups (lines 67, 83) with the same subquery pattern
- [x] 9.3 In `api/controllers/paymentsController.js`, replace the `basename` selection in the product lookups (lines 91, 107) and the auction order item query (line 649) with the subquery pattern
- [x] 9.4 In `api/services/auctionService.js`, replace `a.basename` / `o.basename` selections (lines 113, 126, 255, 262, 1052) with the subquery pattern; line 282 reads `row.basename` — keep
- [x] 9.5 In `api/services/drawService.js`, replace `a.basename` / `o.basename` selections (lines 106, 119, 179, 196, 487) with the subquery pattern; lines 187, 204 read the result — keep
- [x] 9.6 In `api/controllers/auctionController.js`, line 324 reads `auctionProduct?.basename` — verify the upstream query feeding `auctionProduct` is updated to include the subquery (typically via auctionService); add subquery if missing
- [x] 9.7 In `api/controllers/sellerOrdersController.js`, audit and update every `basename` SQL selector with the subquery pattern (use `grep -n "basename" api/controllers/sellerOrdersController.js`)
- [x] 9.8 In `api/controllers/drawAdminController.js`, audit and update line 433 and surrounding reads to use the subquery pattern
- [x] 9.9 In `api/services/emailService.js`, audit every basename usage; email templates likely consume the snapshot from the order line item, but verify any direct DB lookup is updated
- [x] 9.10 In `api/controllers/productsController.js` (legacy `products` table flow if still used), leave `basename` reads untouched — the `products` table is separate from `art`/`others`/`other_vars` and is not in scope; verify with `git grep "FROM products"` that this is a different domain

## 10. CoA endpoints

- [x] 10.1 In `api/controllers/coaController.js` and `api/controllers/coaAdminController.js`, audit `basename` usages and update SQL to use the subquery pattern for art product images (CoA is bound to art products)

## 11. Frontend: shared carousel component

- [x] 11.1 Create `client/components/ProductImageCarousel.js` accepting props `images: [{ basename, alt? }]`, `imageType: 'art' | 'others'`, `priority: boolean`, `name: string`
- [x] 11.2 Implement local `useState(0)` for current index; expose nothing — fully self-contained
- [x] 11.3 Render the square frame (`aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative`) and a single `<Image fill>` from `next/image` showing the current image
- [x] 11.4 Resolve the image URL by calling `getArtImageUrl(basename)` or `getOthersImageUrl(basename)` based on `imageType`
- [x] 11.5 Render two round buttons (`absolute top-1/2 -translate-y-1/2`, `size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow`, with chevron icons from `@heroicons/react/20/solid`) at `left-2` and `right-2` — only when `images.length > 1`
- [x] 11.6 Add `aria-label="Imagen anterior"` / `"Imagen siguiente"` and wrap-around behavior (next from last → 0, prev from 0 → last)
- [x] 11.7 Handle `images.length === 0` by rendering the gray placeholder with no image and no buttons (no crash)
- [x] 11.8 Accept `key` prop usage from parents to enable resetting carousel state by changing key (no internal effect needed beyond standard React unmount semantics)

## 12. Frontend: ArtProductDetail

- [x] 12.1 In `client/app/galeria/p/[id]/ArtProductDetail.js`, replace the existing `<Image>` block (lines ~203-212) with `<ProductImageCarousel images={product.images || []} imageType="art" name={product.name} priority />`
- [x] 12.2 Remove the `getArtImageUrl` import since it's now encapsulated in the carousel (or keep if still used elsewhere in the file)
- [x] 12.3 Update `handleAddToCart` and the auto-select branch to pass `basename: product.images?.[0]?.basename` instead of `product.basename`
- [x] 12.4 Update `handleShippingSelected` similarly

## 13. Frontend: OthersProductDetail

- [x] 13.1 In `client/app/tienda/p/[id]/OthersProductDetail.js`, replace the existing `<Image>` block (lines ~228-238) with `<ProductImageCarousel images={carouselImages} imageType="others" name={product.name} priority key={selectedVariant?.id ?? 'no-variant'} />`
- [x] 13.2 Compute `carouselImages` as `selectedVariant?.images?.length > 0 ? [...selectedVariant.images, ...(product.images || [])] : (product.images || [])`
- [x] 13.3 Update `handleAddToCart` (both Sendcloud-enabled and legacy branches) and `handleShippingSelected` to pass `basename: selectedVariant?.images?.[0]?.basename || product.images?.[0]?.basename`
- [x] 13.4 The variation selector continues to call `setSelectedVariant(variant)`; the `key` prop on the carousel ensures index resets automatically when the variation id changes

## 14. Frontend: publish form — global images

- [x] 14.1 In `client/app/seller/publish/page.js`, replace `imageFile` / `previewUrl` state with arrays: `const [imageFiles, setImageFiles] = useState([null])` and `const [previewUrls, setPreviewUrls] = useState([''])`
- [x] 14.2 Refactor `validateAndSetImage(file)` into `validateAndSetImageAtIndex(index, file)` that targets a specific slot (mirror the existing function but updates arrays)
- [x] 14.3 Render dropzones in a loop over `imageFiles`; each dropzone uses its own `useDropzone` hook OR a single shared `onDrop` factory that captures the index — pick the implementation that keeps the existing dropzone UX
- [x] 14.4 Below the last rendered dropzone, render a "Añadir otra imagen" button when `imageFiles.length < 3`; clicking it appends `null` to both arrays
- [x] 14.5 Below each dropzone at index >= 1, render a small red text-button "Eliminar imagen" that removes that index from both arrays (with `URL.revokeObjectURL` cleanup)
- [x] 14.6 Update the cleanup `useEffect` to revoke every entry in `previewUrls` on unmount
- [x] 14.7 Update validation in `handleSubmit`: ensure at least one non-null image at index 0; collect errors for any null slot above 0 (treat null mid-array as an error or auto-filter — auto-filter is simpler)
- [x] 14.8 In the `FormData` assembly, append each non-null image under the `images` field name (multer reads `images[]`)
- [x] 14.9 Update the right-column preview to render all `previewUrls.filter(Boolean)` stacked vertically with `space-y-4`

## 15. Frontend: publish form — variation images

- [x] 15.1 Update the `variations` state shape: each variation entry becomes `{ key: '', stock: '', imageFiles: [null], previewUrls: [''] }` (arrays replacing scalars)
- [x] 15.2 Update `handleAddVariation` to seed empty `imageFiles: [null]`, `previewUrls: ['']`
- [x] 15.3 Update `handleRemoveVariation` to revoke ALL `previewUrls` of the removed variation
- [x] 15.4 Refactor `validateAndSetVariationImage(index, file)` into `validateAndSetVariationImageAtSlot(variationIndex, slotIndex, file)` that targets one specific slot inside one specific variation
- [x] 15.5 In the variation row template, render one image upload control per slot in `variation.imageFiles`; add a small "Añadir imagen a esta variación" button when fewer than 3 slots exist; add a small remove control for slots index >= 1
- [x] 15.6 Update validation in `handleSubmit`: remove the existing "variation image is required" check; just validate uploaded images (format/size/dimensions) — no minimum count
- [x] 15.7 In `FormData` assembly, for each variation `i`, append every non-null file under `variation_${i}_images` (multer reads each as its own field)
- [x] 15.8 Update the inline preview block in the variation row to render all of that variation's previews (small thumbs, `size-12`) in a horizontal flex row

## 16. Frontend: API client + constants

- [x] 16.1 In `client/lib/constants.js`, add `export const MAX_PRODUCT_IMAGES = 3` and use it in the publish form
- [x] 16.2 In `client/lib/api.js`, verify that `artAPI.create` and `othersAPI.create` already forward `FormData` opaquely (no need to enumerate fields); if they explicitly list field names, update to support the new fields

## 17. Frontend: all other surfaces consuming product.basename

- [x] 17.1 `client/components/ProductGrid.js`: change `product.basename` to `product.thumbnail_basename` (line 21)
- [x] 17.2 `client/components/ShoppingCartDrawer.js`: cart items keep their snapshot `basename` field — no change (line 178-179 already reads `item.basename`)
- [x] 17.3 `client/components/AuctionImageMosaic.js`: read `product.thumbnail_basename` instead of `product.basename`
- [x] 17.4 `client/components/DrawParticipationModal.js` and `client/components/DrawGridItem.js`: same — switch to `thumbnail_basename` (draw cards consume `draw.basename` set by drawService COALESCE subquery — no client change needed)
- [x] 17.5 `client/app/orders/[id]/page.js`, `client/app/orders/page.js`, `client/app/admin/pedidos/[id]/page.js`: order line items snapshot `basename` from the API — no change (item.basename remains, subquery feeds it)
- [x] 17.6 `client/app/admin/authors/[id]/page.js`, `client/app/admin/products/[id]/preview/page.js`: switch product images to `thumbnail_basename` for grid views; use the carousel component (or `product.images`) for any detail surface
- [x] 17.7 `client/app/seller/products/page.js`: list view — switch to `thumbnail_basename`
- [x] 17.8 `client/app/eventos/subasta/[id]/AuctionDetail.js`: switch product image displays to `thumbnail_basename` (or carousel if it has a detail view)
- [x] 17.9 `client/app/eventos/sorteo/[id]/DrawDetail.js`, `client/app/eventos/sorteo/[id]/page.js`: same as auctions (consume `draw.basename` from COALESCE subquery — no client change)
- [x] 17.10 `client/app/pedido/[token]/page.js`: order tracking page — order item snapshots `basename` — verify the API returns it (subquery in 9.x); no UI change expected
- [x] 17.11 `client/components/coa/CoaSuccess.js`: art product preview — backend maps `art_basename` → `basename` so client unchanged
- [x] 17.12 `client/app/galeria/p/[id]/page.js` and `client/app/tienda/p/[id]/page.js`: server-side fetches feed the detail components — verify the response shape is correctly threaded into props
- [x] 17.13 `client/lib/serverApi.js`: any image URL building based on basename — verify no breakage when basename comes from `thumbnail_basename` or `images[]`

## 18. Existing seller variation edit modal

- [x] 18.1 `client/components/seller/VariationEditModal.js` (or wherever it lives): keep behavior unchanged — variation images are still not editable post-creation (per existing variation-images spec, scenario "Seller opens variation edit modal")

## 19. Tests

- [x] 19.1 Add backend integration test: `POST /api/art` with 1, 2, 3 image files succeeds and `GET /api/art/:id` returns `images` array of correct length
- [x] 19.2 Add backend integration test: `POST /api/art` with 0 image files returns 400
- [x] 19.3 Add backend integration test: `POST /api/others` with global images and per-variation images persists correctly; `GET /api/others/:id` returns nested `variations[i].images`
- [x] 19.4 Add backend integration test: `POST /api/others` with a variation that has zero images succeeds
- [x] 19.5 Add backend integration test: `DELETE /api/art/:id` removes all `product_images` rows + files
- [x] 19.6 Add backend integration test: `DELETE /api/others/:id` removes global + variation images
- [x] 19.7 Manual smoke: create one art with 1 image, one art with 3 images, one others with no variation images, one others with 2 variations × 2 images each; verify gallery grid, tienda grid, detail pages, add-to-cart, checkout, order email, admin views all render images correctly

## 20. Documentation

- [x] 20.1 Update `CLAUDE.md` "Database Schema Management" section to mention the new `product_images` table and the polymorphic `product_type` values (`art`, `other`, `other_var`)
- [x] 20.2 Add a brief note in `api/.env.example` or top-of-file comments about deployment: operator must drop the affected tables once before deploy (no migration path)
