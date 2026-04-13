## Context

Sellers set product prices in `client/app/seller/publish/page.js` without knowing their actual net earnings after the gallery commission and VAT. Two fiscal regimes apply:

- **Art (REBU):** The gallery takes a commission (default 25%) from the sale price. The artist invoices the remaining amount with 10% IVA included. The artist's net is the base imponible after extracting the IVA.
- **Others (General Regime):** The sale price includes 21% IVA. The gallery takes a commission (default 10%) on the base imponible. The artist's net is their share of the base.

Commission rates are already exposed via `NEXT_PUBLIC_DEALER_COMMISSION_ART` and `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS`. VAT rates exist only on the API side (`TAX_VAT_ES=0.21`) and the 10% art rate has no env var at all.

## Goals / Non-Goals

**Goals:**
- Expose VAT rates to the frontend via environment variables
- Add the reduced art VAT rate (`TAX_VAT_ART_ES`) to the API config
- Show a real-time net earnings legend below the price input in the seller publish form

**Non-Goals:**
- Changing any backend billing/invoicing logic
- Modifying actual order or payment calculations
- Adding VAT-related UI anywhere outside the publish form

## Decisions

### Decision 1: Environment variable naming and format

**Choice:** Add `TAX_VAT_ART_ES=0.10` to the API (decimal, consistent with existing `TAX_VAT_ES=0.21`). Add `NEXT_PUBLIC_TAX_VAT_ES=21` and `NEXT_PUBLIC_TAX_VAT_ART_ES=10` to the client (integer percentage, consistent with existing `NEXT_PUBLIC_DEALER_COMMISSION_*` vars).

**Alternative considered:** Use decimal format on the client too (0.21, 0.10). Rejected because all existing client env vars for business parameters use integer percentage format.

### Decision 2: Inline computation vs. shared utility

**Choice:** Compute the net earnings inline in the publish page component using a simple conditional based on `productCategory`. No shared utility or hook.

**Alternative considered:** Create a `useNetEarnings(price, category)` hook. Rejected because this is a single-use calculation in one component — extracting it would be premature abstraction.

### Decision 3: Legend visibility threshold

**Choice:** Only show the legend when `price >= 10` (the minimum valid price per existing validation). Below that or when empty, show nothing.

**Alternative considered:** Show "Recibirás 0.00€..." for empty/zero prices. Rejected because it adds visual noise with no informational value.

### Decision 4: Legend text format

**Choice:** Two-part text: `Recibirás X.XX€ netos por la venta (Y.YY€ incluyendo el IVA(Z%))` where X.XX is the base imponible (net), Y.YY is the gross amount the gallery transfers (including IVA), and Z% is the applicable VAT rate.

## Risks / Trade-offs

- **[Risk] Client env vars not set in some environments** → Mitigated: use sensible defaults when reading from `process.env` (21 for general VAT, 10 for art VAT), consistent with `client/.env.example` values.
- **[Risk] Rounding discrepancies between preview and actual billing** → Mitigated: both use `toFixed(2)` rounding. The legend is informational and clearly labeled as a preview, not a contractual amount. Actual billing uses backend calculations.
