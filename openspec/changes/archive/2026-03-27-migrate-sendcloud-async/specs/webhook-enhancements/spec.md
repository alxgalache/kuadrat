## ADDED Requirements

### Requirement: Raw body webhook signature verification

The webhook endpoint SHALL verify the Sendcloud HMAC-SHA256 signature against the raw HTTP request body, not against re-serialized JSON.

#### Scenario: Raw body captured during JSON parsing
- **WHEN** a request arrives at `POST /api/shipping/webhook`
- **THEN** the `express.json()` middleware SHALL capture the raw body via the `verify` callback and store it on `req.rawBody`

#### Scenario: Signature verified against raw body
- **WHEN** `SENDCLOUD_WEBHOOK_SECRET` is configured and the request has a `Sendcloud-Signature` header
- **THEN** the system SHALL compute `HMAC-SHA256(webhookSecret, req.rawBody)` and compare it to the signature header value

#### Scenario: Invalid signature rejected
- **WHEN** the computed HMAC does not match the signature header
- **THEN** the endpoint SHALL return 401 with `{ error: 'Invalid signature' }`

### Requirement: Webhook lookup by parcel ID

The webhook controller SHALL look up order items by `sendcloud_parcel_id` as the primary identifier, with a fallback to `sendcloud_shipment_id` using `parcel.shipment_uuid`.

#### Scenario: Lookup by parcel ID succeeds
- **WHEN** a webhook arrives with `parcel.id = 12345`
- **THEN** the system SHALL query `WHERE sendcloud_parcel_id = '12345'` on both `art_order_items` and `other_order_items`

#### Scenario: Fallback to shipment UUID when parcel ID not found
- **WHEN** no order item matches `sendcloud_parcel_id` (e.g., older items before migration)
- **THEN** the system SHALL query `WHERE sendcloud_shipment_id = ?` using `parcel.shipment_uuid` from the webhook payload

#### Scenario: Neither ID matches
- **WHEN** no order item is found by either parcel ID or shipment UUID
- **THEN** the system SHALL log a warning and return 200 to prevent Sendcloud retries

### Requirement: Handle announcement failure via webhook

The webhook controller SHALL handle the case where a shipment announcement fails asynchronously after the initial `POST /v3/shipments` response.

#### Scenario: Announcement failure status received
- **WHEN** the webhook reports a parcel status indicating announcement failure (e.g., status message contains "announcement failed" or status is outside the known STATUS_MAP and the item has no `sendcloud_parcel_id` yet)
- **THEN** the system SHALL log a warning with the shipment ID and error details

#### Scenario: Item marked for retry on announcement failure
- **WHEN** an announcement failure is detected
- **THEN** the system SHALL reset `sendcloud_parcel_id` to null on the affected order item (so the retry scheduler picks it up) and increment `sendcloud_announcement_retries`

### Requirement: Extract and store label URL from webhook payload

The webhook controller SHALL extract label information from the webhook payload when available.

#### Scenario: Label URL available in webhook payload
- **WHEN** the webhook payload contains `parcel.label.label_printer` or `parcel.documents` with type `"label"`
- **THEN** the system SHALL log the label availability for the shipment

#### Scenario: Tracking info updated from webhook
- **WHEN** the webhook payload contains non-empty `parcel.tracking_number` or `parcel.tracking_url`
- **THEN** the system SHALL update the order item's `tracking` and `sendcloud_tracking_url` columns with the new values
