## Context

The platform currently supports auctions as the sole event type in the "Eventos" section. Auctions have a rich infrastructure: 8 database tables, a service layer, public + admin controllers, real-time Socket.IO bidding, a scheduler for lifecycle automation, Stripe payment authorization, and email notifications. The frontend has dedicated components for the grid display, detail page, bid modal, and real-time hooks.

Draws (Sorteos) are a new event type where a single product is raffled among participants. Unlike auctions (competitive bidding, multiple products, real-time price updates), draws are simpler: one product, capped participation slots, registration-based entry, and random winner selection.

## Goals / Non-Goals

**Goals:**
- Add draws as a first-class event type alongside auctions, with full backend CRUD, public participation flow, admin management, lifecycle automation, and email notifications
- Display draws and auctions in the same Eventos grid with distinct visual badges
- Provide a draw detail page with product-centric layout and participation entry
- Enforce participation uniqueness by email per draw
- Reuse the existing multi-step modal pattern (buyer registration, payment auth, confirmation) adapted for draw participation
- Follow all existing codebase patterns exactly (service layer, response helpers, Zod validators, Pino logging, etc.)

**Non-Goals:**
- Real-time Socket.IO for draws (no competitive bidding, no live price updates needed) — draws only need basic participant count updates, which can be handled via API polling or simple socket events if desired later
- Winner selection algorithm implementation in this phase — the scheduler will mark draws as finished, but the actual random selection and payment charge can be a follow-up (manual winner selection by admin is acceptable as initial implementation)
- IP-based uniqueness enforcement — the doc mentions email + IP, but IP validation is unreliable (NAT, VPN) and adds complexity. Email uniqueness per draw is sufficient for now. IP tracking can be added later.
- Draw-specific shipping postal code restrictions — draws have a single product; if shipping restrictions are needed, they can reuse the product's existing restrictions. No draw-specific postal code tables needed.

## Decisions

### 1. Simplified product reference: polymorphic columns on `draws` table

**Decision:** Store the product reference directly on the `draws` table using `product_id` (INTEGER) and `product_type` (TEXT, 'art' | 'other') columns, rather than creating separate `draw_arts` / `draw_others` junction tables.

**Rationale:** Auctions use separate junction tables (`auction_arts`, `auction_others`) because an auction can have multiple products of different types with per-product metadata (position, step_new_bid, current_price, etc.). Draws have exactly one product, so a junction table adds needless complexity. A polymorphic pair on the `draws` table is clean and sufficient.

**Alternatives considered:**
- Separate `draw_arts` / `draw_others` tables (auction pattern): Rejected — over-engineering for a 1:1 relationship.
- Single `draw_products` junction table with polymorphic ref: Rejected — still unnecessary indirection for 1:1.

### 2. Draw-specific tables: `draws`, `draw_buyers`, `draw_participations`, `draw_authorised_payment_data`

**Decision:** Create 4 tables mirroring the auction pattern but simplified:
- `draws` — master record with product ref, units, max_participations, price, status, dates
- `draw_buyers` — registered participants (same structure as `auction_buyers`: name, email, addresses, password)
- `draw_participations` — records each entry (simpler than `auction_bids`: no amount, no product_type needed since draw has one product)
- `draw_authorised_payment_data` — Stripe payment method storage (identical structure to auction equivalent)

**Rationale:** Maintaining separate tables per event type (rather than a shared `event_buyers` table) keeps the codebase consistent with the existing auction pattern and avoids complex polymorphic queries. The tables are structurally similar but semantically distinct.

**No postal code tables needed:** Since draws have a single product, shipping restrictions (if any) can be validated against the product's existing restrictions. No `draw_*_postal_codes` tables.

### 3. No `draw_users` (seller assignment) table

**Decision:** Omit the `draw_users` equivalent. The seller is implicitly determined by the product's owner (the seller of the art/other product referenced by the draw).

**Rationale:** `auction_users` exists because auctions can have multiple products from different sellers, requiring explicit seller association. Draws have exactly one product → one seller, resolved via JOIN.

### 4. Eventos page: unified fetch with type discriminator

**Decision:** Extend the existing auctions API endpoint to optionally include draws, OR create a parallel draws endpoint and merge client-side. The recommended approach is a **new `/api/draws` endpoint** (with date range filtering like auctions) and **merge both results in the frontend**.

**Rationale:** A unified endpoint would require significant refactoring of `auctionService.getAuctionsByDateRange()`. Keeping endpoints separate follows the existing pattern (separate services, controllers, routes) and lets the frontend merge and sort by date. The Eventos page already loads data for a month at a time, so two parallel fetches are trivial.

**Frontend merge:** The Eventos page fetches both `auctionsAPI.getByDateRange(from, to)` and `drawsAPI.getByDateRange(from, to)`, merges the arrays, and adds a `type` discriminator ('auction' | 'draw') for the grid renderer. The calendar highlights dates that have either type.

