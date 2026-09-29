---
paths:
  - "api/utils/{vatRegime,vatCalculator,artCommission,fiscalReportFormatter,paymentHelpers}.js"
  - "api/services/invoiceService.js"
  - "api/controllers/{ordersController,drawAdminController,invoiceController,stripeConnectPayoutsController,stripeConnectFiscalReportController}.js"
  - "api/routes/admin/authorRoutes.js"
  - "api/scheduler/{auctionScheduler,eventCreditScheduler}.js"
  - "docs/fiscal_comisiones_y_facturacion.md"
---

## Business / VAT (per-seller)

* **Business / VAT (per-seller):** VAT rates are per-seller columns on `users`: `tax_vat_art` (default 10) and `tax_vat_other` (default 21), whole percentages, editable by the admin (same pattern as `dealer_commission_*`). The fiscal regime of an art sale is **derived** from `tax_vat_art` via `api/utils/vatRegime.js`: `10 → 'art_rebu'`, any other value (e.g. 21 = cooperativa) `→ 'standard_vat'`. `other` products and events are always `standard_vat`. The regime is **snapshotted per item** in `art_order_items.vat_regime` at sale time (checkout, auction billing, draw billing) — changing a seller's rate only affects future sales; reads use `COALESCE(vat_regime, 'art_rebu')`. Wallet crediting/debiting, payouts, buyer invoices (Serie A REBU / Serie P standard) and the fiscal export all key off the item's snapshot, not its table. `TAX_VAT_ES` (env) is **legacy-only**: it survives solely for Revolut line item metadata (`ordersController.placeOrder`); `TAX_VAT_ART_ES` and the `NEXT_PUBLIC_TAX_VAT_*` build vars have been removed.
