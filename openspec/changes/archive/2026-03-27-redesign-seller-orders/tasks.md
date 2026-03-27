## 1. Database Schema Changes

- [x] 1.1 Add `sendcloud_carrier_code TEXT` column to `art_order_items` CREATE TABLE in `api/config/database.js`
- [x] 1.2 Add `sendcloud_carrier_code TEXT` column to `other_order_items` CREATE TABLE in `api/config/database.js`
- [x] 1.3 Add `sendcloud_pickups` CREATE TABLE in `api/config/database.js` with columns: id, order_id, seller_id, sendcloud_pickup_id, carrier_code, status, pickup_address, time_slot_start, time_slot_end, special_instructions, total_weight_kg, created_at
- [x] 1.4 Add index `idx_sendcloud_pickups_order_seller` on `sendcloud_pickups(order_id, seller_id)` in `api/config/database.js`

## 2. Sendcloud Provider — Carrier Code & Pickup

- [x] 2.1 Modify `createShipments` in `api/services/shipping/sendcloudProvider.js` to extract `carrier_code` from the Sendcloud shipment response and include it in the returned results array (alongside `sendcloudShipmentId`, `trackingNumber`, etc.)
- [x] 2.2 Add `createPickup({ carrierCode, address, timeSlots, items, specialInstructions })` function in `api/services/shipping/sendcloudProvider.js` that calls `sendcloud.post('pickups', { body })` and returns the response data
- [x] 2.3 Export `createPickup` from `api/services/shipping/sendcloudProvider.js` module.exports

## 3. Payments Controller — Store Carrier Code

- [x] 3.1 Modify `createSendcloudShipmentsForOrder` in `api/controllers/paymentsController.js` to store `sendcloud_carrier_code` when updating order items (in the UPDATE statement at lines ~441-455, add `sendcloud_carrier_code = ?`)

## 4. Validators — Pickup Schema

- [x] 4.1 Create Zod schema `pickupSchema` in `api/validators/pickupSchemas.js` validating: address (name, countryCode, city, addressLine1, postalCode, email, phoneNumber required; companyName, addressLine2, houseNumber optional), timeSlotStart (ISO datetime), timeSlotEnd (ISO datetime), specialInstructions (optional string). Add refinements: start < end, interval <= 48h.

## 5. Backend — Restructure Seller Orders Endpoint

- [x] 5.1 Modify `getSellerOrders` in `api/controllers/sellerOrdersController.js`: add `o.created_at` to both SQL queries, add JOIN with `other_vars` (for variantName) in the others query, add `sendcloud_carrier_code` to SELECT
- [x] 5.2 Modify `getSellerOrders`: after combining art + others results, group items by `order_id` into order objects. Within each order, aggregate items by `(product_type, product_id, variant_id)` counting quantities. Sort orders by `created_at` DESC.
- [x] 5.3 Modify `getSellerOrders`: paginate over grouped orders (not individual items). Calculate `pagination.total` as count of distinct orders.
- [x] 5.4 Modify `getSellerOrders`: query `user_sendcloud_configuration` for the authenticated seller and include `sellerConfig` (firstMile + defaultAddress) in the response
- [x] 5.5 Modify `getSellerOrders`: LEFT JOIN with `sendcloud_pickups` to include pickup status for each order (or query separately after grouping)

## 6. Backend — Pickup Endpoint

- [x] 6.1 Add `schedulePickup` function in `api/controllers/sellerOrdersController.js`: validate seller owns items in order, verify items are status 'paid', verify no existing pickup, get carrier_code from items, calculate total weight from product tables, call `sendcloudProvider.createPickup`, insert into `sendcloud_pickups`, update items to status='sent'
- [x] 6.2 Add route `POST /orders/:orderId/pickup` in `api/routes/sellerRoutes.js` with `validate(pickupSchema)` middleware

## 7. Backend — Email Warning

- [x] 7.1 Modify `sendSellerNewOrderEmail` in `api/services/emailService.js`: add a warning-styled paragraph with text "Recuerda que si eliges programar una recogida, debes hacerlo en los detalles del envio dentro de la seccion «Mis envios» en un plazo maximo de 7 dias." Styled with light amber/yellow background and left border, placed after the main CTA button and before the footer.

## 8. Frontend — API Client Updates

- [x] 8.1 Update `sellerAPI.getOrders` return type handling in `client/lib/api.js` if needed (response now returns `orders` array instead of `items`)
- [x] 8.2 Add `sellerAPI.schedulePickup(orderId, data)` method in `client/lib/api.js` that POSTs to `/seller/orders/${orderId}/pickup`

## 9. Frontend — Pickup Modal Component

- [x] 9.1 Create `client/components/seller/PickupModal.js` with: modal overlay, address form fields (name, companyName, addressLine1, addressLine2, houseNumber, city, postalCode, countryCode, phone, email), checkbox "Rellenar con la direccion por defecto" that fills from sellerConfig.defaultAddress, datetime inputs for timeSlotStart/timeSlotEnd, textarea for specialInstructions, submit button "Programar recogida"
- [x] 9.2 Add client-side validation in PickupModal: required fields, start < end, interval <= 48h
- [x] 9.3 Add submit handler in PickupModal: call sellerAPI.schedulePickup, on success close modal + show notification + trigger orders refresh, on error display error message in modal

## 10. Frontend — Seller Orders Page Redesign

- [x] 10.1 Change container from `max-w-4xl px-4 py-8` to `max-w-7xl px-4 py-16 sm:px-6 lg:px-8` in `client/app/seller/pedidos/page.js`
- [x] 10.2 Update data handling in `client/app/seller/pedidos/page.js` to consume new response structure (`res.orders` instead of `res.items`, handle `sellerConfig`)
- [x] 10.3 Redesign order card component: horizontal scrollable row of product images with quantity badge (circle top-left) and variant name (below image or translucent overlay at bottom)
- [x] 10.4 Add order info section below images: formatted creation date in Spanish + delivery address
- [x] 10.5 Add horizontal action buttons row: "Descargar etiqueta" (if sendcloud_shipment_id), "Ver seguimiento" (if sendcloud_tracking_url), "Programar recogida" (conditional on firstMile + status + no existing pickup). All buttons with uniform styling.
- [x] 10.6 Add single status badge per order card using status of first item
- [x] 10.7 Integrate PickupModal: open on "Programar recogida" click, pass sellerConfig.defaultAddress and orderId
- [x] 10.8 Update label download handler to work with the new grouped order structure (need to determine which item's shipment to download)
