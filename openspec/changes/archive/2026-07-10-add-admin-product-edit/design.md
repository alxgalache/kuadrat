# Design: add-admin-product-edit

## Context

The seller publish form (`client/app/seller/publish/page.js`, ~1080 lines) is a single-page client component handling both `art` and `other` product creation: text fields, Quill description, price with net-earnings preview, weight/dimensions, checkboxes, up to 3 global images (dropzone slots), and — for `other` — global stock OR named variations each with up to 3 images. It submits `FormData` to `POST /api/art` or `POST /api/others`.

The admin author detail page (`client/app/admin/authors/[id]/page.js`) lists the author's products (`product_type` is `'art'` or `'others'` as returned by `adminAPI.authors.getProducts`). Per-product actions today: preview (eye), variations/stock modal (pencil, `others` only), visibility toggle, delete.

There is **no full-update endpoint** for either product type. Admin routes live under `api/routes/admin/` with `authenticate + adminAuth` applied once in `routes/admin/index.js`. Creation controllers (`createArtProduct`, `createOthersProduct`) contain the validation, slug generation, image storage (S3 or local disk, per `config.useS3`), `product_images` inserts, and failure cleanup.

Constraints: the publish flow must remain exactly as-is; no schema changes needed; all UI text in Spanish; no TypeScript.

## Goals / Non-Goals

**Goals:**
- Admin can fully edit any `art` or `others` product from the author detail page.
- Edit form is the same form as publish (same look, same validations), pre-populated.
- Existing images (global and per-variation) are shown, replaceable, removable, and new ones addable, within the same 1..3 slot limits.
- Variations can be renamed, re-stocked, added, and removed in the full edit form.
- Orphaned image files are deleted from storage after a successful update.

**Non-Goals:**
- No seller-facing edit capability (admin only).
- No change to the review/approval cycle — `status` is untouched by edits.
- No slug regeneration on rename — public URLs remain stable.
- No change to the stock/variations quick modal behavior (only its icon changes).
- No audit/history of edits.

## Decisions

### D1: Extract a shared `ProductForm` component with `mode` prop

Extract the form (state, handlers, validation, JSX) from `publish/page.js` into `client/components/ProductForm.js` with props:

- `mode`: `'create' | 'edit'`
- `initialProduct` (edit only): full product object incl. `images[]` and `variations[]` (each with `images[]`)
- `productType` (edit only): `'art' | 'other'` — the category selector is rendered disabled/hidden in edit mode (a product cannot change type)
- `onSubmit(formData)`: caller-provided submit handler; the component builds the `FormData`

`publish/page.js` becomes a thin wrapper: `<AuthGuard requireRole="seller"><ProductForm mode="create" onSubmit={...create...} /></AuthGuard>` with identical success toast + redirect. **Alternative considered**: duplicating the page for edit — rejected: ~1000 duplicated lines that will drift; the extraction is mechanical and `create` mode keeps the exact same code paths.

Edit-mode differences inside the component (all conditional on `mode`):
- Heading/labels: "Editar producto", submit button "Guardar cambios" (loading: "Guardando...").
- Category selector fixed to the product's type.
- Net-earnings preview: uses the product's seller commission rates fetched via an admin endpoint variant (or hidden if unavailable) — in create mode it keeps using `sellerAPI.getCommissionRates()` untouched.
- Image slots initialized from existing images (see D3).
- Variations initialized from existing variations, keeping their `id` (see D4).

### D2: New admin page `client/app/admin/products/[id]/edit/page.js`

Route: `/admin/products/[id]/edit?type=art|others` (mirrors the existing preview route convention `/admin/products/[id]/preview?type=...`). Wrapped in `<AuthGuard requireRole="admin">`. Loads product data via a new `GET /api/admin/products/:id/edit-data?type=art|others` endpoint that returns the full row with hydrated `images` (via `attachProductImages`) and, for others, `variations` each hydrated with their `other_var` images, plus the seller's commission rates for the earnings preview. On success, navigates back to `/admin/authors/[sellerId]` with a success notification.

### D3: Image slot model for edit — "kept + new" reconciliation

Each image slot in edit mode is one of: `{ existing: { basename } }`, `{ file, previewUrl }` (new upload), or `null`. Existing images preview via `getArtImageUrl`/`getOthersImageUrl`.

