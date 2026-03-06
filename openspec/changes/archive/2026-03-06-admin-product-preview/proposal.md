## Why

When a seller creates a new product (art or others), it enters `pending` status and is invisible to the public. The admin must approve it, but currently has no way to see how the product will look on the live site. The admin can only see raw data in the author profile table. A preview page that renders the product exactly as it will appear publicly would let the admin make informed approval decisions without manually checking fields.

## What Changes

- **New admin preview page**: A page at `/admin/products/[id]/preview?type=art|others` that renders the product using the same layout as the public detail pages (`ArtProductDetail` / `OthersProductDetail`), but fetches data via admin API (no status/visibility filter). Cart/purchase functionality is disabled — this is read-only.
- **New admin API endpoint**: `GET /api/admin/products/:id/preview?type=art|others` that returns the full product data from the `art` or `others` table regardless of `status` or `visible`, including seller info and (for others) variations.
- **Preview link in notification email**: The `sendNewProductNotificationEmail` function receives the product ID and type, and includes a direct link to the preview page in the email body.
- **Preview button in author products table**: A new icon button (eye icon) in the actions column of the products table on `/admin/authors/[id]` linking to the preview page.

## Capabilities

### New Capabilities

- `admin-product-preview`: Admin-only page and API endpoint for previewing any product (including pending/hidden) as it would appear to the public.

### Modified Capabilities

_(none)_

## Impact

- **Backend files**:
  - `api/routes/admin/productRoutes.js` — new GET route for preview
  - `api/controllers/artController.js` — pass product ID to email function
  - `api/controllers/othersController.js` — pass product ID to email function
  - `api/services/emailService.js` — accept product ID/type, add preview link to email
- **Frontend files**:
  - `client/app/admin/products/[id]/preview/page.js` — new page (AuthGuard admin)
  - `client/app/admin/authors/[id]/page.js` — add preview button to table
  - `client/lib/api.js` — add `adminAPI.products.getPreview()` method
- No database changes.
