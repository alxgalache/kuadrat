## Context

Two small improvements requested:
1. The "others" product detail page (`OthersProductDetail.js`) always shows a variant `<select>` even when the product has a single variation — confusing for users.
2. Admins must connect to the database to approve seller-submitted products. The admin panel already has product edit/preview/visibility/delete routes under `/api/admin/products/` and frontend pages under `/admin/products/`.

## Goals / Non-Goals

**Goals:**
- Hide the variant selector when an "others" product has exactly one variation (the implicit "Opción estándar").
- Add a `PUT /api/admin/products/:id/status` endpoint to change product status to `"approved"`.
- Add an "Aprobar" button in the admin product preview page for pending products.

**Non-Goals:**
- No rejection workflow (only approval, as requested).
- No notification email to sellers on approval (can be added later).
- No changes to the art product detail page variant logic (art products don't have variations).

## Decisions

### 1. Variant selector visibility logic
The condition to show the selector will check `product.variations.length > 1` instead of just `> 0`. When there's exactly one variation, it's auto-selected internally (already happens via `loadProduct`) and the dropdown is hidden. No functional change to cart/checkout — `selectedVariant` is still set.

### 2. Reuse existing admin product route pattern
The new endpoint follows the same pattern as `PUT /:id/visibility` in `api/routes/admin/productRoutes.js`: receive `product_type` in the body, validate it, update the appropriate table. Endpoint: `PUT /api/admin/products/:id/status` with body `{ product_type: "art" | "others", status: "approved" }`.

### 3. Admin UI placement
Add the approve button directly in the existing preview page (`/admin/products/[id]/preview/page.js`), inside the yellow preview banner area. Only shown when `product.status === 'pending'`. This avoids creating new pages.

## Risks / Trade-offs

- [No rejection flow] → Acceptable for now; admin can still manually hide products via visibility toggle or soft-delete.
- [Status only goes to "approved"] → If future statuses are needed (rejected, suspended), the endpoint accepts a `status` field that could be extended. For now, we validate it must be `"approved"`.
