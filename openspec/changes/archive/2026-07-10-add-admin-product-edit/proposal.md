# Proposal: add-admin-product-edit

## Why

Admins currently cannot correct or update a product's information after it is published. From the author detail page (`/admin/authors/[id]`) the only per-product actions are preview, visibility toggle, delete, and — for `others` products — a modal limited to stock/variations. Any fix to name, description, price, images, weight, etc. requires direct DB manipulation. Admins need a full edit capability for both `art` and `other` products.

## What Changes

- **New admin edit action** in the products table of `/admin/authors/[id]`, for every product (both `art` and `others` types), navigating to a new admin product-edit page.
- **Icon reshuffle** on `others` rows: the full-edit action takes the pencil icon; the existing stock/variations modal action changes to a different icon (stock/variations-themed) so both actions coexist without ambiguity.
- **New admin product edit page** whose form is visually and functionally identical to the seller publish form (`/seller/publish`), pre-populated with the product's current data (including existing images and, for `others`, variations with their images). Submitting saves changes to the existing product instead of creating a new one.
- **Shared product form component**: the publish page's form is extracted into a reusable component supporting `create` and `edit` modes. The seller publish flow MUST remain byte-for-byte identical in behavior and appearance.
- **New admin-only backend endpoints** to fully update an `art` or `others` product, including image replacement/reordering and variation reconciliation (multipart upload, same validation rules as creation).
- **No re-review**: edited products keep their current `status` (admin edits are trusted; no pending/approval cycle) and keep their existing `slug` (public URLs never break on rename).

## Capabilities

### New Capabilities
- `admin-product-edit`: Admin-only full editing of art and others products — entry actions in the admin author products table, edit form pre-populated from current product data, and backend update endpoints covering fields, images, and variations.

### Modified Capabilities

None — the seller publish flow, variation stock modal behavior, and product-image storage requirements are unchanged; only their internal implementation is refactored/reused.

## Impact

- **Frontend**
  - `client/app/admin/authors/[id]/page.js` — new edit action + icon change on the variations action.
  - `client/app/seller/publish/page.js` — form extracted to a shared component (no behavior change).
  - New: `client/components/ProductForm.js` (shared create/edit form), `client/app/admin/products/[id]/edit/page.js` (admin edit page, AuthGuard `admin`).
  - `client/lib/api.js` — new `adminAPI.products.getForEdit` / `updateArt` / `updateOthers` methods.
- **Backend**
  - New admin routes: `GET /api/admin/products/:id/edit-data` (full product incl. images/variations), `PUT /api/admin/art/:id`, `PUT /api/admin/others/:id` (multipart, admin auth via `routes/admin/index.js`).
  - `api/controllers/artController.js` / `othersController.js` (or a new admin controller) — update logic reusing the existing creation validation and image-storage helpers (`product_images` table, S3/local storage, cleanup on failure).
- **Database**: no schema changes; reuses `art`, `others`, `other_vars`, `product_images`.
- **Security**: endpoints mounted under `routes/admin/index.js` (authenticate + adminAuth already applied).
