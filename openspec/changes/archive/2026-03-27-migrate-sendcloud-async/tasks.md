## 1. Database Schema & Configuration

- [x] 1.1 Add `sendcloud_parcel_id TEXT` column to `art_order_items` CREATE TABLE in `api/config/database.js`
- [x] 1.2 Add `sendcloud_parcel_id TEXT` column to `other_order_items` CREATE TABLE in `api/config/database.js`
- [x] 1.3 Add `sendcloud_announcement_retries INTEGER DEFAULT 0` column to both order item tables in `api/config/database.js`
- [x] 1.4 Add `sendcloud_announcement_failed_at DATETIME` column to both order item tables in `api/config/database.js`
- [x] 1.5 Add `CREATE INDEX IF NOT EXISTS idx_art_oi_sendcloud_parcel ON art_order_items(sendcloud_parcel_id)` and equivalent for `other_order_items` in `api/config/database.js`
- [x] 1.6 Add `safeAlter` migration fallbacks for `sendcloud_parcel_id`, `sendcloud_announcement_retries`, and `sendcloud_announcement_failed_at` on both tables in `api/config/database.js`
- [x] 1.7 Add `maxAnnouncementRetries: optionalInt('SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES', 3)` to `config.sendcloud` in `api/config/env.js`

## 2. Fix Response Envelope Bug & Migrate to Async Endpoint

- [x] 2.1 In `sendcloudProvider.createShipments()` (`api/services/shipping/sendcloudProvider.js` line 323): unwrap API response with `const shipment = response.data || response` before extracting fields
- [x] 2.2 Change endpoint from `sendcloud.post('shipments/announce', ...)` to `sendcloud.post('shipments', ...)` in `api/services/shipping/sendcloudProvider.js`
- [x] 2.3 Update result extraction to use unwrapped `shipment` object: `sendcloudShipmentId: shipment.id`, `sendcloudParcelId: shipment.parcels?.[0]?.id`, `trackingNumber: shipment.parcels?.[0]?.tracking_number || null`, `trackingUrl: shipment.parcels?.[0]?.tracking_url || null`
- [x] 2.4 Add `external_reference_id` to shipment body: `external_reference_id: \`order-${order.id}-seller-${group.sellerId}-parcel-${i}\``
- [x] 2.5 Add `sendcloudParcelId` to the result object returned by `createShipments()`

## 3. Add Label PDF Download Method

- [x] 3.1 Add `getLabelPdf(parcelId)` function in `api/services/shipping/sendcloudProvider.js` that calls `GET /v3/parcels/{parcelId}/documents/label` with `Accept: application/pdf` and returns the raw buffer (or null on error)
- [x] 3.2 Add a `getBinary(path, options)` method in `api/services/shipping/sendcloudApiClient.js` for fetching raw binary responses (Accept: application/pdf, return buffer instead of JSON)

## 4. Update Payment Controller — Store Parcel ID

- [x] 4.1 In `createSendcloudShipmentsForOrder()` (`api/controllers/paymentsController.js` line ~435): update the UPDATE SQL to also set `sendcloud_parcel_id = ?` alongside `sendcloud_shipment_id`
- [x] 4.2 Add `result.sendcloudParcelId` to the args array in the UPDATE statement
- [x] 4.3 Verify the flow handles null tracking/URL gracefully (async response returns empty values)

## 5. Fix Webhook Signature Verification

- [x] 5.1 In `api/routes/shippingRoutes.js`: change `express.json()` to `express.json({ verify: (req, res, buf) => { req.rawBody = buf } })` on the webhook route
- [x] 5.2 In `sendcloudWebhookController.js` (lines 55-59): replace `JSON.stringify(req.body)` with `req.rawBody` for the HMAC signature computation

## 6. Enhance Webhook Controller — Parcel ID Lookup & New Status Handling

- [x] 6.1 Modify webhook controller queries (`api/controllers/sendcloudWebhookController.js` lines 95-124) to search by `sendcloud_parcel_id = ?` first, then fallback to `sendcloud_shipment_id = ?` using `parcel.shipment_uuid`
- [x] 6.2 When a webhook arrives with status 1000 (Ready to send) and the order item's `sendcloud_parcel_id` is null, store `parcel.id` as `sendcloud_parcel_id` on the order item
- [x] 6.3 Add announcement failure handling: when the webhook status indicates failure and the item has `sendcloud_parcel_id IS NULL`, increment `sendcloud_announcement_retries` and set `sendcloud_announcement_failed_at`
- [x] 6.4 On status 1000 (Ready to send): trigger `sendLabelReadyEmail()` — look up seller email, download label PDF via `sendcloudProvider.getLabelPdf(parcelId)`, and send email with attachment
- [x] 6.5 Update tracking info (tracking number + URL) from webhook payload when available (keep existing logic but ensure it uses the correct field paths)

## 7. New Email Functions

- [x] 7.1 Add `sendLabelReadyEmail({ sellerEmail, sellerName, orderId, orderItemId, trackingNumber, parcelId })` in `api/services/emailService.js` — downloads label PDF and attaches it via Nodemailer; falls back to email without attachment if download fails
- [x] 7.2 Add `sendShipmentFailedAdminEmail({ orderId, orderItemId, productName, sellerName, buyerEmail, retryCount, lastError })` in `api/services/emailService.js` — sends failure alert to admin email address

## 8. Shipment Retry Scheduler

- [x] 8.1 Create `api/scheduler/shipmentRetryScheduler.js` following the pattern of `confirmationScheduler.js` — runs every 15 minutes via `node-cron`
- [x] 8.2 Implement query to find retry-eligible items: `WHERE sendcloud_shipment_id IS NOT NULL AND sendcloud_parcel_id IS NULL AND sendcloud_announcement_retries < config.sendcloud.maxAnnouncementRetries`
- [x] 8.3 For each eligible item: rebuild shipment request body from order + seller config, call `sendcloudProvider.createShipments()`, update order item with new IDs on success or increment retry count on failure
- [x] 8.4 After max retries reached: call `sendShipmentFailedAdminEmail()` with order and item details
- [x] 8.5 Register the scheduler in `api/server.js` alongside the existing `confirmationScheduler`

## 9. Adapt Seller Label Download

- [x] 9.1 In `sellerOrdersController.js` `downloadOrderLabel()`: change to use `sendcloud_parcel_id` and call `sendcloudProvider.getLabelPdf(parcelId)` instead of `getLabelUrl(shipmentId)`
- [x] 9.2 Return the PDF binary with `Content-Type: application/pdf` and `Content-Disposition: attachment` headers, or return the label URL if binary download fails
- [x] 9.3 Handle label not yet available: when `sendcloud_parcel_id` is null or label download returns null, return 404 with message "La etiqueta se está generando. Por favor, inténtalo de nuevo en unos minutos."

## 10. Manual Migration SQL (Document for Deployment)

- [x] 10.1 Document the following ALTER TABLE statements in the change's design.md Migration Plan (already done) and verify they are correct:
  ```sql
  ALTER TABLE art_order_items ADD COLUMN sendcloud_parcel_id TEXT;
  ALTER TABLE other_order_items ADD COLUMN sendcloud_parcel_id TEXT;
  ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0;
  ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0;
  ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME;
  ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME;
  CREATE INDEX IF NOT EXISTS idx_art_oi_sendcloud_parcel ON art_order_items(sendcloud_parcel_id);
  CREATE INDEX IF NOT EXISTS idx_other_oi_sendcloud_parcel ON other_order_items(sendcloud_parcel_id);
  ```
