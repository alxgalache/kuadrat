## Why

Two minor UX/workflow issues need fixing: (1) the "others" product detail page shows an unnecessary variant selector when a product has no real variations, and (2) admins currently need direct database access to approve products submitted by sellers, which is error-prone and slow.

## What Changes

- **Hide variant selector for single-variant "others" products**: When an "others" product has only one variation (the default "Opción estándar"), the `<select>` dropdown is unnecessary and confusing. It will be hidden, auto-selecting the single variant internally.
- **Admin product approval action**: Add a UI action (button) in the admin interface to change a product's `status` from `"pending"` to `"approved"`, for both `art` and `other` product types. This requires a new API endpoint and admin UI controls.

## Capabilities

### New Capabilities
- `admin-product-approval`: Admin-facing endpoint and UI to approve pending products (art and others) without direct DB access.

### Modified Capabilities
<!-- No existing spec-level requirement changes -->

## Impact

- **Frontend**: `client/app/tienda/p/[id]/OthersProductDetail.js` (variant selector visibility logic), admin product management pages (approval button).
- **Backend**: New admin route + controller action for status update on `art` and `other` tables.
- **API**: New `PATCH` or `PUT` endpoint under `/admin/` for product approval.