On submit the component appends to `FormData`:
- `images_manifest`: JSON array describing final slot order, e.g. `[{"kind":"existing","basename":"..."},{"kind":"new"}]`
- `images`: the new `File`s, in the same relative order as the `"new"` manifest entries

The backend reconciles: validates manifest basenames belong to this product, deletes `product_images` rows (and storage files) for basenames no longer present, uploads new files, and rewrites `position` to match the manifest order. Same per-file validation as creation (MIME, ≥600×600, ≤3 total, first required — with the same exception for others-with-variations). **Alternative considered**: delete-all-and-reupload — rejected: forces re-download/re-upload of unchanged images and churns basenames referenced by order snapshots.

### D4: Variation reconciliation by `id`

The `variations` JSON gains an optional `id` per entry in edit mode: entries with a known `id` are UPDATEd, entries without are INSERTed, and existing `other_vars` rows absent from the payload are DELETEd along with their `product_images` (`other_var`) rows and files. Per-variation images use the same manifest approach as D3 (`variation_<idx>_images_manifest` + `variation_<idx>_images` files). This mirrors the reconciliation already done in `PUT /api/admin/others/:id/variations`, extended with images.

### D5: Backend endpoints and controller placement

New file `api/controllers/adminProductEditController.js` exposing:
- `getProductEditData` → `GET /api/admin/products/:id/edit-data` (registered in `routes/admin/productRoutes.js`, before `/:id`)
- `updateArtProduct` → `PUT /api/admin/art/:id` (new `routes/admin/artRoutes.js`, mounted in `routes/admin/index.js`)
- `updateOthersProduct` → `PUT /api/admin/others/:id` (added to existing `routes/admin/othersRoutes.js`)

Both PUTs use the same multer field configs as the public create routes (`upload.fields`). Shared validation logic (name/description/price/type/weight/dimensions, per-file image checks) is extracted from the create controllers into `api/utils/productValidation.js` and reused by both create and update so rules cannot drift. Update semantics:
- `slug`: never changed.
- `status`, `visible`, `is_sold`, `for_auction`/`for_draw` flags: `for_auction` and `ai_generated` (and `can_copack` for others) are editable via the form checkboxes as on create; `status`/`visible`/`is_sold`/`for_draw` are not touched by this endpoint (they have dedicated actions).
- Uniqueness on rename: name changes are allowed; since slug is kept, no slug-collision check is needed.
- Storage cleanup: new files are written first; DB updates run in a `createBatch()`; removed files are deleted from storage only **after** the DB commit succeeds (deletion failures are logged, not fatal). On DB failure, newly written files are cleaned up as in create.

**Alternative considered**: reusing seller-scoped update endpoints with an admin bypass — rejected: no such endpoints exist, and admin routes already have the auth stack applied centrally.

### D6: Action icons in the admin products table

- Full edit (all products): `PencilIcon` → links to `/admin/products/[id]/edit?type=...`.
- Stock/variations modal (`others` only): switches from `PencilIcon` to `AdjustmentsHorizontalIcon` (heroicons outline), title "Editar stock y variaciones". Colors stay in the existing scheme (indigo for the modal action; gray/black for edit, consistent with sibling actions).

## Risks / Trade-offs

- [Refactor risk: publish flow regression while extracting `ProductForm`] → The extraction moves code verbatim; create mode keeps identical state, validation, and submit logic. Manual verification of the publish flow is a required task.
- [Orphaned storage files if deletion-after-commit fails] → Deletion failures are logged with basename; files are unreferenced but harmless. Consistent with the existing create-cleanup approach.
- [Concurrent edit vs. purchase (stock changes between load and save)] → Admin-only, low frequency; last-write-wins on `other_vars.stock`, same as the existing variations modal.
- [Multipart body size for 3 + 20×3 images] → Same limits already accepted by the public create route; reuse the same multer config.
- [`product_type` naming mismatch (`'others'` in admin listings vs `'other'` in `product_images`)] → The edit page normalizes once at the boundary (query param `type=art|others`, storage type `'art'|'other'`/`'other_var'`), as the preview endpoint already does.

## Migration Plan

Pure additive feature + internal refactor; no schema or data migration. Deploy API and client together (client calls new endpoints). Rollback = revert the commit; no persistent state to unwind (edits already applied remain, as intended).

## Open Questions

None — decisions above cover slug stability, status handling, and icon assignment as agreed in the proposal.
