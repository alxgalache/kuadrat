## Context

The admin currently has an orders page at `/admin/pedidos` that shows all orders with filters, but it does not provide the seller-centric shipment view with product images, carrier info, and status tabs that sellers see at `/seller/pedidos`. The admin needs a read-only version of this view to monitor seller shipments without accessing seller accounts.

The existing `getSellerOrders` controller in `sellerOrdersController.js` extracts `sellerId` from the JWT. A new admin endpoint will accept `sellerId` as a query parameter instead, reusing the same data aggregation logic.

## Goals / Non-Goals

**Goals:**
- Give admin a read-only view of any seller's shipments, identical in layout to the seller's own view
- Allow admin to select a seller from a dropdown and filter by status tab
- Reuse the existing seller orders query logic to avoid duplication

**Non-Goals:**
- No action buttons for admin (no label download, pickup scheduling, service points)
- No bulk actions for admin
- No modification of the existing seller orders page or endpoint
- No per-item status changes from this page (that's already in `/admin/pedidos`)

## Decisions

### 1. Backend: new controller function vs. reusing existing

**Decision**: Create a new `getSellerShipmentsAdmin` controller function in `sellerOrdersController.js` that accepts `sellerId` as a query parameter and reuses the same SQL queries.

**Rationale**: The existing `getSellerOrders` extracts `sellerId` from `req.user.id`. Modifying it to accept an optional param would mix admin and seller auth concerns. A separate function is cleaner and can be placed behind `adminAuth` middleware independently.

**Alternative considered**: Adding a `?sellerId=` override to the existing endpoint with admin role check. Rejected because it would conflate two different auth patterns in one route.

### 2. Frontend: new page component vs. shared component

**Decision**: Create a new page at `client/app/admin/envios-seller/page.js` that is self-contained, reusing the same visual patterns (card layout, status tabs, image rendering) from the seller page but without the action buttons and with a seller selector at the top.

**Rationale**: The admin page has significant differences (seller selector, no actions, no modals, different auth guard) that make a shared component approach not worth the abstraction cost. Copying the visual structure is simpler and more maintainable.

### 3. Seller list: separate API call vs. inline in response

**Decision**: Use the existing `adminAPI.authors.getAll()` endpoint to populate the seller dropdown. No new endpoint needed.

**Rationale**: The `GET /api/admin/authors` endpoint already returns all sellers with `id`, `full_name`, and `email`. This is exactly what the dropdown needs.

### 4. Route path

**Decision**: Use `/admin/envios-seller` for the page route and "Envíos vendedor" as the nav label.

**Rationale**: Avoids conflict with the existing `/admin/envios` (legacy shipping methods page). The "-seller" suffix clarifies this is about seller shipments, not shipping method configuration.

## Risks / Trade-offs

- **[Trade-off] Code duplication with seller page**: The card rendering and tab logic will be similar to the seller page. This is acceptable — extracting shared components would add abstraction for only two consumers and the admin version intentionally omits significant UI (actions, modals).
- **[Risk] Seller list could be large**: If many sellers exist, the dropdown could be long. Acceptable for now — the admin already manages sellers via a full list in `/admin/autores`.
