## 1. Backend: Database Schema

- [x] 1.1 Update `users` table schema in `api/config/database.js` to add `withdrawal_recipient` (TEXT) and `withdrawal_iban` (TEXT) columns. [High-risk: DB schema]

## 2. Backend: Withdrawal API

- [x] 2.1 Identify withdrawal validation schema (e.g., in `api/validators/`) and update to allow optional `saveDetails` (boolean), `recipientName` (string), and `iban` (string).
- [x] 2.2 Update the withdrawal controller logic (likely in `api/controllers/` handling `POST /api/seller/withdrawals`) to update the user's `withdrawal_recipient` and `withdrawal_iban` in the database transaction if `saveDetails` is true.
- [x] 2.3 Ensure the `GET /api/users/me` or auth context includes the `withdrawal_recipient` and `withdrawal_iban` fields so the frontend can read them.

## 3. Frontend: Withdrawal Modal UI

- [x] 3.1 In `client/app/orders/page.js`, update the styling (border, padding, classes) of the IBAN input in the withdrawal modal to match standard inputs (like those in `publish/page.js`).
- [x] 3.2 In `client/app/orders/page.js`, add a "Full name" input field above the IBAN field in the withdrawal modal, applying standard styling.
- [x] 3.3 In `client/app/orders/page.js`, add the "Recordar beneficiario y número de cuenta para futuros pagos" checkbox below the IBAN field.
- [x] 3.4 Implement auto-formatting logic for the IBAN input (inserting a space every 4 digits as the user types).

## 4. Frontend: Withdrawal Integration

- [x] 4.1 Update the withdrawal modal component state to initialize `recipientName` and `iban` from the authenticated user's context/data if available.
- [x] 4.2 Update the withdrawal API call on the frontend to include `recipientName`, `iban`, and the boolean `saveDetails` flag when submitting.

## 5. Frontend: Dashboard Stats

- [x] 5.1 In `client/app/orders/page.js`, rename the "Total retirado" stat card to "Total sin comisión".
- [x] 5.2 Update the tooltip text for the new "Total sin comisión" card to reflect its new meaning (sum of subtotals before commission).
- [x] 5.3 Implement dynamic calculation logic for the "Total sin comisión" card: iterate through the currently filtered/displayed list of orders in the dashboard and sum the `subtotal` properties.
