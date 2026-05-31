# Tasks — per-seller-commission-rates

## 1. Database schema (HIGH RISK — shared schema)
- [x] 1.1 In `api/config/database.js`, add to the `CREATE TABLE users` statement:
      `dealer_commission_art REAL NOT NULL DEFAULT 25` and
      `dealer_commission_other REAL NOT NULL DEFAULT 10`.
- [x] 1.2 In the same file, add two `safeAlter(...)` lines (next to the existing
      `ALTER TABLE users ADD COLUMN ...` block) for both columns with the same
      defaults, so existing databases are migrated additively.

## 2. Backend — commission source of truth
- [x] 2.1 `api/controllers/ordersController.js`: after loading `artProducts` /
      `othersProducts`, collect distinct `seller_id`s and run one
      `SELECT id, dealer_commission_art, dealer_commission_other FROM users WHERE id IN (...)`
      into a `Map`. Replace `config.payment.dealerCommissionArt/Others` (lines
      ~445–446, 450, 484) so each item's `commission_amount` uses its product
      owner's rate (`dealer_commission_art` for art, `dealer_commission_other`
      for other).
- [x] 2.2 `api/services/auctionService.js`: add `u.dealer_commission_art` (and
      `u.dealer_commission_other` for completeness) to the billing SELECTs that
      already `JOIN users u`.
- [x] 2.3 `api/controllers/auctionAdminController.js` (~648–651): compute
      `commissionRate` from `data.dealer_commission_art` / `dealer_commission_other`
      by `data.product_type` instead of `config.payment.dealerCommission*`.
- [x] 2.4 `api/services/drawService.js` (`getParticipationBillingData`): add the
      two commission columns to the SELECT that `JOIN`s `users`.
- [x] 2.5 `api/controllers/drawAdminController.js` (~302–305): compute
      `commissionRate` from the participation's seller commission columns by
      `data.product_type`.
- [x] 2.6 `api/scheduler/eventCreditScheduler.js`: resolve the host's
      `dealer_commission_other` (via JOIN in the eligible-events query on
      `events.host_user_id`, or a small per-event SELECT) and use it in
      `creditEvent` (~87) instead of `config.payment.dealerCommissionOthers`.

## 3. Backend — expose rates + admin editing
- [x] 3.1 `api/routes/sellerRoutes.js` `/wallet` (~388–389): source
      `commissionRateArt` / `commissionRateOther` from the user's row (add the two
      columns to the existing `SELECT ... FROM users WHERE id = ?`).
- [x] 3.2 `api/routes/sellerRoutes.js`: add `GET /commission-rates` (auth+seller)
      returning `{ commissionRateArt, commissionRateOther }` from the user's row.
- [x] 3.3 `api/validators/` (author/admin schema): add Zod validation for
      `dealer_commission_art` and `dealer_commission_other` as `number` in
      `[0, 100]` (optional on the update payload).
- [x] 3.4 `api/routes/admin/authorRoutes.js` `PUT /:id` (~316–363): accept the two
      fields, add them to the `UPDATE users`, and include them in the returned
      author SELECT. Apply the validator from 3.3.
- [x] 3.5 `api/routes/admin/authorRoutes.js` `GET` author detail: ensure the two
      columns are selected and returned.

## 4. Backend — remove env usage for calculation
- [x] 4.1 `api/config/env.js`: remove `dealerCommissionArt` /
      `dealerCommissionOthers` from `config.payment` (and confirm no remaining
      reference compiles).

## 5. Frontend
- [x] 5.1 `client/lib/api.js`: add `sellerAPI.getCommissionRates()` →
      `GET /api/seller/commission-rates`; ensure admin authors create/update API
      passes through the two commission fields.
- [x] 5.2 `client/app/seller/publish/page.js` (~549–561): fetch the seller's rates
      (via `getCommissionRates`) and use them in the net-earnings preview instead
      of `process.env.NEXT_PUBLIC_DEALER_COMMISSION_*`. Keep VAT from
      `NEXT_PUBLIC_TAX_VAT_*`.
- [x] 5.3 `client/app/orders/page.js` (~541): replace the
      `process.env.NEXT_PUBLIC_DEALER_COMMISSION_*` text with the
      `commissionRateArt` / `commissionRateOther` already returned by
      `getWallet()` (store them in state in `loadWallet`).
- [x] 5.4 `client/app/admin/authors/[id]/edit/page.js`: add two numeric inputs
      (`%`, step `0.01`, range `0`–`100`, es-ES labels) bound to
      `dealer_commission_art` / `dealer_commission_other`; submit them in the PUT.
- [x] 5.5 `client/app/admin/authors/[id]/page.js`: display the seller's current
      commission rates in the author detail view.

## 6. Config cleanup (remove the four env vars everywhere)
- [x] 6.1 Remove `DEALER_COMMISSION_ART` / `DEALER_COMMISSION_OTHERS` from
      `api/.env.example`.
- [x] 6.2 Remove `NEXT_PUBLIC_DEALER_COMMISSION_ART` /
      `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` from `.env.example` (root) and
      `client/.env.example`.
- [x] 6.3 Remove the `ARG`/`ENV` lines from `client/Dockerfile.staging` and
      `client/Dockerfile.prod`.
- [x] 6.4 Remove the `build.args` lines from `docker-compose.prod.yml`,
      `docker-compose.pre2.yml`, and `docker-compose.m1.yml`.

## 7. Verification
- [x] 7.1 Grep the repo for `DEALER_COMMISSION_ART`, `DEALER_COMMISSION_OTHERS`,
      `NEXT_PUBLIC_DEALER_COMMISSION_ART`, `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`,
      `dealerCommissionArt`, `dealerCommissionOthers` → expect zero matches in app
      code, compose, Dockerfiles, and `.env.example`.
- [x] 7.2 Manual check: cart checkout with two sellers having different rates →
      each `*_order_items.commission_amount` matches its seller's rate.
- [x] 7.3 Manual check: auction bill, draw bill, and event credit each use the
      product owner's / host's rate.
- [x] 7.4 Manual check: admin edits a seller's rate → publish preview, Monedero
      text, and next sale reflect the new value; past sales unchanged.
