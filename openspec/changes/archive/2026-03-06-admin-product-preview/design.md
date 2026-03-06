## Context

Currently, when a seller creates a product, it enters `pending` status with `visible = 0`. The public API endpoints (`GET /api/art/:id`, `GET /api/others/:id`) filter by `visible = 1 AND status = 'approved'`, so pending products are inaccessible. The admin must approve products from the author detail page but has no visual preview.

The public product detail pages are in `client/app/galeria/p/[id]/ArtProductDetail.js` and `client/app/tienda/p/[id]/OthersProductDetail.js`. These fetch data from `artAPI.getById()` and `othersAPI.getById()` which hit the public endpoints.

The admin already has auth-protected routes under `api/routes/admin/` (all routes in `admin/index.js` apply `authenticate` + `adminAuth` middleware). The admin product routes are at `api/routes/admin/productRoutes.js`.

## Goals / Non-Goals

**Goals:**
- Allow admin to preview any product (pending, approved, hidden) exactly as it would appear publicly
- Provide quick access to preview from the author products table and from notification emails
- Reuse the existing product detail page layout/code

**Non-Goals:**
- Allowing inline editing from the preview page (existing edit page handles that)
- Showing preview for deleted/removed products
- Adding approval actions to the preview page

## Decisions

### 1. New admin API endpoint at `GET /api/admin/products/:id/preview`

**Rationale**: The existing public endpoints filter by `visible=1 AND status='approved'`. Rather than adding bypass params to public endpoints (which would be a security concern), a dedicated admin-only route is cleaner. It mirrors the query structure from the public controllers but removes the status/visibility filter and adds `removed = 0` only.

**Query structure**: Same as `getArtProductById` / `getOthersProductById` but without `visible = 1 AND status = 'approved'` filter. The `type` query param selects which table to query (`art` or `others`). For `others`, variations are fetched from `other_vars` and attached.

### 2. Single preview page component with conditional rendering

**Rationale**: Instead of two separate admin pages (one for art, one for others), a single page at `client/app/admin/products/[id]/preview/page.js` reads the `type` query param and renders the appropriate layout. This is simpler to maintain and uses a single route.

**Implementation**: The page component reads `type` from `searchParams`, fetches the product via `adminAPI.products.getPreview(id, type)`, and renders either the art preview or others preview section. Both sections replicate the public page layout but strip out all cart/purchase functionality.

### 3. Copy layout code, don't import shared components

**Rationale**: The public detail pages have deeply coupled state (cart context, shipping modals, hover states). Extracting a shared "read-only layout" component would require significant refactoring of existing code. Copying the JSX layout and removing cart logic is simpler, lower-risk, and aligned with the user's request to "replicate the code."

### 4. Pass product ID to email function

**Rationale**: The `sendNewProductNotificationEmail` currently receives `{ sellerName, productName, productType }`. Adding `productId` to the params lets the function construct the preview URL. The callers in `artController.js` and `othersController.js` have access to the product ID at the call site (`result.lastInsertRowid` for art, `productId` for others).

## Risks / Trade-offs

- **Code duplication**: The preview page duplicates the layout from the public pages. If the public pages change significantly, the preview page needs manual sync. This is acceptable given the layout is stable and the alternative (shared components) would require heavy refactoring.
- **Email link visibility**: The preview link in emails is only useful for authenticated admins. If forwarded, non-admins will be blocked by AuthGuard. No security risk.
