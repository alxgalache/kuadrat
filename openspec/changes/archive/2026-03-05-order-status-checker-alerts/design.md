## Context

The order lifecycle in Kuadrat follows `pending_payment → paid → sent → arrived → confirmed`. Currently, once an item enters "arrived" or "sent" status, there is no timestamp recording when that transition happened and no mechanism to detect items lingering in those states. The `art_order_items` and `other_order_items` tables only store the current `status` value without any modification date.

The admin needs to proactively identify items stuck in transitional states — items marked "arrived" but never confirmed by the buyer (>10 days), and items marked "sent" but never acknowledged by the buyer (>15 days) — to follow up and ensure order completion.

**Current status update flows:**
- **Buyer** (public, token-based): `updateItemStatusPublic`, `updateOrderStatusPublic` — marks items as "arrived" or "confirmed"
- **Seller** (authenticated): `updateItemStatus` — marks items as "sent" with optional tracking
- **Admin** (authenticated + admin role): `updateItemStatusAdmin`, `updateOrderStatusAdmin` — changes to any status

## Goals / Non-Goals

**Goals:**
- Track the timestamp of every status change on order items
- Provide admin endpoints to detect stale items by status duration
- Send alert emails to the admin with details of stale items
- Add a simple UI trigger in the admin orders page

**Non-Goals:**
- Automated/scheduled alert checks (cron) — alerts are manually triggered by admin
- Backfilling `status_modified` for existing items (new column defaults to CURRENT_TIMESTAMP, which is adequate since this is a new capability)
- Notifications to buyers or sellers about stale items
- Configurable thresholds via UI (hardcoded: 10 days arrived, 15 days sent)

## Decisions

### 1. Column type: NUMERIC with CURRENT_TIMESTAMP default
**Choice:** `status_modified NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP`
**Rationale:** Consistent with SQLite's datetime storage. NUMERIC stores Unix epoch timestamps which allow straightforward arithmetic for "days since" calculations. `julianday('now') - julianday(status_modified)` provides day-based comparisons directly in SQL.

### 2. Update `status_modified` inline in existing queries
**Choice:** Add `status_modified = CURRENT_TIMESTAMP` to all existing UPDATE statements that change `status`.
**Alternative considered:** Trigger-based approach (SQLite CREATE TRIGGER). Rejected because Turso's libsql batch API may not guarantee trigger execution, and explicit updates are more transparent and testable.

### 3. Two separate endpoints instead of one parameterized endpoint
**Choice:** `GET /api/admin/orders/alerts/stale-arrived` and `GET /api/admin/orders/alerts/stale-sent`
**Rationale:** Each alert has distinct thresholds and semantics. Separate endpoints keep the controller logic simple and the API self-documenting. The frontend needs distinct menu actions anyway.

### 4. Alert endpoints both query AND send email in one call
**Choice:** Each endpoint queries for stale items and, if any are found, sends an email to `config.registrationEmail`, then returns the results.
**Alternative considered:** Separate query and email endpoints. Rejected to keep the UI simple — one click does everything.

### 5. Frontend: kebab menu with Headless UI or plain dropdown
**Choice:** Three-dot vertical icon button with a simple absolute-positioned dropdown menu using TailwindCSS utility classes.
**Rationale:** Follows the extreme minimalism principle. No additional UI library needed.

## Risks / Trade-offs

- **[Existing data has no status_modified]** → New items will have accurate timestamps from creation. Existing items will get `CURRENT_TIMESTAMP` at column creation time, which means the first alert run might include false positives for items that were actually old. → Mitigation: This is acceptable for a first run; the admin can manually review.
- **[Email delivery dependency]** → If SMTP is down, the endpoint will fail. → Mitigation: The endpoint still returns the stale items in the response, so the admin sees the data even if email fails. Log the email error but don't throw.
- **[No rate limiting on alert endpoints]** → Admin could spam the alert button. → Mitigation: These endpoints are behind admin auth and are GET requests with no side effects beyond email. Existing admin rate limiting applies.
