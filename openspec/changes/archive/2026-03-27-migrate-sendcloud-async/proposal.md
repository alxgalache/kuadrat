## Why

The current Sendcloud integration creates shipments synchronously via `POST /v3/shipments/announce`, which blocks the payment confirmation flow until the label is generated and the carrier is notified. This adds latency to the checkout process. Additionally, during exploration a critical bug was discovered: the Sendcloud V3 API response envelope (`{ data: { ... } }`) is not being unwrapped, so `sendcloud_shipment_id`, tracking numbers, and label URLs are **never stored** in the database for any order items. This change migrates to the asynchronous endpoint (`POST /v3/shipments`), fixes the response parsing bug, and completes the webhook infrastructure to handle the full shipment lifecycle — including label-ready notifications to sellers, retry logic for failed announcements, and proper webhook signature verification.

## What Changes

- **Fix response envelope bug**: Unwrap the `{ data: { ... } }` envelope from Sendcloud V3 API responses in `sendcloudProvider.createShipments()` so that shipment IDs, tracking data, and label URLs are correctly extracted and stored.
- **Migrate to async shipment creation**: Switch from `POST /v3/shipments/announce` (synchronous) to `POST /v3/shipments` (asynchronous). The request body is identical; the response returns immediately with status `ANNOUNCING` and empty tracking/label fields.
- **Add `sendcloud_parcel_id` column**: Store the Sendcloud parcel-level ID (integer) alongside the existing shipment ID (UUID). The webhook payload uses `parcel.id` as its primary identifier.
- **Fix webhook signature verification**: Capture the raw request body before JSON parsing and verify the HMAC-SHA256 signature against the raw bytes instead of re-serialized JSON.
- **Enhance webhook controller**: Search order items by `sendcloud_parcel_id` (primary) with fallback to `sendcloud_shipment_id`. Handle `ANNOUNCEMENT_FAILED` status. Extract label URLs from the webhook payload when status is `READY_TO_SEND` (1000).
- **Seller label-ready email with PDF attachment**: When the webhook reports status 1000 (Ready to send), download the label PDF from `GET /v3/parcels/{id}/documents/label` and send it as an email attachment to the seller.
- **Shipment retry scheduler**: A new scheduled job that periodically retries failed shipment announcements (up to 3 attempts) and sends an admin notification email when all retries are exhausted.
- **Admin failure notification email**: New email function to alert the admin when a shipment announcement fails after maximum retries.

## Capabilities

### New Capabilities
- `async-shipment-creation`: Migration from synchronous to asynchronous Sendcloud shipment creation endpoint, including response parsing fix, parcel ID storage, and adapted payment controller flow.
- `webhook-enhancements`: Enhanced webhook controller with raw body signature verification, parcel ID lookup, announcement failure handling, and label URL extraction from webhook payloads.
- `seller-label-notification`: Email notification to sellers when their shipping label is ready, with the label PDF downloaded from Sendcloud API and attached to the email.
- `shipment-retry-scheduler`: Scheduled job that retries failed Sendcloud shipment announcements and notifies the admin after max retries are exhausted.

### Modified Capabilities
- `sendcloud-shipment-lifecycle`: Requirements change for shipment creation (async instead of sync), new `sendcloud_parcel_id` column, webhook lookup by parcel ID, and new status handling for announcement failures.
- `sendcloud-provider`: Requirements change for the `createShipments()` method — different endpoint, response envelope unwrapping, parcel ID extraction, and adapted return values for async response (empty tracking/label initially).

## Impact

- **Backend files modified**: `sendcloudProvider.js`, `sendcloudWebhookController.js`, `paymentsController.js`, `sellerOrdersController.js`, `shippingRoutes.js`, `database.js`, `emailService.js`, `env.js`
- **New backend file**: `api/scheduler/shipmentRetryScheduler.js`
- **Database**: New `sendcloud_parcel_id TEXT` column + index on `art_order_items` and `other_order_items`. Manual `ALTER TABLE` SQL required for existing databases.
- **External dependencies**: No new npm packages. Uses existing Nodemailer for email with PDF attachment, existing Sendcloud API client.
- **Sendcloud configuration**: Webhook URL must be configured in the Sendcloud integration settings (panel) pointing to `POST /api/shipping/webhook`. For local testing, use ngrok to expose the API.
- **No frontend changes**: This is a backend-only change. The checkout flow, cart, and seller pages are unaffected.
