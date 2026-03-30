## 1. Backend - Admin Seller Shipments Endpoint

- [x] 1.1 Add `getSellerShipmentsAdmin` controller function in `api/controllers/sellerOrdersController.js` — accepts `sellerId` from `req.query`, validates it's present, then runs the same query logic as `getSellerOrders` using the provided `sellerId` instead of `req.user.id`; returns same response shape (orders, pagination, sellerConfig)
- [x] 1.2 Add route `GET /orders/seller-shipments` in `api/routes/admin/orderRoutes.js` — import and wire `getSellerShipmentsAdmin`; place before the `/:id` route to avoid parameter capture conflict
- [x] 1.3 Add `getSellerShipments` method to `adminAPI.orders` in `client/lib/api.js` — `GET /admin/orders/seller-shipments?sellerId=X&status=Y&page=Z`

## 2. Frontend - Admin Seller Shipments Page

- [x] 2.1 Create `client/app/admin/envios-seller/page.js` — new page with `AuthGuard requireRole="admin"`, seller dropdown, status tabs, and order cards (same visual as seller page but without action buttons, pickup/service-points modals, or bulk actions bar)
- [x] 2.2 Implement seller dropdown — load sellers via `adminAPI.authors.getAll()` on mount; show select with full_name + email; on selection, load shipments and reset status filter to null and page to 1
- [x] 2.3 Implement order cards without actions — reuse same card layout from seller page (product images, quantity badges, variant names, order date, delivery address, carrier name, order ID, status badge) but omit the entire action buttons row

## 3. Navigation

- [x] 3.1 Add "Envíos vendedor" link in desktop admin menu in `client/components/Navbar.js` — add after "Pedidos" link, pointing to `/admin/envios-seller`
- [x] 3.2 Add "Envíos vendedor" link in mobile admin menu in `client/components/Navbar.js` — add after "Pedidos" link in mobile menu section
