## Context

Products linked to a draw (`draws.product_id` + `draws.product_type`) currently appear in the public gallery (Galeria) and shop (Tienda) listings. This is inconsistent with how auction products are handled — those have a `for_auction` flag on the `art`/`others` tables that excludes them from public listings. Draw products lack an equivalent mechanism.

The draw lifecycle has these states: `draft → scheduled → active → finished` (or `cancelled` at any point before `finished`). Products should be hidden from listings when they're linked to a non-cancelled, non-finished draw, and restored when the draw is cancelled or deleted.

## Goals / Non-Goals

**Goals:**
- Exclude draw-linked products from Galeria and Tienda public listings.
- Follow the same pattern as `for_auction` for consistency.
- Keep the flag in sync with draw lifecycle transitions (create, cancel, delete, product change on update).

**Non-Goals:**
- Changing how draw products are displayed on draw detail pages (already works via `drawService.getDrawById`).
- Handling the `finished` state — when a draw finishes, the product is effectively won/sold, so keeping it hidden is correct.
- Adding frontend changes — the filtering is entirely server-side.

## Decisions

### 1. Add `for_draw` column to `art` and `others` tables

**Decision:** Add `for_draw INTEGER NOT NULL DEFAULT 0` to both tables, mirroring `for_auction`.

**Rationale:** This follows the established pattern, keeps queries simple (just add `AND (a.for_draw = 0 OR a.for_draw IS NULL)` alongside the existing `for_auction` filter), and avoids expensive subqueries against the `draws` table on every product listing request.

**Alternative considered:** Using a subquery `AND a.id NOT IN (SELECT product_id FROM draws WHERE product_type = 'art' AND status NOT IN ('cancelled'))` — rejected because it couples the product listing query to the draws table and is less performant.

### 2. Set `for_draw` during draw lifecycle transitions

**Decision:** Set `for_draw = 1` when a draw is created, and `for_draw = 0` when a draw is cancelled or deleted. On draw update, if `product_id` or `product_type` changes, reset the old product's flag and set the new product's flag.

**Rationale:** The flag must stay in sync with the draw state. The key transitions are:
- **Create draw** → set `for_draw = 1` on linked product
- **Cancel draw** → set `for_draw = 0` on linked product
- **Delete draw** (only allowed for draft/cancelled) → set `for_draw = 0` on linked product
- **Update draw** (product change) → reset old product, set new product

The `finished` state does NOT reset the flag — the product was won, so it should remain hidden from regular listings.

### 3. Modify existing service functions (not controller)

**Decision:** Add the `for_draw` flag management to `drawService.js` functions (`createDraw`, `cancelDraw`, `deleteDraw`, `updateDraw`).

**Rationale:** The service layer owns business logic. The controller just passes data through.

## Risks / Trade-offs

- **Existing draws in production:** Products already linked to active/scheduled draws will not have `for_draw = 1` after schema migration. → **Mitigation:** Since `database.js` uses `IF NOT EXISTS` and the column has `DEFAULT 0`, existing rows will default to 0. A one-time data fix may be needed, or the admin can re-save existing draws.
- **Flag desync:** If a draw is created outside the normal flow, the flag could get out of sync. → **Mitigation:** The draw admin controller is the only entry point for draw CRUD, so this is controlled.
