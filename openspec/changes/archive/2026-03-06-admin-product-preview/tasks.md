## 1. Backend — Admin Preview API Endpoint

- [x] 1.1 Add `GET /:id/preview` route to `api/routes/admin/productRoutes.js`. Accept `type` query param (`art` or `others`). Query the corresponding table joined with `users` for seller info (`seller_full_name`, `seller_slug`), filtering only by `removed = 0` (no status/visibility filter). For `others`, also fetch variations from `other_vars`. Return 400 for missing/invalid type, 404 for not found.

## 2. Backend — Email Preview Link

- [x] 2.1 Update `sendNewProductNotificationEmail` in `api/services/emailService.js` to accept `productId` in addition to existing params. Add a "Ver producto" button/link in the email HTML that points to `${CLIENT_URL}/admin/products/${productId}/preview?type=${productType}`.
- [x] 2.2 Update the call in `api/controllers/artController.js` (line ~295) to pass `productId: result.lastInsertRowid` to `sendNewProductNotificationEmail`.
- [x] 2.3 Update the call in `api/controllers/othersController.js` (line ~361) to pass `productId: productId` to `sendNewProductNotificationEmail`.

## 3. Frontend — API Client

- [x] 3.1 Add `getPreview` method to `adminAPI.products` in `client/lib/api.js`: `getPreview: async (id, type) => apiRequest(\`/admin/products/${id}/preview?type=${type}\`)`.

## 4. Frontend — Admin Preview Page

- [x] 4.1 Create `client/app/admin/products/[id]/preview/page.js`. Wrap in `AuthGuard requireRole="admin"`. Read `id` from params and `type` from `searchParams`. Fetch product via `adminAPI.products.getPreview(id, type)`. Render a "Previsualizacion" banner at the top. Conditionally render art layout or others layout based on `type`, replicating the public page visual structure (image, name, price, description, author, AI badge, support type for art, variations for others) but without cart buttons — show a disabled placeholder button instead.

## 5. Frontend — Preview Button in Author Products Table

- [x] 5.1 Add a preview link/button to the actions column in `client/app/admin/authors/[id]/page.js`. Use the `EyeIcon` (already imported). Link to `/admin/products/${product.id}/preview?type=${product.product_type}`. Place it before the existing visibility toggle button.
