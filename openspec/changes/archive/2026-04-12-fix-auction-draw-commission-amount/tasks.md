## 1. Fix Auction Billing Commission

- [x] 1.1 In `api/controllers/auctionAdminController.js` (~line 644-646), replace `config.dealerCommissionOthers` / `config.dealerCommissionArt` with `config.payment.dealerCommissionOthers` / `config.payment.dealerCommissionArt` and divide by 100 to convert the percentage to a rate. Remove the `|| 0` fallback (env.js already defaults to 0). The resulting lines should be:
  ```js
  const commissionRate = data.product_type === 'other'
    ? (config.payment.dealerCommissionOthers / 100)
    : (config.payment.dealerCommissionArt / 100);
  ```

## 2. Fix Draw Billing Commission

- [x] 2.1 In `api/controllers/drawAdminController.js` (~line 302-304), apply the identical fix: replace `config.dealerCommissionOthers` / `config.dealerCommissionArt` with `config.payment.dealerCommissionOthers` / `config.payment.dealerCommissionArt` and divide by 100. Remove the `|| 0` fallback. The resulting lines should be:
  ```js
  const commissionRate = data.product_type === 'other'
    ? (config.payment.dealerCommissionOthers / 100)
    : (config.payment.dealerCommissionArt / 100);
  ```

## 3. Verification

- [x] 3.1 Verify the fix is consistent with the normal order flow in `api/controllers/ordersController.js` (lines 445-446) which uses `config.payment.dealerCommissionArt / 100` and `config.payment.dealerCommissionOthers / 100`.
