## 1. Shared commission helper (API)

- [x] 1.1 Create `api/utils/artCommission.js` exporting `artCommissionAmount({ price, commissionRate, vatRegime })`: `art_rebu` → `round2(price × c)`; `standard_vat` → `price − round2(price × (1 − c) / (1 + c × V))` with `V = VAT_RATE_STANDARD` imported from `api/utils/vatCalculator.js` (no new literal). Include the `round2` half-away-from-zero rounding and a header comment stating the rounding order rationale (artist share rounded first, commission by difference), the reference case (337 / 25% → 240.14 / 96.86), and a pointer to design.md Decision 4 (future evolution of the margin VAT rate; owner's `tax_vat_*_gallery` idea recorded there).
- [x] 1.2 Add unit tests in `api/tests/` covering: 337/25/standard → 96.86 (artist 240.14); 337/30/standard → 115.08 (artist 221.92); 320/25/rebu → 80.00; split identity `artistGross + commission = price` for standard cases; `commission decomposes via computeStandardVat into base 80.05 + VAT 16.81` for the reference case.

## 2. Sale-time call sites (API)

- [x] 2.1 `api/controllers/ordersController.js` (`placeOrder`, art items loop ~line 471): replace `product.price * sellerRate` with the helper call, passing the already-derived `vatRegime` for the item's seller. Verify the regime passed is the same value inserted into the row. `other` items untouched.
- [x] 2.2 `api/controllers/auctionAdminController.js` (bid billing ~line 658): replace the inline `Math.round(bidAmount * commissionRate * 100) / 100` for art with the helper call using the regime derived at ~line 711; ensure computation and snapshot use the same regime value.
- [x] 2.3 `api/controllers/drawAdminController.js` (draw billing ~line 309): for `product_type = 'art'`, replace the flat computation with the helper call using the regime derived at ~line 360; `other` draws keep the flat split.
- [x] 2.4 Grep the API for any other art `commission_amount` computation (`* sellerRate`, `commissionRate`) to confirm no fourth site exists (eventCreditScheduler is events-only, out of scope).

## 3. Regime exposure endpoints (API)

- [x] 3.1 `api/routes/sellerRoutes.js` (`GET /seller/commission-rates`): add `artVatRegime: artVatRegimeForRate(row.tax_vat_art)` to the payload (mirror of the existing `/seller/wallet` field).
- [x] 3.2 `api/controllers/adminProductEditController.js` (edit-data endpoint): add the owner's derived `artVatRegime` alongside the existing commission/tax rates in the response.

## 4. Earnings preview (client)

- [x] 4.1 `client/components/ProductForm.js`: store the fetched `artVatRegime` in state next to `taxRates` (create mode) and accept it via props in edit mode; extend the render gate so the art legend requires the regime to be known.
- [x] 4.2 Add the `standard_vat` art branch: `grossToArtist = round2(price × (1 − c) / (1 + c × 0.21))` (0.21 as a named constant in `client/lib/constants.js`, commented as the platform margin VAT mirroring `VAT_RATE_STANDARD`), legend `Recibirás {gross}€ brutos por la venta`. REBU art and `other` branches byte-identical to today.
- [x] 4.3 `client/app/admin/products/[id]/edit/page.js`: pass the owner's `artVatRegime` from the edit-data response into `ProductForm`.
- [x] 4.4 Verify `client/app/seller/publish/page.js` needs no change (create mode fetches rates inside `ProductForm`).

## 5. Verification

- [x] 5.1 Manual end-to-end against preprod data with "aka.alicia@axgalache.me" (`tax_vat_art = 21`, commission 25): publish form with price 337 shows `Recibirás 240.14€ brutos por la venta`; a checkout of that product stores `commission_amount = 96.86` and `vat_regime = 'standard_vat'`; confirming the item credits `available_withdrawal_standard_vat` with 240.14.
- [x] 5.2 Regression check for a REBU seller (`tax_vat_art = 10`): form message, stored `commission_amount = price × c`, and wallet credit unchanged from current behavior; `other` product preview and checkout unchanged.
- [x] 5.3 Withdrawal dry-run for the standard bucket: withdrawal lines for the 337 item show `seller_earning 240.14`, `taxable_base 80.05`, `vat_amount 16.81`; Series C commission invoice and Series P buyer invoice figures match `docs/fiscalidad_cooperativa/140d-esquema-iva-cooperativa-desde-PVP.html` (278.51 + 58.49 = 337.00).
- [x] 5.4 Run the API test suite (`api/tests/`) and confirm no regressions.
