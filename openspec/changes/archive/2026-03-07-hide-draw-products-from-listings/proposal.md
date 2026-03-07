## Why

Products assigned to a draw (sorteo) are currently displayed in the Galeria (art) and Tienda (others) pages alongside regular products. This is incorrect — draw products should only be accessible through their corresponding draw, not purchasable through the regular gallery/shop flow. Similar to how `for_auction` excludes products from listings, draw-linked products need to be filtered out.

## What Changes

- Add a `for_draw` column to both the `art` and `others` tables (analogous to the existing `for_auction` column) to flag products assigned to a draw.
- Update the public product listing queries in `artController.js` and `othersController.js` to exclude products where `for_draw = 1`.
- Set `for_draw = 1` on products when they are linked to a draw, and reset it when a draw is cancelled or deleted.

## Capabilities

### New Capabilities
- `draw-product-exclusion`: Filter products linked to active draws out of gallery/shop public listings.

### Modified Capabilities
- `draw-management`: When creating, updating, or deleting a draw, the linked product's `for_draw` flag must be set/unset accordingly.

## Impact

- **Backend schema**: New `for_draw` column on `art` and `others` tables in `api/config/database.js`.
- **Backend controllers**: `artController.js` and `othersController.js` listing queries gain an additional WHERE clause.
- **Backend service**: `drawService.js` must update `for_draw` on create/cancel/delete operations.
- **Admin controller**: `drawAdminController.js` may need updates for draw lifecycle transitions affecting the flag.
- **No frontend changes required** — the filtering is entirely server-side; the gallery/shop pages will simply stop receiving draw products.
