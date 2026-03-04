## Why

Sellers currently have no way to track their actual available balance or request withdrawals of their earned commissions. The "Monedero" (wallet) section displays hardcoded placeholder values, and the "Gestión de pedidos" stats show a "Disponible para retirar" card that duplicates wallet information. This change implements the full seller wallet system (balance tracking, withdrawal flow, admin notification) and reorganizes the orders dashboard stats to avoid redundancy.

## What Changes

- **Seller wallet balance tracking:** Add `available_withdrawal` column to the `users` table to persistently store each seller's available balance. This balance is incremented (after commission deduction) when order **items** (in `art_order_items` / `other_order_items`) transition to `confirmed` status. The update is per-item and per-seller — since an order can contain products from multiple sellers, the balance hook must identify each seller's items within the order and credit them individually. The balance is decremented when a withdrawal is processed.
- **Withdrawals system:** Create a new `withdrawals` table to maintain a full history of seller withdrawal requests (amount, IBAN, status, timestamps). This provides auditability and supports future automated bank transfers.
- **Withdrawal modal flow:** Implement a two-step modal in the "Monedero" section: step 1 collects the seller's IBAN, step 2 confirms the details. On submission, the backend validates the amount, creates a withdrawal record, updates the seller's balance, and sends an email notification to the admin.
- **Dynamic commission display:** Replace the hardcoded "15%" commission text with the actual value from a `NEXT_PUBLIC_DEALER_COMMISSION` client environment variable (default: 15).
- **Stats card reorganization:** Replace the "Disponible para retirar" stat card with a "Número de pedidos" card showing the filtered order count. The wallet balance is now exclusively shown in the "Monedero" section.
- **Info tooltips on stat cards:** Add information icons next to each stat card title that display explanatory tooltips on click.
- **Backend validation:** Add server-side validation to the withdrawal endpoint to prevent fraudulent requests exceeding the available balance.

## Capabilities

### New Capabilities
- `seller-wallet`: Persistent seller balance tracking (`available_withdrawal` on `users` table), balance updates on order confirmation (after commission), and API endpoint to fetch the current balance.
- `seller-withdrawals`: Withdrawal request flow including `withdrawals` table, two-step IBAN modal, backend validation, balance deduction, and admin email notification. Designed to support future automated bank transfers.
- `orders-dashboard-stats`: Reorganized stats section — replaces "Disponible para retirar" with "Número de pedidos" (filtered order count), adds info icon tooltips on all stat cards, and displays commission percentage from environment variable.

### Modified Capabilities
_(none — no existing spec-level requirements are changing)_

## Impact

- **Database:** Two schema changes in `api/config/database.js` — new column on `users`, new `withdrawals` table.
- **Backend:** New withdrawal endpoint and validation schema; modifications to order confirmation logic to update seller balance; new admin notification email template; new env var usage for commission on the client side.
- **Frontend:** Changes to `client/app/orders/page.js` (Monedero section, stats cards, withdrawal modal); new client env var `NEXT_PUBLIC_DEALER_COMMISSION`; new API client functions in `client/lib/api.js`.
- **API routes:** New route(s) in `api/routes/sellerRoutes.js` or `api/routes/ordersRoutes.js` for withdrawal operations.
- **Email service:** New email template function in `api/services/emailService.js` for admin withdrawal notification.

### Clarifications (Resolved)

- **Order item status lifecycle:** Statuses are tracked at the item level (`art_order_items.status`, `other_order_items.status`) and at the order level (`orders.status`). An order can contain products from multiple sellers, so item-level status is what matters for per-seller balance crediting. The existing `updateItemStatus` endpoint (`PATCH /api/orders/:orderId/items/:itemId/status`) accepts any status string and is the code path where `confirmed` transitions will occur. The balance update hook MUST be placed inside `updateItemStatus` when the target status is `confirmed`, calculating the credit per-seller from their items only.
- **Withdrawal type:** Full balance withdrawal only (no partial amounts).
- **Admin notification email:** Sent to the address configured in `config.registrationEmail` (env var `REGISTRATION_EMAIL`), consistent with how other admin notifications (new orders, artist registrations) are sent.