### 5. Draw detail page route: `/eventos/sorteo/[id]`

**Decision:** Nest draw detail pages under `/eventos/sorteo/[id]` rather than creating a top-level `/sorteos/` route.

**Rationale:** Draws are part of the Eventos section. Using `/eventos/sorteo/[id]` keeps them under the same namespace as auctions (`/eventos/[id]`), maintains a clear URL hierarchy, and avoids adding a new navbar entry. The path segment `sorteo` disambiguates from auction IDs.

### 6. Participation modal: adapted BidModal pattern

**Decision:** Create a new `DrawParticipationModal` component following the same phase-based pattern as `BidModal` but with fewer phases:
- CHOOSE → VERIFY (returning) or TERMS → PERSONAL → DELIVERY → INVOICING → PAYMENT → CONFIRM → SUCCESS

The phases are structurally identical to BidModal. The differences:
- CONFIRM phase shows product image, price, and a simple "Confirmar inscripcion" button (no bid amount, no live price updates)
- SUCCESS phase confirms entry (no bid_password display needed, but we keep it for returning participant flow)
- No price-change warnings or anti-snipe logic

**Rationale:** Reusing the exact same multi-step flow ensures consistency and familiarity. The payment authorization (0 EUR SetupIntent) is identical. We could abstract a shared base component, but that's premature optimization — better to duplicate the pattern and refactor later if needed.

### 7. Draw lifecycle: scheduler extends `auctionScheduler.js`

**Decision:** Add draw lifecycle checks to the existing `auctionScheduler.js` rather than creating a separate scheduler. The scheduler already runs every 30 seconds; adding draw status transitions to the same cron is simpler and avoids multiple timers.

**Rationale:** The scheduler logic is lightweight (query + status update). A single scheduler with both auction and draw lifecycle checks is more maintainable. If the file grows too large, it can be split later.

### 8. Draw badge: reusable `EventBadge` component with type prop

**Decision:** Instead of creating a separate `DrawBadge` component, create a single `EventBadge` component that accepts a `type` prop ('auction' | 'draw') and renders accordingly:
- `type="auction"`: Red pulsing dot + "Subasta" (current `AuctionBadge` behavior)
- `type="draw"`: Black non-pulsing dot + "Sorteo"

Keep `AuctionBadge` as a thin wrapper for backwards compatibility.

**Rationale:** The badge behavior differs only in dot color/animation and label text. A shared component avoids duplication and makes it easy to add future event types.

### 9. Draw grid item: reusable logic with AuctionGridItem

**Decision:** Create a `DrawGridItem` component. Since draws always have exactly one product, this component is simpler than `AuctionGridItem` — it always shows a single image, author name, title, and price. No mosaic, no multi-seller logic.

**Rationale:** Draws and auctions have different enough display logic (single vs multi-product, different badge, different pricing display) that separate components are cleaner than conditional branches in a shared component.

### 10. Draw price stored on `draws` table

**Decision:** The draw's product price is stored as `price` on the `draws` table itself (not derived from the product table). This is the price participants will pay if they win.

**Rationale:** The draw price may differ from the product's catalog price (could be discounted, bundled with shipping, etc.). Storing it on the draw gives admin control and matches the auction pattern where `start_price` is set per product-in-auction, not derived from the product.

## Risks / Trade-offs

- **[Code duplication]** → The draw service, controller, validators, and modal will heavily mirror auction equivalents. This is intentional — following existing patterns over premature abstraction. Mitigation: clear naming conventions and consistent structure make future refactoring straightforward.

- **[Two API calls for Eventos page]** → The frontend makes two parallel API calls (auctions + draws) per month. Mitigation: Both are fast, cached, and run in parallel via `Promise.all`. The calendar already re-fetches on month change.

- **[Winner selection deferred]** → Initial implementation lets admin manually select winners. Automated random selection is a follow-up. Mitigation: The `drawScheduler` marks draws as `finished` and the admin can process winners manually via admin UI.

- **[No IP uniqueness]** → Email uniqueness per draw is enforced, but IP-based deduplication is deferred. Mitigation: Email validation + Stripe payment auth (requires valid card) provides reasonable fraud prevention for now.

- **[Schema migration on existing databases]** → New tables use `CREATE TABLE IF NOT EXISTS` (idempotent), so no migration needed. Zero risk for existing data.

## Open Questions

1. **Draw end behavior**: When a draw ends, should participants be notified immediately, or only when the winner is selected? (Current plan: draw ends → status becomes 'finished' → admin selects winner → winner email sent.)
2. **Participant limit display**: Should the grid item show "X/Y participantes" or just the participant count? (Current plan: detail page shows both, grid item shows neither.)
3. **Draw-specific shipping**: Do draws need shipping restrictions, or is shipping handled post-win? (Current plan: no draw-specific shipping restrictions; winner provides/confirms address after selection.)
