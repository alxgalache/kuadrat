## 1. Database Schema Changes

- [x] 1.1 **[HIGH-RISK]** Add `available_withdrawal REAL NOT NULL DEFAULT 0` column to the `users` CREATE TABLE statement in `api/config/database.js`
- [x] 1.2 Add `withdrawals` table to `api/config/database.js` with columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `user_id` (INTEGER NOT NULL, FK to users), `amount` (REAL NOT NULL), `iban` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'pending', CHECK IN ('pending', 'completed', 'failed')), `created_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP), `completed_at` (DATETIME DEFAULT NULL), `admin_notes` (TEXT DEFAULT NULL)
- [x] 1.3 Add index on `withdrawals(user_id)` in `api/config/database.js`

## 2. Backend: Seller Wallet Endpoint

- [x] 2.1 Create Zod validation schema for withdrawal request in `api/validators/withdrawalSchemas.js`: body requires `iban` (string, non-empty)
- [x] 2.2 Add `getSellerWallet` controller function — queries `users.available_withdrawal` for `req.user.id` and returns `{ balance, commissionRate }` using `config.payment.dealerCommission`. Place in a new file or within an existing controller used by seller routes.
- [x] 2.3 Add `GET /api/seller/wallet` route in `api/routes/sellerRoutes.js` (already protected by `authenticate + requireSeller`)

## 3. Backend: Withdrawal Request Endpoint

- [x] 3.1 Add `createWithdrawal` controller function — atomically reads `available_withdrawal`, validates > 0, creates withdrawal record with the full balance amount, sets `available_withdrawal` to 0, all using `createBatch()`. The amount is always the server-side `available_withdrawal` value (never from the client request).
- [x] 3.2 Add `POST /api/seller/withdrawals` route in `api/routes/sellerRoutes.js` with `validate(withdrawalSchema)` middleware
- [x] 3.3 Add `sendWithdrawalNotificationEmail` function in `api/services/emailService.js` — sends email to `config.registrationEmail` (env var `REGISTRATION_EMAIL`) with seller name, email, amount, IBAN, and date. Follow existing email template patterns (HTML template, logo attachment, `getFormattedSender()`).
- [x] 3.4 Call `sendWithdrawalNotificationEmail` from `createWithdrawal` controller (non-blocking — log errors via `logger.error` but don't fail the request)

## 4. Backend: Balance Update on Item Confirmation

- [x] 4.1 **[HIGH-RISK]** Modify `updateItemStatus` in `api/controllers/ordersController.js` (lines 1457-1594): when `status === 'confirmed'`, add a guard to check the item's **current** status is NOT already `'confirmed'` before proceeding with the balance update (prevents double-crediting)
- [x] 4.2 **[HIGH-RISK]** In the `confirmed` branch of `updateItemStatus`: determine the seller by JOINing the item with its product table (`art.seller_id` for `art_order_items`, `others.seller_id` for `other_order_items`). Calculate `sellerEarning = price_at_purchase - commission_amount`. Atomically update the item status AND increment the seller's `available_withdrawal` by `sellerEarning` using `createBatch()`.
- [x] 4.3 After confirming an item, check if ALL items in the order (both `art_order_items` and `other_order_items`) are now `'confirmed'`. If so, update `orders.status` to `'confirmed'` (mirrors the existing `checkAndUpdateOrderStatus` pattern used for `'sent'`).
- [x] 4.4 Add structured logging (`logger.info`) when balance is updated: include seller ID, order ID, item ID, item type (`art`/`other`), and amount credited

## 5. Backend: Stats Endpoint Update

- [x] 5.1 Add `orderCount` (current period) and `orderCountChange` (comparison with previous period) to the `getSellerStats` response in `api/controllers/ordersController.js` — count of distinct orders containing the seller's items, filtered by the same date range parameters
- [x] 5.2 Remove the `available` field from `getSellerStats` response (this data now comes from `GET /api/seller/wallet`)

## 6. Frontend: API Client Updates

- [x] 6.1 Add `sellerAPI.getWallet()` function in `client/lib/api.js` — calls `GET /api/seller/wallet`, returns `{ balance, commissionRate }`
- [x] 6.2 Add `sellerAPI.createWithdrawal(iban)` function in `client/lib/api.js` — calls `POST /api/seller/withdrawals` with `{ iban }` body

## 7. Frontend: Monedero Section Updates

- [x] 7.1 Add `NEXT_PUBLIC_DEALER_COMMISSION` to `client/.env.example` with default value `15`
- [x] 7.2 Replace hardcoded "15%" in Monedero description text with the value from `process.env.NEXT_PUBLIC_DEALER_COMMISSION || '15'` in `client/app/orders/page.js`
- [x] 7.3 Fetch real balance on page load via `sellerAPI.getWallet()` and display it in the Monedero section instead of the hardcoded `2338.99` value
- [x] 7.4 Disable "Realizar transferencia" button when balance is 0 with visual styling (e.g., opacity, cursor-not-allowed)

## 8. Frontend: Withdrawal Modal

- [x] 8.1 Implement two-step withdrawal modal component in `client/app/orders/page.js` — Step 1: title, description, IBAN input field, "Siguiente" button; Step 2: IBAN confirmation display, withdrawal amount display, "Confirmar" and "Volver" buttons
- [x] 8.2 Wire "Realizar transferencia" button onClick to open the modal
- [x] 8.3 On "Confirmar" click: call `sellerAPI.createWithdrawal(iban)`, show loading state, on success show confirmation message and update displayed balance to 0
- [x] 8.4 Handle error states (API failure, insufficient funds) with user-friendly Spanish error messages

## 9. Frontend: Stats Section Reorganization

- [x] 9.1 Replace "Disponible para retirar" stat card with "Número de pedidos" card in `client/app/orders/page.js`, using the `orderCount` value from the stats API response
- [x] 9.2 Update `sellerStats` state shape to include `orderCount` instead of `available`
- [x] 9.3 Add info icon (ℹ) next to each stat card title with onClick tooltip functionality
- [x] 9.4 Add Spanish tooltip text for each stat card: "Número de pedidos", "Total de ventas", "Total retirado", "Pendiente de confirmación"

## 10. Environment & Configuration

- [x] 10.1 Verify `DEALER_COMMISSION` is set to `15` in the server `.env` file (already defined in `api/config/env.js` but defaults to 0)
- [x] 10.2 Add `NEXT_PUBLIC_DEALER_COMMISSION=15` to the client `.env` file
- [x] 10.3 Fix inconsistency in `api/controllers/ordersController.js` line 373: replace `process.env.DEALER_COMMISSION` with `config.payment.dealerCommission` (follow centralized config pattern)
