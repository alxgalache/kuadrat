## Context

The Sendcloud integration (from the `add-sendcloud` change) currently creates shipments synchronously via `POST /v3/shipments/announce`. This endpoint blocks until the carrier is notified and the label is generated, adding latency to the payment confirmation flow.

A critical bug was discovered during exploration: the Sendcloud V3 API wraps responses in a `{ data: { ... } }` envelope, but `sendcloudProvider.createShipments()` accesses `data.id` directly on the envelope object instead of `data.data.id`. This means `sendcloud_shipment_id`, tracking numbers, and label URLs are **never stored** — for any order item, in any table.

The webhook controller (`sendcloudWebhookController.js`) exists but has its own issues: it verifies the HMAC signature against re-serialized JSON (`JSON.stringify(req.body)`) instead of the raw request body, and it searches for order items using the shipment ID while the webhook payload sends the parcel ID.

The existing scheduler infrastructure (`confirmationScheduler.js`, `auctionScheduler.js`) provides a proven pattern for the new retry scheduler.

## Goals / Non-Goals

**Goals:**
- Fix the response envelope bug so shipment data is correctly stored
- Migrate from synchronous to asynchronous shipment creation endpoint
- Fix webhook signature verification to use raw body
- Store and look up order items by Sendcloud parcel ID (the webhook's primary identifier)
- Notify sellers by email with the label PDF attached when the label becomes available
- Automatically retry failed shipment announcements with admin notification after max retries
- Provide SQL migration statements for the new `sendcloud_parcel_id` column on existing databases

**Non-Goals:**
- Implementing `delivery_dates` (`handover_at`, `deliver_at`) — deferred for future per-seller logic
- Frontend changes — this is a backend-only change
- Changing the parcel grouping logic or checkout flow
- Supporting multiple webhook event types beyond `ParcelStatusChanged`
- Implementing a full dead-letter queue or external retry service

## Decisions

### Decision 1: Unwrap response envelope in `sendcloudProvider.createShipments()` only

**Choice:** Add `const shipment = response.data || response` in `createShipments()` rather than unwrapping globally in `sendcloudApiClient.js`.

**Why:** `getDeliveryOptions()` already handles the envelope correctly with `response.data || response || []` at line 148. Unwrapping globally in the API client would be a larger change that could break other callers. The fix is localized and safe.

**Alternative considered:** Unwrap in `sendcloudApiClient.js` (`return data.data || data`). Rejected because it changes the contract for all callers and `getDeliveryOptions` already compensates.

### Decision 2: Change endpoint URL from `shipments/announce` to `shipments`

**Choice:** Change the single string `'shipments/announce'` to `'shipments'` in `sendcloudProvider.createShipments()`.

**Why:** The request body schema is identical between both endpoints. The only behavioral difference is that the async endpoint returns immediately with status `ANNOUNCING` and empty tracking/label fields, while allowing up to 50 parcels per request (vs 15 for sync). The webhook infrastructure handles the eventual delivery of tracking data and label URLs.

**Alternative considered:** Supporting both endpoints via a configuration flag. Rejected — the sync endpoint offers no advantage once webhooks are working, and dual-path code adds complexity.

### Decision 3: Store both shipment ID and parcel ID

**Choice:** Add `sendcloud_parcel_id TEXT` column to `art_order_items` and `other_order_items`. Store `shipment.id` in `sendcloud_shipment_id` and `shipment.parcels[0].id` in `sendcloud_parcel_id`.

**Why:** The Sendcloud V3 API has two levels of identity — shipments (UUID string) and parcels (integer). The webhook's `ParcelStatusChanged` event sends `parcel.id` (integer) as its primary identifier and `parcel.shipment_uuid` as secondary. By storing both, the webhook controller can do an efficient direct lookup by parcel ID and fall back to shipment UUID if needed.

**Schema change in `database.js`:** Add `sendcloud_parcel_id TEXT` to both CREATE TABLE statements + new indexes. For existing databases, provide manual ALTER TABLE SQL.

### Decision 4: Raw body capture for webhook signature verification

**Choice:** Use `express.json({ verify: (req, res, buf) => { req.rawBody = buf } })` on the webhook route to capture the raw request body before parsing, then verify the HMAC signature against `req.rawBody`.

**Why:** Sendcloud signs the raw HTTP body. Re-serializing the parsed JSON with `JSON.stringify()` can produce different byte sequences (key ordering, whitespace, Unicode escaping), causing valid webhooks to be rejected. This is a well-known pattern for webhook signature verification in Express.

**Alternative considered:** Using a separate raw body parser middleware. Rejected — the `verify` callback in `express.json()` is the standard Express approach and avoids additional dependencies.

### Decision 5: Webhook lookup by parcel ID first, then shipment ID

**Choice:** Modify the webhook controller to query `WHERE sendcloud_parcel_id = ?` first. If no match, fall back to `WHERE sendcloud_shipment_id = ?` using `parcel.shipment_uuid` from the payload.

**Why:** The parcel ID is the primary identifier in the webhook payload and a direct match is more reliable. The fallback handles edge cases where the parcel ID wasn't stored (e.g., during migration from old data).

### Decision 6: Seller label email with PDF attachment downloaded from Sendcloud API

**Choice:** When the webhook reports status 1000 (Ready to send), fetch the label PDF from `GET /v3/parcels/{parcel_id}/documents/label` (Accept: application/pdf) and attach it to the seller notification email via Nodemailer.

**Why:** Attaching the PDF directly is more reliable than including a URL that could expire. The seller receives the label immediately in their inbox. The Sendcloud V3 document endpoint returns raw binary PDF.

**Alternative considered:** Including a label download URL in the email body. Rejected — Sendcloud label URLs can expire, and the seller experience is better with a direct attachment.

### Decision 7: Separate retry scheduler (not inline in webhook handler)

**Choice:** Create `api/scheduler/shipmentRetryScheduler.js` following the same pattern as `confirmationScheduler.js`. It runs periodically (every 15 minutes), finds order items with failed announcements, retries `POST /v3/shipments`, and sends an admin email after 3 failed attempts.

**Why:** Retry logic in the webhook handler would block the 200 response to Sendcloud and risk timeouts. A scheduler survives server restarts (it re-scans on each run), provides clear logging, and follows the existing scheduler pattern.

**Tracking retry state:** Add `sendcloud_announcement_retries INTEGER DEFAULT 0` and `sendcloud_announcement_failed_at DATETIME` columns to both order item tables. The scheduler queries items where `sendcloud_shipment_id IS NOT NULL AND sendcloud_parcel_id IS NULL AND sendcloud_announcement_retries < 3` (shipment created but parcel not yet confirmed by webhook). On failure, increment retry count and update failed_at. After 3 retries, send admin email.

**Alternative considered:** Fire-and-forget retry from webhook handler. Rejected — doesn't survive server restarts, and mixing retry logic with webhook handling adds complexity.

### Decision 8: Handle ANNOUNCEMENT_FAILED status in webhook

**Choice:** Add a handler in the webhook controller for announcement failure statuses. When detected, mark the item for retry by resetting `sendcloud_parcel_id` to null (so the scheduler picks it up) and log a warning.

**Why:** With async shipments, the announcement can fail after the initial 201 response. The webhook is the only way to learn about this. The retry scheduler then handles the actual retry.

### Decision 9: Adapt `sellerOrdersController.js` label download to use parcel ID

**Choice:** Modify `downloadOrderLabel()` to use `sendcloud_parcel_id` with the V3 document endpoint `GET /v3/parcels/{parcel_id}/documents/label` instead of the current `getLabelUrl()` approach. Return a clear message when the label is not yet available (status ANNOUNCING).

**Why:** The V3 parcel documents endpoint uses the parcel ID (integer), which is what we now store. The current `getLabelUrl()` fetches the shipment and extracts label URLs — using the parcel ID is more direct.

## Risks / Trade-offs

**[Risk] Webhook delivery delay** → Sendcloud may take seconds to minutes to send the first webhook after async shipment creation. Sellers won't see the label until the webhook arrives. → **Mitigation:** The seller email with attached label provides a push notification. The seller dashboard `downloadOrderLabel` shows a "label is being prepared" message when the parcel ID exists but no label is available yet.

**[Risk] Failed webhook delivery** → If Sendcloud can't reach our webhook endpoint, updates are lost temporarily. → **Mitigation:** Sendcloud retries 10 times with exponential backoff (5 min to 1 hour max). The retry scheduler also catches items stuck in "announcing" state. For local testing, use ngrok to expose the API.

**[Risk] Signature verification change breaks existing webhooks** → Switching from `JSON.stringify(req.body)` to raw body verification changes the hash computation. → **Mitigation:** The current implementation is broken (re-serialization doesn't match original payload), so no working webhooks exist to break. This is a fix, not a regression.

**[Risk] Retry scheduler creates duplicate shipments** → If a webhook arrives between retry attempts, we could end up with multiple shipments. → **Mitigation:** The scheduler checks `sendcloud_parcel_id IS NULL` — once a successful webhook stores the parcel ID, the scheduler stops retrying. Additionally, use `external_reference_id` in the shipment request to enable idempotency on Sendcloud's side.

**[Risk] Label PDF download fails in email flow** → The Sendcloud API call to download the label PDF could fail (timeout, auth error). → **Mitigation:** Wrap the PDF download + email in a try/catch. If it fails, log the error and send the email without attachment but with a link to download from the seller dashboard. The label remains available via the seller dashboard.

## Migration Plan

1. **Database migration (manual SQL):**
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
2. **Configure webhook in Sendcloud panel:** Set webhook URL to `https://<domain>/api/shipping/webhook` on the integration settings. Enable "Webhook feedback" checkbox.
3. **Deploy backend code:** All changes are backward-compatible. The async endpoint accepts the same request body. Existing order items without `sendcloud_parcel_id` will use the fallback lookup.
4. **Rollback strategy:** Revert the endpoint URL from `'shipments'` back to `'shipments/announce'` in `sendcloudProvider.js`. All other changes (envelope fix, webhook fixes, new columns) are improvements that should remain regardless.

## Open Questions

None — all key decisions were resolved during the exploration phase with the user.
