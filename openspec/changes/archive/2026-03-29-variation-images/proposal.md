## Why

"Others" products currently support only a single image regardless of how many variations (color, size, etc.) they have. Sellers offering products in multiple visual variants need to show a different image per variation so buyers can see exactly what they're purchasing before selecting an option.

## What Changes

- Each variation row in the publish form gains an image upload field (alongside name + stock)
- The main product image is always required and used for listing thumbnails/grids
- Per-variation images are stored in the same `uploads/others/` directory using UUID basenames
- The product detail page switches the displayed image based on the currently selected variation
- On hard delete, both the main product image and all variation images are cleaned up from disk
- The image label in the publish form is renamed to "Imagen para el listado de productos"
- Maximum 10 variations per product (existing limit)

## Capabilities

### New Capabilities

- `variation-images`: Per-variation image upload, storage, and display for "others" products. Covers the database schema change, backend upload/validation/serving, frontend form changes, and detail page image switching.

### Modified Capabilities

(none)

## Impact

- **Database**: `other_vars` table gains a `basename TEXT` column
- **Backend**: `api/controllers/othersController.js` (create + delete handlers), `api/routes/othersRoutes.js` (multer config change from single to fields)
- **Frontend**: `client/app/seller/publish/page.js` (form), `client/app/tienda/p/[id]/OthersProductDetail.js` (detail view), `client/lib/api.js` (FormData construction)
- **Unchanged**: `VariationEditModal`, `getOthersImageUrl()`, image serving endpoint, seller products list, soft delete route
