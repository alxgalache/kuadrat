## Why

The "Facturar" (billing) flow for both auctions and draws stores `commission_amount = 0` in `art_order_items` / `other_order_items`. This means the gallery's commission is never recorded on orders created from auctions or draws, which corrupts seller earnings calculations and payout reports. The root cause is that both `auctionAdminController.js` and `drawAdminController.js` read the dealer commission from `config.dealerCommissionArt` / `config.dealerCommissionOthers` (top-level), but the values live under `config.payment.dealerCommissionArt` / `config.payment.dealerCommissionOthers`. The undefined access falls back to `0` via the `|| 0` guard, silently producing zero commission.

## What Changes

- Fix `auctionAdminController.js` to read dealer commission rates from `config.payment.dealerCommissionArt` / `config.payment.dealerCommissionOthers` (the correct nested path) and divide by 100 to convert percentage to rate, matching the normal order flow in `ordersController.js`.
- Fix `drawAdminController.js` with the identical correction.

## Capabilities

### New Capabilities

_None — this is a bug fix, not a new capability._

### Modified Capabilities

- `auction-bid-billing`: The commission calculation in the billing endpoint must use the correct config path (`config.payment.*`) and convert from percentage to rate (`/ 100`), consistent with the normal order flow.
- `draw-billing`: Same correction applies to the draw billing endpoint.

## Impact

- **Backend controllers**: `api/controllers/auctionAdminController.js` (line ~644), `api/controllers/drawAdminController.js` (line ~302) — two-line fix each.
- **Seller earnings**: Orders created from auctions/draws will now record the correct commission, so seller wallet balances and payout calculations become accurate.
- **No API contract changes**: Request/response shapes are unchanged.
- **No database schema changes**: Existing columns are used correctly; no migration needed.
- **Existing orders**: Previously created orders with `commission_amount = 0` are NOT corrected by this fix (data-repair is out of scope).
