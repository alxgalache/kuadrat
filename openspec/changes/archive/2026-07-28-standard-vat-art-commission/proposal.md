## Why

A new collaboration with an artist who invoices through an artists' cooperative ("aka.alicia@axgalache.me" in preprod, `tax_vat_art = 21`) breaks the assumption behind the current art commission split. Under REBU (`tax_vat_art = 10`) the flat `commission_amount = price × rate` split is correct, but under the standard regime the gallery's margin must additionally carry its own 21% VAT on top — otherwise the artist would be over-credited (e.g. PVP 337€ at 25% commission would credit 252.75€ instead of the correct 240.14€) and the platform would absorb the VAT on its margin. The fiscal model is documented in `docs/fiscalidad_cooperativa/140d-esquema-iva-cooperativa.html` and `140d-esquema-iva-cooperativa-desde-PVP.html`.

The downstream infrastructure (per-item `vat_regime` snapshot, two-bucket wallet, Series A/P/C/L invoices, fiscal export, `vatCalculator.js` withdrawal math) is already regime-aware and produces cent-exact results **once `commission_amount` is stored correctly at sale time**. Only the sale-time commission computation and the seller-facing earnings preview are missing the regime branch.

## What Changes

- **New shared helper** (`api/utils/artCommission.js` or equivalent next to `vatRegime.js`) computing the art `commission_amount` from `{price, commissionRate, vatRegime}`:
  - `art_rebu` → `price × c` (current behavior, unchanged).
  - `standard_vat` → `artistGross = round2(price × (1 − c) / (1 + c × 0.21))`; `commission_amount = price − artistGross`. The 0.21 is the gallery's own margin VAT (general rate), shared with the `VAT_RATE_*` constants in `api/utils/vatCalculator.js` — it is NOT the seller's `tax_vat_art`.
- **Apply the helper at the three art sale-time sites**: cart checkout (`ordersController.placeOrder`), auction bid billing (`auctionAdminController`), draw billing (`drawAdminController`). All three already resolve the seller's `tax_vat_art` and derive the regime, so no new queries are needed. `other` products and events are untouched.
- **Earnings preview** (`client/components/ProductForm.js`): for art products owned by a `standard_vat` seller the legend becomes `Recibirás {X}€ brutos por la venta` where `X` uses the same formula (e.g. PVP 337, commission 25 → `240.14`). REBU art and `other` legends unchanged.
- **API regime exposure**: `GET /api/seller/commission-rates` additionally returns `artVatRegime` (derived server-side, same as `/api/seller/wallet` already does); the admin product edit-data endpoint additionally returns the product owner's art regime. The client never re-implements the `=== 10` rule.
- **No changes** to: withdrawal/payout flow, two-bucket wallet crediting (`price_at_purchase − commission_amount` stays the universal formula everywhere), invoice series, fiscal export, cancellation reversals, seller emails — all verified to produce the correct figures (wallet 240.14€, commission base 80.05€ + VAT 16.81€, buyer invoice 278.51€ + 58.49€ for the PVP-337 reference case) once the stored commission is right.
- **No data migration**: `commission_amount` is frozen per item at sale time; existing sold items keep their historical values, and unsold products need no recalculation because commission is computed at sale time.

## Capabilities

### New Capabilities

- `standard-vat-art-commission`: regime-aware computation of the art `commission_amount` at sale time — the split formula for `standard_vat` art (gallery margin grossed up by its own 21% VAT), the rounding order (round the artist share first, commission by difference), the shared-constant relationship with `vatCalculator.js`, and the documented future-evolution path for the margin VAT rate.

### Modified Capabilities

- `per-seller-commission-rates`: checkout art `commission_amount` is no longer unconditionally `price × rate`; it delegates to the regime-aware helper (flat formula preserved for `art_rebu`).
- `auction-bid-billing`: auction art `commission_amount` computed via the regime-aware helper instead of the flat formula.
- `draw-billing`: draw art `commission_amount` computed via the regime-aware helper instead of the flat formula (`other` draws unchanged).
- `seller-net-earnings-preview`: the art legend branches on the seller's art VAT regime — `standard_vat` shows the new gross ("brutos") message with the cooperative split formula; the existing "Cooperative artist sees 21% applied to art" scenario is superseded.
- `per-seller-vat-rates`: `GET /api/seller/commission-rates` additionally returns `artVatRegime` (derived via `api/utils/vatRegime.js`).
- `admin-product-edit`: the edit-data endpoint additionally returns the product owner's derived art VAT regime for the edit-mode earnings preview.

## Impact

- **API**: `api/utils/` (new helper), `api/utils/vatCalculator.js` (export/share the margin VAT constant), `api/controllers/ordersController.js`, `api/controllers/auctionAdminController.js`, `api/controllers/drawAdminController.js`, `api/routes/sellerRoutes.js` (commission-rates payload), `api/controllers/adminProductEditController.js` (edit-data payload).
- **Client**: `client/components/ProductForm.js` (regime-aware art legend), `client/app/admin/products/[id]/edit/page.js` (pass owner regime through), `client/app/seller/publish/page.js` (no change expected beyond the shared component; verify).
- **DB**: none (no schema changes, no backfill).
- **Fiscal principle change (documented, intentional)**: the invariant "wallet amounts never depend on VAT rates" no longer holds for `standard_vat` art — the artist's wallet credit incorporates the 1.21 gross-up divisor by design. This must be stated explicitly in design.md so it is not "fixed" later.
- **Behavioral note**: for REBU sellers and all `other`/event flows, stored amounts and UI are byte-identical to today; the change only activates for art items whose seller derives `standard_vat`.
