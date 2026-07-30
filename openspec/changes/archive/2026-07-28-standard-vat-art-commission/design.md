## Context

The platform has two fiscal regimes for art sales, derived per seller from `users.tax_vat_art` via `api/utils/vatRegime.js` and snapshotted per item in `art_order_items.vat_regime`:

- **`art_rebu`** (`tax_vat_art = 10`): the author invoices at the reduced rate and the gallery resells under REBU. The commission split `commission_amount = price × c` is correct: for PVP 320 at 25%, the artist receives 240.00 and the gallery keeps 80.00 (its 21% margin VAT is *extracted from inside* the 80.00 at withdrawal time by `computeRebuVat`).
- **`standard_vat`** (any other rate, e.g. 21 — cooperative billing): REBU cannot apply. Per the reference model (`docs/fiscalidad_cooperativa/140d-esquema-iva-cooperativa-desde-PVP.html`), the gallery's margin must be grossed up by its own 21% VAT *on top* of the artist's share. With PVP 337 at 25%: margin `m = 337 ÷ 4.21 = 80.05`, cooperative invoice (artist gross) `= 3m = 240.14`, gallery retention `= m × 1.21 = 96.86`.

Today all three sale-time sites compute the flat split regardless of regime:

- `api/controllers/ordersController.js` (`placeOrder`, art items): `commissionAmount = product.price * sellerRate`
- `api/controllers/auctionAdminController.js` (bid billing): `Math.round(bidAmount * commissionRate * 100) / 100`
- `api/controllers/drawAdminController.js` (draw billing): `Math.round(drawPrice * commissionRate * 100) / 100`

Everything downstream derives the seller's money as `price_at_purchase − commission_amount` (wallet credit in `confirmationScheduler`, cancellation reversals in `ordersController`, seller emails, withdrawal lines) and routes by the frozen `vat_regime`. The withdrawal/invoice layer is already correct for `standard_vat` art: `computeStandardVat` extracts base 80.05 + VAT 16.81 from a 96.86 commission (matches the Modelo 303 figure in the reference doc), the buyer invoice goes on Series P with a full 21% breakdown (278.51 + 58.49 = 337.00), and the commission invoice on withdrawal goes on Series C. **The only wrong number in the chain is the stored `commission_amount`.**

The seller-facing preview in `client/components/ProductForm.js` (lines ~665-688) mirrors the flat split and shows the REBU-shaped message (`Recibirás {net}€ netos... ({gross}€ incluyendo {vat}% IVA)`) for all art, which is misleading for cooperative sellers.

## Goals / Non-Goals

**Goals:**

- Store a regime-correct `commission_amount` for `standard_vat` art at all three sale-time sites, so every downstream `price − commission` consumer (wallet, reversals, emails, withdrawal lines, invoices) is automatically correct with zero changes.
- Show cooperative sellers an accurate earnings preview: `Recibirás {X}€ brutos por la venta`, where `{X}` equals the exact amount that will later hit their wallet (240.14 for the PVP-337 / 25% reference case — form ↔ wallet coherence confirmed with the owner).
- Keep the `=== 10` regime rule server-side only: the client receives the derived regime from the API.
- Byte-identical behavior for REBU art, `other` products, and events.

**Non-Goals:**

- No changes to the withdrawal/payout flow, `vatCalculator.js` math, invoice series, fiscal export, or wallet bucket routing (verified already regime-correct).
- No DB schema changes, no backfill, no recalculation of historical `commission_amount` values (frozen-at-sale-time semantics preserved).
- No change to the seller orders page footer text ("Se aplica una comisión del X%...") — explicitly deferred by the owner.
- No per-seller configurability of the gallery's margin VAT rate (see Decision 4).

## Decisions

### 1. Formula and rounding order

For `standard_vat` art, with `c = dealer_commission_art / 100` and `V = 0.21` (gallery margin VAT, general rate):

```
artistGross       = round2( price × (1 − c) / (1 + c × V) )
commission_amount = price − artistGross
```

