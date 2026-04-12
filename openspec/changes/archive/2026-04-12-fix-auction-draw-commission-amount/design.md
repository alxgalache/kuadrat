## Context

The auction billing flow (`auctionAdminController.js`) and draw billing flow (`drawAdminController.js`) both compute the gallery's commission on order items. However, both controllers access the dealer commission config values at the wrong path (`config.dealerCommissionArt` instead of `config.payment.dealerCommissionArt`), causing `commission_amount` to always be `0`.

The normal order creation flow in `ordersController.js` (lines 445-446) does it correctly:
```js
const dealerCommissionRateArt = config.payment.dealerCommissionArt / 100;
const dealerCommissionRateOthers = config.payment.dealerCommissionOthers / 100;
```

The bug was introduced when the auction and draw billing features were implemented as separate controllers that did not reuse the order creation logic. Both controllers independently wrote their own commission calculation, introducing two errors:
1. Wrong config path: `config.dealerCommissionArt` (undefined → 0) instead of `config.payment.dealerCommissionArt`
2. Missing `/100` conversion: the env values are stored as percentages (e.g. `15` for 15%), but the buggy code treats them as direct rates

## Goals / Non-Goals

**Goals:**
- Fix commission calculation in auction billing so `art_order_items.commission_amount` reflects `bidAmount * config.payment.dealerCommissionArt / 100`
- Fix commission calculation in draw billing so both `art_order_items.commission_amount` and `other_order_items.commission_amount` are calculated with the correct config path and percentage-to-rate conversion
- Align the formula with the normal order flow in `ordersController.js`

**Non-Goals:**
- Retroactively fixing existing orders that already have `commission_amount = 0` (data repair is out of scope)
- Refactoring commission calculation into a shared utility (desirable but separate concern)
- Changing the client-side admin pages (the bug is entirely server-side)

## Decisions

### Decision 1: Match the ordersController formula exactly

**Choice:** Use `config.payment.dealerCommissionArt / 100` and `config.payment.dealerCommissionOthers / 100` as the rate, then multiply by the item price. Apply `Math.round(... * 100) / 100` for two-decimal rounding (already present in the auction/draw code).

**Rationale:** The normal order flow (`ordersController.js` line 450) uses `product.price * dealerCommissionRateArt` without explicit rounding — but the auction/draw flows already have `Math.round(x * 100) / 100`, which is slightly more precise. We keep the rounding since it is harmless and already in place.

**Alternative considered:** Extract a shared `calculateCommission(price, productType)` utility. Rejected for now: this is a targeted bug fix, and a refactor would touch `ordersController.js` too — adding risk for no user-facing benefit.

### Decision 2: No fallback to 0 when config value is undefined

**Choice:** Access `config.payment.dealerCommissionArt` directly without an `|| 0` guard. If the env var is misconfigured, `config.payment.dealerCommissionArt` defaults to `0` via `optionalFloat('DEALER_COMMISSION_ART', 0)` in `env.js`, so a separate fallback is unnecessary and only masked the original bug.

**Rationale:** The `|| 0` guard on the broken path (`config.dealerCommissionArt || 0`) silently swallowed the `undefined`, making the bug hard to detect. Removing the redundant fallback makes future misconfigurations surface more clearly.

## Risks / Trade-offs

- **[Risk] Existing orders with zero commission remain uncorrected** → Out of scope; a separate data-repair task can be created if needed.
- **[Risk] DEALER_COMMISSION env vars not set in some environments** → Mitigated: `env.js` already defaults both to `0`, so missing env vars produce `commission = 0` intentionally (same as today, but now for the right reason).
