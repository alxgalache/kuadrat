## 1. Database Schema (HIGH-RISK: shared infrastructure)

- [x] 1.1 Add `for_draw INTEGER NOT NULL DEFAULT 0` column to the `art` CREATE TABLE statement in `api/config/database.js` (after the existing `for_auction` column)
- [x] 1.2 Add `for_draw INTEGER NOT NULL DEFAULT 0` column to the `others` CREATE TABLE statement in `api/config/database.js` (after the existing `for_auction` column)

## 2. Product Listing Queries

- [x] 2.1 Add `AND (a.for_draw = 0 OR a.for_draw IS NULL)` filter to the public listing query in `api/controllers/artController.js` (`getAllArtProducts`, line ~29)
- [x] 2.2 Add `AND (o.for_draw = 0 OR o.for_draw IS NULL)` filter to the public listing query in `api/controllers/othersController.js` (`getAllOthersProducts`, line ~29)

## 3. Draw Service — Flag Management

- [x] 3.1 Add a helper function `setProductDrawFlag(productId, productType, value)` in `api/services/drawService.js` that updates `for_draw` on the correct table (`art` or `others`) based on `productType`
- [x] 3.2 In `createDraw()` in `api/services/drawService.js`, call `setProductDrawFlag(product_id, product_type, 1)` after inserting the draw
- [x] 3.3 In `cancelDraw()` in `api/services/drawService.js`, call `setProductDrawFlag(product_id, product_type, 0)` after updating the draw status
- [x] 3.4 In `deleteDraw()` in `api/services/drawService.js`, call `setProductDrawFlag(product_id, product_type, 0)` before deleting the draw record (using the draw data fetched at the start)
- [x] 3.5 In `updateDraw()` in `api/services/drawService.js`, if `product_id` or `product_type` changed, reset the old product's flag to 0 and set the new product's flag to 1
