## Why

Currently there is no way to detect order items that have been stuck in "arrived" or "sent" status for an extended period. When a buyer marks an item as arrived but never confirms receipt, or a seller marks an item as sent but the buyer never acknowledges arrival, these stale items go unnoticed. The admin needs proactive alerts to follow up on these cases and ensure orders reach completion.

## What Changes

- Add a `status_modified` column (NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP) to both `art_order_items` and `other_order_items` tables to track when each item's status last changed.
- Update all status change flows (buyer arrived/confirmed, seller sent, admin status change) to set `status_modified` to the current timestamp.
- Create two new admin API endpoints:
  - `GET /api/admin/orders/alerts/stale-arrived` — finds items in "arrived" status for more than 10 days and sends an alert email to the admin.
  - `GET /api/admin/orders/alerts/stale-sent` — finds items in "sent" status for more than 15 days and sends an alert email to the admin.
- Add email templates for both alert types, sending to `config.registrationEmail`.
- Add a kebab menu (three vertical dots) to the admin orders page (`/admin/pedidos`) with options to trigger each alert check.

## Capabilities

### New Capabilities
- `order-status-tracking`: Adds `status_modified` timestamp column to order item tables and ensures it is updated on every status change across all flows (buyer, seller, admin).
- `stale-order-alerts`: Two admin endpoints that query for stale items by status duration and send alert emails to the admin with item details sorted by days stale descending.
- `admin-alerts-ui`: Three-dot kebab menu on the admin orders page with options to trigger stale arrived and stale sent alert checks.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Database**: Schema change in `api/config/database.js` — two new columns on `art_order_items` and `other_order_items`.
- **Backend controllers**: `ordersController.js` — all status update functions (`updateItemStatus`, `updateItemStatusPublic`, `updateOrderStatusPublic`, `updateItemStatusAdmin`, `updateOrderStatusAdmin`) must include `status_modified` in their UPDATE queries.
- **Backend routes**: `api/routes/admin/orderRoutes.js` — two new GET routes for alerts.
- **Backend services**: `api/services/emailService.js` — two new email template functions for stale item alerts.
- **Frontend**: `client/app/admin/pedidos/page.js` — new kebab menu component with alert trigger actions.
- **Frontend API**: `client/lib/api.js` — two new functions in `adminAPI.orders` for the alert endpoints.
