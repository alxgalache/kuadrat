## 1. Hide variant selector for single-variant others products

- [x] 1.1 In `client/app/tienda/p/[id]/OthersProductDetail.js`, change the variant `<select>` condition from `product.variations.length > 0` to `product.variations.length > 1` so the dropdown only shows when there are multiple variations.

## 2. Admin product approval — Backend

- [x] 2.1 Add `PUT /:id/status` route in `api/routes/admin/productRoutes.js` that accepts `{ product_type, status }`, validates input, checks product exists (`removed = 0`), and updates the `status` column in the `art` or `others` table. Follow the existing `/:id/visibility` pattern.
- [x] 2.2 Add `adminAPI.products.updateStatus(id, productType, status)` method in `client/lib/api.js`.

## 3. Admin product approval — Frontend

- [x] 3.1 In `client/app/admin/products/[id]/preview/page.js`, add an "Aprobar" button in the preview banner when `product.status === 'pending'`. On click, call the approval endpoint, show a success notification, and update the local product state.
