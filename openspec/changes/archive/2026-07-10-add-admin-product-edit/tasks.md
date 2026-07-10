# Tasks: add-admin-product-edit

## 1. Backend — shared validation and update endpoints

- [x] 1.1 Extract shared product field validation (name/description/price/type/weight/dimensions) and per-file image validation (MIME, ≥600×600) from `createArtProduct`/`createOthersProduct` into `api/utils/productValidation.js`, and refactor both create controllers to use it with zero behavior change
- [x] 1.2 Create `api/controllers/adminProductEditController.js` with `getProductEditData`: full product row + hydrated `images` (via `attachProductImages`), variations with images for others, and the seller's commission rates; 404 for missing/removed products
- [x] 1.3 Implement `updateArtProduct` in the admin controller: field validation via shared utils, image manifest reconciliation (validate kept basenames belong to the product, upload new files, batch DB update, rewrite positions, delete removed files after commit, cleanup new files on DB failure); never touch `slug`/`status`/`visible`
- [x] 1.4 Implement `updateOthersProduct`: same field/image handling plus variation reconciliation by `id` (update/insert/delete `other_vars` and their `other_var` images), supporting global-stock ↔ variations mode switches with creation-equivalent validation
- [x] 1.5 Register routes: `GET /products/:id/edit-data` in `api/routes/admin/productRoutes.js` (before `/:id`), `PUT /:id` in a new `api/routes/admin/artRoutes.js` (mount `/art` in `routes/admin/index.js`), and `PUT /:id` in `api/routes/admin/othersRoutes.js` — reusing the create routes' multer field configs

## 2. Frontend — shared ProductForm extraction

- [x] 2.1 Extract the publish form into `client/components/ProductForm.js` with `mode` (`create`/`edit`), `initialProduct`, `productType`, and `onSubmit(formData)` props; move `validateImageFile` and `ImageDropzoneSlot` along with it
- [x] 2.2 Rewrite `client/app/seller/publish/page.js` as a thin wrapper using `<ProductForm mode="create">` with the existing create submit, success notification, and redirect — verify the publish flow is behaviorally identical (fields, validations, variations, images, net-earnings preview)
- [x] 2.3 Add edit-mode support to `ProductForm`: pre-populate all fields from `initialProduct`, initialize image slots from existing images (slot union type existing|new|empty, previews via image URL helpers), initialize variations with their `id`s and images, lock the category selector, edit-mode labels ("Editar producto" / "Guardar cambios"), and build the edit `FormData` (manifests + new files per design D3/D4)
- [x] 2.4 Use commission rates supplied by the edit-data endpoint for the net-earnings preview in edit mode (hide preview when unavailable); keep `sellerAPI.getCommissionRates()` untouched in create mode

## 3. Frontend — admin edit page and entry actions

- [x] 3.1 Add `adminAPI.products.getEditData(id, type)`, `adminAPI.products.updateArt(id, formData)`, and `adminAPI.products.updateOthers(id, formData)` to `client/lib/api.js`
- [x] 3.2 Create `client/app/admin/products/[id]/edit/page.js`: AuthGuard `admin`, read `type` query param, load edit data, render `<ProductForm mode="edit">`, submit to the matching update endpoint, then success notification and navigate back to the author page
- [x] 3.3 Update `client/app/admin/authors/[id]/page.js`: add pencil edit action (all rows) linking to the edit page; switch the variations modal action to `AdjustmentsHorizontalIcon` with title "Editar stock y variaciones"

## 4. Verification

- [x] 4.1 Verify seller publish flow end-to-end (art and others, with and without variations) is unchanged
- [x] 4.2 Verify admin edit flow: art field edits, image replace/remove/add and reordering effects, others variation add/rename/remove, global-stock ↔ variations switch, slug/status untouched, orphaned files removed
- [x] 4.3 Verify authorization: seller/anonymous requests to the new endpoints and page are rejected
