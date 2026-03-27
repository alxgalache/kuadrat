## 1. Database Schema & Configuration

- [x] 1.1 Add `user_sendcloud_configuration` table to `api/config/database.js` with all columns (sender address, shipping preferences, carrier preferences, customs defaults, self_packs). **[HIGH-RISK: shared schema]**
- [x] 1.2 Add `can_copack INTEGER NOT NULL DEFAULT 1` column to `others` table in `api/config/database.js`. **[HIGH-RISK: shared schema]**
- [x] 1.3 Add `sendcloud_shipment_id TEXT` and `sendcloud_tracking_url TEXT` columns to `art_order_items` table in `api/config/database.js`. **[HIGH-RISK: shared schema]**
- [x] 1.4 Add `sendcloud_shipment_id TEXT` and `sendcloud_tracking_url TEXT` columns to `other_order_items` table in `api/config/database.js`. **[HIGH-RISK: shared schema]**
- [x] 1.5 Add Sendcloud env vars to `api/config/env.js`: `sendcloud.apiKey`, `sendcloud.apiSecret`, `sendcloud.webhookSecret`, `sendcloud.enabledArt`, `sendcloud.enabledOthers`, `sendcloud.autoConfirmDays`
- [x] 1.6 Add Sendcloud env vars to `api/.env.example` with documentation

## 2. Sendcloud API Client & Provider Abstraction

- [x] 2.1 Create `api/services/shipping/sendcloudApiClient.js` — low-level HTTP client with Basic Auth, timeout (10s), error handling, Pino logging
- [x] 2.2 Create `api/services/shipping/sendcloudProvider.js` — implements `getDeliveryOptions()`, `getServicePoints()`, `createShipments()`, `getShipmentStatus()`, `cancelShipment()` using the API client
- [x] 2.3 Create `api/services/shipping/legacyProvider.js` — wraps existing DB-based shipping logic into the same interface (`getDeliveryOptions()` from current shippingController queries, `createShipments()` as no-op)
- [x] 2.4 Create `api/services/shipping/shippingProviderFactory.js` — `getProvider(productType)` returns LegacyProvider or SendcloudProvider based on `config.sendcloud.enabledArt`/`enabledOthers`
- [x] 2.5 Create `api/services/shipping/parcelGrouper.js` — groups cart items into parcels per seller: art=separate, others=copack aggregation (summed weight) vs individual

## 3. Validators

- [x] 3.1 Create `api/validators/sendcloudConfigSchemas.js` — Zod schemas for create/update seller Sendcloud configuration (sender address fields, shipping preferences, carrier arrays, customs)
- [x] 3.2 Create `api/validators/shippingOptionsSchemas.js` — Zod schema for `POST /api/shipping/options` request (items array with productId, productType, quantity, sellerId, weight, dimensions, canCopack; deliveryAddress with country, postalCode, city, address)
- [x] 3.3 Update product validation in `api/validators/productSchemas.js` (or relevant file) to make weight mandatory when Sendcloud is enabled for that product type

## 4. Admin API — Seller Sendcloud Configuration

- [x] 4.1 Create `api/controllers/sendcloudConfigController.js` — CRUD handlers for seller Sendcloud config (getSendcloudConfig, createSendcloudConfig, updateSendcloudConfig)
- [x] 4.2 Add routes to `api/routes/admin/authorRoutes.js`: `GET /api/admin/authors/:id/sendcloud-config`, `POST /api/admin/authors/:id/sendcloud-config`, `PUT /api/admin/authors/:id/sendcloud-config` with validation middleware

## 5. Shipping Options API

- [x] 5.1 Create `api/controllers/shippingOptionsController.js` — handler for `POST /api/shipping/options`: groups items by seller, builds parcels via parcelGrouper, calls provider.getDeliveryOptions() per seller, appends seller pickup option, returns normalized response
- [x] 5.2 Create `api/controllers/servicePointsController.js` — handler for `GET /api/shipping/service-points`: proxies to SendcloudProvider.getServicePoints()
- [x] 5.3 Add routes to `api/routes/shippingRoutes.js`: `POST /api/shipping/options` (authenticated), `GET /api/shipping/service-points` (authenticated)

## 6. Webhook & Shipment Lifecycle

- [x] 6.1 Create `api/controllers/sendcloudWebhookController.js` — handler for `POST /api/shipping/webhook`: validates signature, looks up order item by sendcloud_shipment_id, maps Sendcloud status to internal status, updates DB, triggers buyer email notifications
- [x] 6.2 Add webhook route to `api/routes/shippingRoutes.js`: `POST /api/shipping/webhook` (no auth, uses webhook secret validation)
- [x] 6.3 Modify `processOrderConfirmation()` in `api/controllers/paymentsController.js` to call `SendcloudProvider.createShipments()` after marking order as paid, store shipment IDs/tracking on order items. **[HIGH-RISK: payment flow]**
- [x] 6.4 Add email templates to `api/services/emailService.js`: "Tu pedido ha sido enviado" (with tracking info) and "Tu pedido ha sido entregado"
- [x] 6.5 Add seller notification email template to `api/services/emailService.js`: "Nuevo pedido recibido" with order details and label download link