- The closed form is algebraically identical to the reference doc's `PVP ÷ 4.21 × 3` when `c = 0.25` (`(1−c)/(1+cV)` generalizes the 75/25 reparto — the divisor 4.21 is `(1−c)/c + 1.21` rescaled). Verified cent-exact against both reference HTMLs: PVP 337 → artist 240.14, commission 96.86, margin base 80.05, margin VAT 16.81.
- **Round the artist share first; commission by difference.** Every downstream consumer computes the seller's money as `price − commission`, so this ordering guarantees the seller sees exactly the rounded `artistGross` everywhere (preview, wallet, emails), and `artistGross + commission_amount ≡ price` holds exactly. Rounding the commission first could leave the artist amount off by a cent from what the preview promised.
- `round2` is half-away-from-zero (`Math.round(n * 100) / 100`), consistent with `vatCalculator.js`.
- For `art_rebu` the helper returns `round2(price × c)` — numerically identical to today's checkout value for 2-decimal prices and to the auction/draw sites which already round.

### 2. One shared helper, called at the three sale-time sites

New module `api/utils/artCommission.js` (sibling of `vatRegime.js`), exporting `artCommissionAmount({ price, commissionRate, vatRegime })` where `commissionRate` is the whole percentage (as stored in `users.dealer_commission_art`). All three insertion sites already have the seller's rate and the derived regime in hand at the call point (they select `tax_vat_art` alongside the commission column), so this is a drop-in replacement of the inline multiplication with no new queries.

*Alternative considered*: branching inline at each site. Rejected — three copies of a fiscal formula is exactly how the flat-split bug pattern arose; the project convention (`vatRegime.js`: "No backend code SHALL inline this comparison outside the helper") favors single-point-of-truth helpers.

### 3. The margin VAT constant is shared with `vatCalculator.js`

