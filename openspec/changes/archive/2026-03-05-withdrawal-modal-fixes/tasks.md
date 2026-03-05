## 1. Backend — Clear stored payment details on uncheck

- [x] 1.1 In `api/routes/sellerRoutes.js`, update the `else` branch (when `saveDetails` is false) in `POST /api/seller/withdrawals` to set `withdrawal_recipient = NULL` and `withdrawal_iban = NULL` in the `UPDATE users` query

## 2. Frontend — IBAN input max length

- [x] 2.1 In `client/app/orders/page.js`, update the IBAN `onChange` handler to cap the raw alphanumeric value at 24 characters (via `.slice(0, 24)`) before applying the 4-char spacing format

## 3. Frontend — Checkbox styling

- [x] 3.1 In `client/app/orders/page.js`, update the "save details" checkbox `className` to use `accent-black` ensuring a black checkmark when checked, consistent with `client/app/seller/publish/page.js` pattern

## 4. Frontend — Checkbox initial state from stored data

- [x] 4.1 In `client/app/orders/page.js`, update `openWithdrawalModal()` to set `saveDetails: true` when `savedPaymentDetails.recipientName` or `savedPaymentDetails.iban` are non-empty
- [x] 4.2 In `client/app/orders/page.js`, update `handleWithdrawalSubmit()` to clear `savedPaymentDetails` state (set both to `''`) when `saveDetails` is false after a successful submission
