## 1. Database Schema — Add status_modified column

- [x] 1.1 Add `status_modified NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP` column to the `art_order_items` CREATE TABLE statement in `api/config/database.js` ⚠️ HIGH-RISK: shared DB schema
- [x] 1.2 Add `status_modified NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP` column to the `other_order_items` CREATE TABLE statement in `api/config/database.js` ⚠️ HIGH-RISK: shared DB schema

## 2. Backend — Update status change flows to set status_modified

- [x] 2.1 Update `updateItemStatus` (seller marks as sent) in `api/controllers/ordersController.js` to include `status_modified = CURRENT_TIMESTAMP` in all UPDATE statements that change `art_order_items.status` and `other_order_items.status`
- [x] 2.2 Update `updateItemStatusPublic` (buyer marks single item as arrived/confirmed) in `api/controllers/ordersController.js` to include `status_modified = CURRENT_TIMESTAMP` in the UPDATE statement
- [x] 2.3 Update `updateOrderStatusPublic` (buyer marks all items as arrived/confirmed) in `api/controllers/ordersController.js` to include `status_modified = CURRENT_TIMESTAMP` in the bulk UPDATE statements for both `art_order_items` and `other_order_items`
- [x] 2.4 Update `updateItemStatusAdmin` (admin changes single item status) in `api/controllers/ordersController.js` to include `status_modified = CURRENT_TIMESTAMP` in the UPDATE statement ⚠️ HIGH-RISK: touches admin withdrawal accounting batch
- [x] 2.5 Update `updateOrderStatusAdmin` (admin changes all items status) in `api/controllers/ordersController.js` to include `status_modified = CURRENT_TIMESTAMP` in the bulk UPDATE statements ⚠️ HIGH-RISK: touches admin withdrawal accounting batch

## 3. Backend — Stale order alert controller functions

- [x] 3.1 Add `getStaleArrivedItems` controller function in `api/controllers/ordersController.js` that queries both `art_order_items` and `other_order_items` for items with status "arrived" where `julianday('now') - julianday(status_modified) > 10`, joining with orders and products tables to get order number and product name, sorted descending by days stale
- [x] 3.2 Add `getStaleSentItems` controller function in `api/controllers/ordersController.js` that queries both `art_order_items` and `other_order_items` for items with status "sent" where `julianday('now') - julianday(status_modified) > 15`, joining with orders and products tables to get order number and product name, sorted descending by days stale
- [x] 3.3 Both controller functions SHALL send alert email via emailService when stale items are found, and return the items list via `sendSuccess()`. If no items found, return empty list and skip email. Log email errors but do not throw.

## 4. Backend — Alert email templates

- [x] 4.1 Add `sendStaleArrivedAlertEmail` function in `api/services/emailService.js` that sends an HTML email to `config.registrationEmail` listing stale arrived items with order number, product name, product type (art/other), and days in arrived status
- [x] 4.2 Add `sendStaleSentAlertEmail` function in `api/services/emailService.js` that sends an HTML email to `config.registrationEmail` listing stale sent items with order number, product name, product type (art/other), and days in sent status

## 5. Backend — Admin routes

- [x] 5.1 Add `GET /alerts/stale-arrived` route in `api/routes/admin/orderRoutes.js` mapped to `getStaleArrivedItems` controller (admin auth already applied at router level)
- [x] 5.2 Add `GET /alerts/stale-sent` route in `api/routes/admin/orderRoutes.js` mapped to `getStaleSentItems` controller (admin auth already applied at router level)

## 6. Frontend — API client functions

- [x] 6.1 Add `getStaleArrivedAlerts()` function to `adminAPI.orders` in `client/lib/api.js` that calls `GET /api/admin/orders/alerts/stale-arrived`
- [x] 6.2 Add `getStaleSentAlerts()` function to `adminAPI.orders` in `client/lib/api.js` that calls `GET /api/admin/orders/alerts/stale-sent`

## 7. Frontend — Admin orders page kebab menu

- [x] 7.1 Add three-dot vertical icon button to the admin orders page header in `client/app/admin/pedidos/page.js`
- [x] 7.2 Implement dropdown menu with "Alertas de productos recibidos" and "Alertas de productos enviados" options, with click-outside-to-close behavior
- [x] 7.3 Wire "Alertas de productos recibidos" menu option to call `adminAPI.orders.getStaleArrivedAlerts()` with loading state and display result notification
- [x] 7.4 Wire "Alertas de productos enviados" menu option to call `adminAPI.orders.getStaleSentAlerts()` with loading state and display result notification

## 8. Constants

- [x] 8.1 Add `STALE_ARRIVED_DAYS: 10` and `STALE_SENT_DAYS: 15` constants to `client/lib/constants.js` for use in notification messages