## 7. Auto-Confirm Scheduler

- [x] 7.1 Create `api/scheduler/confirmationScheduler.js` — hourly cron job that finds Sendcloud-managed order items with status `arrived` older than `config.sendcloud.autoConfirmDays`, updates to `confirmed`, increments seller `available_withdrawal`
- [x] 7.2 Initialize the confirmation scheduler in `api/server.js` alongside the auction scheduler

## 8. Seller Orders API

- [x] 8.1 Create `api/controllers/sellerOrdersController.js` — handlers for `GET /api/seller/orders` (list with pagination and status filter) and `GET /api/seller/orders/:itemType/:itemId/label` (label download proxy to Sendcloud)
- [x] 8.2 Add seller order routes to `api/routes/sellerRoutes.js` with `authenticate` middleware
- [x] 8.3 Add seller orders API functions to `client/lib/api.js`: `getSellerOrders()`, `downloadOrderLabel()`

## 9. Frontend — CartContext Changes

- [x] 9.1 Add `shippingSelections` state to `client/contexts/CartContext.js` — keyed by sellerId, stores `{ optionId, type, carrier, cost, shippingOptionCode, servicePointId }`. Add `setSendcloudShipping()`, `clearShippingSelections()`, update `getTotalPrice()` to include Sendcloud selections. **[HIGH-RISK: shared context]**
- [x] 9.2 Add Sendcloud feature flags to frontend — expose `SENDCLOUD_ENABLED_ART` and `SENDCLOUD_ENABLED_OTHERS` via Next.js env vars (NEXT_PUBLIC_*)
- [x] 9.3 Add shipping options API functions to `client/lib/api.js`: `getShippingOptions(items, deliveryAddress)`, `getServicePoints(carrier, country, postalCode)`

## 10. Frontend — Checkout Shipping Step

- [x] 10.1 Update `client/components/ShoppingCartDrawer.js` — add Step 3 (Shipping Selection) between Address and Payment. Update step constants, step navigation, step rendering logic. **[HIGH-RISK: core checkout flow]**
- [x] 10.2 Create `client/components/shipping/ShippingStep.js` — main Step 3 component: fetches shipping options on mount, displays per-seller groups with loading states, manages selections
- [x] 10.3 Create `client/components/shipping/SellerShippingGroup.js` — displays one seller's shipping options (delivery options list, pickup option, service point option)
- [x] 10.4 Create `client/components/shipping/ServicePointSelector.js` — fetches and displays service points when a service-point delivery option is selected
- [x] 10.5 Update Step 1 validation in `ShoppingCartDrawer.js` — skip shipping requirement for Sendcloud-managed products (they select in Step 3). Keep `ShippingSelectionModal` for legacy products only.
- [x] 10.6 Implement address change detection — when buyer modifies delivery address in Step 2 and returns to Step 3, clear `shippingSelections` and re-fetch options

## 11. Frontend — Seller Publish Form Changes

- [x] 11.1 Update `client/app/seller/publish/page.js` — make weight mandatory when Sendcloud is enabled for the product type (conditional validation message)
- [x] 11.2 Add `can_copack` checkbox to the seller publish form for `others` products: "Este producto puede empaquetarse junto con otros productos del mismo pedido" (checked by default)

## 12. Frontend — Admin Author Edit Page

- [x] 12.1 Add "Configuración de envío Sendcloud" section to `client/app/admin/authors/[id]/edit/page.js` — form fields for sender address, shipping preferences (signature, fragile, insurance, first mile), carrier preferences, customs defaults, self_packs. Only visible when Sendcloud is enabled.
- [x] 12.2 Add Sendcloud config API functions to `client/lib/api.js`: `getSendcloudConfig(id)`, `createSendcloudConfig(id, data)`, `updateSendcloudConfig(id, data)`

## 13. Frontend — Seller Orders Page

- [x] 13.1 Create `client/app/seller/pedidos/page.js` — seller orders page with status filter tabs, order item cards showing product info, tracking info, label download button, and auto-confirm countdown
- [x] 13.2 Add seller orders link to seller navigation/dashboard

## 14. Frontend — Admin Shipping Pages Visibility

- [x] 14.1 Update admin navigation and `/admin/envios/` pages to show/hide based on Sendcloud enabled flags. Display a notice when Sendcloud is active for a product type.
