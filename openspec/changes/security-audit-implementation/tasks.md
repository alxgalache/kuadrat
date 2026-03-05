## 1. Database Schema & Configuration

- [x] 1.1 Add `reserved_at` column (DATETIME, nullable) to the `orders` table in `api/config/database.js` to track when inventory was reserved for TTL cleanup
- [x] 1.2 Add `ORDER_RESERVATION_TTL_MINUTES` to `api/config/env.js` with a default of 30, validated as a positive integer

## 2. Atomic Inventory Reservation in placeOrder

- [x] 2.1 Refactor the art item validation in `api/controllers/ordersController.js` `placeOrder`: replace the SELECT + `is_sold` check with an atomic `UPDATE art SET is_sold = 1 WHERE id = ? AND is_sold = 0` inside a Turso batch, and check `rowsAffected === 1` to confirm reservation ⚠️ HIGH-RISK: core purchase flow
- [x] 2.2 Refactor the others variant validation in `api/controllers/ordersController.js` `placeOrder`: replace the SELECT + stock check with an atomic `UPDATE others_variations SET stock = stock - 1 WHERE id = ? AND stock > 0` inside a Turso batch, and check `rowsAffected === 1` ⚠️ HIGH-RISK: core purchase flow
- [x] 2.3 Update `placeOrder` to set `reserved_at = datetime('now')` on the order record at creation time
- [x] 2.4 Update `placeOrder` error responses to return 409 Conflict (instead of 400) when an item is already sold or out of stock, with a clear Spanish-language error message
- [x] 2.5 Add structured Pino logging for all inventory reservation actions in `placeOrder` (`{ action: 'inventory_reserved', productId, orderId, type }`)

## 3. Reservation Rollback Logic

- [x] 3.1 Create a `releaseOrderInventory(orderId)` utility function in `api/controllers/ordersController.js` (or a new `api/services/inventoryService.js`) that atomically resets `is_sold = 0` for art items and increments `stock` for variant items associated with a given order, using a Turso batch transaction
- [x] 3.2 Call `releaseOrderInventory` in `processOrderConfirmation` (in `api/controllers/paymentsController.js` and `api/controllers/stripePaymentsController.js`) when payment fails or is explicitly cancelled
- [x] 3.3 Add structured Pino logging for all inventory release actions (`{ action: 'inventory_released', productId, orderId, reason }`)

## 4. Reservation TTL Cleanup Scheduler

- [x] 4.1 Create `api/scheduler/reservationScheduler.js` with a periodic job (configurable interval, default every 60 seconds) that queries for orders with `status = 'pending'` and `reserved_at` older than the configured TTL
- [x] 4.2 For each expired order, call `releaseOrderInventory(orderId)` and update the order status to `expired`
- [x] 4.3 Register the reservation scheduler in `api/server.js` alongside the existing auction scheduler
- [x] 4.4 Add structured Pino warn-level logging for expired reservation cleanup (`{ action: 'inventory_released', reason: 'reservation_expired' }`)

## 5. Server-Side Shipping Cost Verification

- [x] 5.1 In `api/controllers/stripePaymentsController.js` `createPaymentIntentEndpoint`, replace the use of `item.shipping.cost` from the client with a server-side lookup of shipping cost using the shipping method ID and delivery zone from the database
- [x] 5.2 In `api/controllers/paymentsController.js` (Revolut flow), apply the same server-side shipping cost re-computation if client-provided shipping costs are used
- [x] 5.3 Return a 400 error if a client sends an invalid or non-existent shipping method ID

## 6. Payment Amount Verification at Confirmation

- [x] 6.1 In `processOrderConfirmation` in `api/controllers/stripePaymentsController.js`, re-compute the expected order total from the database and compare against the Stripe payment amount, logging a security warning if the discrepancy exceeds ±1 cent
- [x] 6.2 In `processOrderConfirmation` in `api/controllers/paymentsController.js` (Revolut), apply the same amount verification logic
- [x] 6.3 Flag mismatched orders for manual review (e.g., add a `payment_mismatch` flag or note to the order record) without rejecting the payment

## 7. Zod Schema Hardening

- [x] 7.1 Audit and add `.strip()` (or equivalent unknown-key removal) to `api/validators/orderSchemas.js` on all mutation schemas (placeOrder, updateOrder)
- [x] 7.2 Audit and add `.strip()` to `api/validators/productSchemas.js` to prevent `is_sold`, `stock`, `seller_id` injection on seller endpoints
- [x] 7.3 Audit and add `.strip()` to `api/validators/authSchemas.js` to prevent `role` injection on register/login
- [x] 7.4 Audit and add `.strip()` to `api/validators/shippingSchemas.js`, `api/validators/auctionSchemas.js`, and `api/validators/eventSchemas.js` for all mutation schemas
- [x] 7.5 Verify that no controller uses `req.body` spread (`...req.body`) directly into SQL — all must use explicitly named fields from validated schemas

## 8. Seller Ownership Verification Audit

- [x] 8.1 Audit all seller endpoints in `api/routes/sellerRoutes.js` and their controllers to confirm every UPDATE/DELETE query includes `WHERE seller_id = req.user.id` (not from `req.body`)
- [x] 8.2 Document audit results; fix any endpoints that don't enforce ownership via `req.user.id`

## 9. Rate Limiting Verification

- [x] 9.1 Verify that `sensitiveLimiter` is applied to all payment-related routes in `api/routes/` (createPaymentIntent, createRevolutOrder, placeOrder)
- [x] 9.2 Document any missing rate limiter applications and add them if absent