The `1 + c × V` gross-up in the sale-time formula and the `commission / 1.21` extraction in `computeStandardVat` at withdrawal time are the **same tax** (the gallery's own VAT on its margin) observed at two moments. The helper MUST consume the same constant (`VAT_RATE_STANDARD` exported from `api/utils/vatCalculator.js`) rather than a new literal, so the two ends can never drift: sale-time stores `m × (1+V)` and withdrawal-time recovers `m` and `m × V` exactly.

### 4. Margin VAT stays a fixed platform-level 21% (owner-confirmed); evolution path documented

The seller's `tax_vat_art` acts **only as the regime discriminator**; it does not parameterize the gross-up. Fiscally, the VAT the gallery repercutes on its own margin is a property of the gallery's supply (general rate, 21%), not of the seller — under REBU the margin is taxed at the general rate regardless of the 10% acquisition rate (arts. 135-139 LIVA), and under the standard regime the commission is an ordinary 21% service. Today both reference figures coincide because the cooperative's rate also happens to be 21; a seller with a hypothetical `tax_vat_art = 4` would still be `standard_vat` with a 21% margin gross-up.

**Owner-raised evolution path (recorded per their request):** if the margin VAT ever needs to vary, the owner proposed per-seller columns `tax_vat_art_gallery` / `tax_vat_other_gallery` on `users`. The recommended first step is instead a **platform-level configurable rate** (move `VAT_RATE_REBU` / `VAT_RATE_STANDARD` from `vatCalculator.js` into `config/env.js`) because (a) the margin VAT is determined by the gallery's own supply, so per-seller divergence is fiscally anomalous while a statutory rate change is platform-wide, and (b) the shared-constant wiring from Decision 3 makes that a one-file change with no data migration. If a genuine per-seller divergence ever materializes, the per-seller columns are viable but MUST then be snapshotted per item at sale time (like `vat_regime`), because withdrawals settle months later. Neither is implemented now.

### 5. Client receives the regime; it never derives it

`GET /api/seller/commission-rates` gains `artVatRegime` (derived via `artVatRegimeForRate`, mirroring what `/api/seller/wallet` already returns), and the admin edit-data endpoint (`adminProductEditController`) gains the product owner's derived regime alongside the existing `tax_rates`. `ProductForm` branches on the regime string in both create mode (fetched) and edit mode (passed down as a prop by `client/app/admin/products/[id]/edit/page.js`). This upholds the existing spec principle that the `=== 10` rule lives only in `api/utils/vatRegime.js`.

*Alternative considered*: client-side `taxRates.art === 10` check. Rejected — duplicates the regime rule across the boundary; a future change to the derivation (e.g. a 4% edge case policy) would silently desynchronize the preview.

### 6. Preview message wording and gating

- `standard_vat` art: `Recibirás {artistGross}€ brutos por la venta` — "brutos" because the cooperative later deducts its own VAT and internal commission from that amount (182.58 net to the artist in the reference doc; outside the platform's scope). No VAT breakdown is shown: the platform-level breakdown (278.51 + 58.49) is buyer-facing invoice detail, and the seller-facing 240.14 already includes the cooperative-side VAT the platform doesn't control.
- `art_rebu` art and `other`: existing messages and formulas untouched.
- Same gating as today (price ≥ 10, rates loaded); additionally the art branch requires the regime to be known, so a stale/failed rates fetch hides the preview rather than showing a wrong-regime message.

### 7. Intentional break of the "wallet amounts never depend on VAT rates" invariant

Until now the artist's wallet credit never depended on any VAT rate (REBU: `price × (1−c)`; other: `price × (1−c)` too — the VAT lives inside both shares proportionally). For `standard_vat` art this is **no longer true by design**: the artist share `price × (1−c) / (1 + c × V)` embeds the margin VAT gross-up. This is the fiscal requirement, not an accident — do not "simplify" the formula back to `price × (1−c)`. Recorded here so future refactors don't regress it.

## Risks / Trade-offs

- **[Wrong regime at preview vs sale time]** The preview uses the seller's *current* regime while the sale snapshots the regime at checkout. If the admin flips `tax_vat_art` between publish and sale, the preview seen at publish time no longer matches the eventual split. → Accepted: identical to the existing behavior for commission-rate changes (documented in `per-seller-commission-rates`); rates and regimes are effectively stable per seller relationship.
- **[Auction/draw prices set by admin under one regime, billed under another]** Same snapshot semantics: billing derives the regime at billing time. → Accepted; consistent with checkout.
- **[Existing unsold art of the cooperative artist]** Products published before this change carry prices chosen while the form showed the REBU-shaped preview. No code impact (commission is computed at sale time), but the artist may want to review prices once the new preview ships. → Communicate to the artist; no migration.
- **[Rounding drift between form and API]** Both compute `round2(price × (1−c) / (1 + c × 0.21))` independently (JS client / JS server, same double-precision semantics and same rounding function). → The spec pins the formula and rounding order on both sides; the reference case 337 → 240.14 is a required test scenario on each side.
- **[Effective retention over PVP exceeds the nominal rate]** A cooperative seller's total retention is `c(1+V)/(1+cV)` ≈ 28.74% of PVP at `c = 25`, while the orders page footer still says "25%". → Owner explicitly chose to leave the footer text unchanged; the 75/25 reparto over the margin is what the 25% refers to.
- **[Sellers with `tax_vat_art` neither 10 nor 21]** They derive `standard_vat` and get the 21% gross-up — defined behavior (Decision 4), flagged here because no such seller exists today.

## Migration Plan

Deploy is a plain code rollout: no schema change, no backfill, no env vars. Order-independent between API and client (the client change is presentational; the API change only affects new sales). Rollback = revert; items sold in the interim keep their stored `commission_amount` (frozen-at-sale semantics make both directions safe — historical rows are never recomputed).

## Open Questions

None — the three owner decisions are resolved: exact figure (240.14) in the preview, fixed 21% margin VAT with the evolution path recorded (Decision 4), footer text unchanged.
