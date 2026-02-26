## Context

The `/eventos` page (auction listing) currently renders text-only stacked cards — each shows auction name, description, status badge, seller names, and date range. There are no product images. The gallery pages (`/galeria`, `/tienda`) use a `ProductGrid` component that displays products in a 2/4-column image-centric grid.

The auctions list API (`GET /api/auctions?from=&to=`) returns `product_count` and `sellers_summary` per auction but no product image basenames or pricing data. That data only exists in the detail endpoint (`GET /api/auctions/:id`).

The page layout has a sidebar with `AuctionCalendar` (date filtering) + a main content area. The sidebar/calendar behavior is unchanged.

## Goals / Non-Goals

**Goals:**
- Replace text-only auction cards with an image-centric grid matching the `ProductGrid` visual style
- Handle multi-product auctions with a 2×2 image mosaic
- Show "Subasta" pill badge with animated pulsing red dot on each grid element
- Enrich the list API to provide product preview data (images, authors, prices) without requiring per-auction detail fetches
- Display conditional text: single-product → author + start/current prices; multi-product → aggregated author + item count

**Non-Goals:**
- Changing the `AuctionCalendar` component or sidebar layout
- Modifying the auction detail page (`/eventos/[id]`)
- Changing the `ProductGrid` component itself (the auction grid is a separate component)
- Adding filtering, sorting, or search to the auctions page
- Modifying the admin auction management flows

## Decisions

### 1. Enrich list API with product preview data

**Decision:** Add a second query in `getAuctionsByDateRange()` to fetch the first 4 products (basename, name, seller_name, product_type, start_price, current_price) per auction, ordered by position.

**Rationale:** Fetching N individual auction details would create an N+1 query problem. A single batched query (similar to the existing sellers_summary pattern) is efficient. We only need the first 4 products for the 2×2 grid — no need to fetch all.

**Alternatives considered:**
- *Fetch auction details on the frontend*: N+1 API calls, poor performance, unnecessary data transfer.
- *Add a cover_image column to auctions*: Would require admin upload flow changes and doesn't solve multi-product display.

### 2. New `AuctionGridItem` component (not reusing `ProductGrid`)

**Decision:** Create a new `AuctionGridItem` component rather than extending `ProductGrid`.

**Rationale:** The auction grid element has significantly different requirements — 2×2 image mosaic, conditional text based on product count, badge overlay, dual pricing. Extending `ProductGrid` would violate single-responsibility and add complex conditional logic to a clean component. However, the outer grid container (the `<ul>` with `grid-cols-2 lg:grid-cols-4`) can follow the same TailwindCSS pattern.

### 3. Pulsing dot animation via TailwindCSS custom animation

**Decision:** Add a `pulse-dot` keyframe animation in `tailwind.config.js` (or use Tailwind's `@keyframes` in a global CSS file) for the red pulsing dot in the "Subasta" badge.

**Rationale:** Keeps styling within the TailwindCSS ecosystem. The animation needs a scale+opacity pulse that Tailwind's built-in `animate-ping` can approximate, but we may use `animate-ping` directly on the outer dot element since it produces the exact visual effect needed (ping = scale up + fade out).

### 4. Image URL resolution

**Decision:** The API will return both `product_type` (`'art'` | `'other'`) and `basename` for each preview product. The frontend will use the existing `getArtImageUrl(basename)` or `getOthersImageUrl(basename)` helpers to construct image URLs.

**Rationale:** Follows existing pattern used in `ShoppingCartDrawer`, `AuctionDetail`, and order pages. No new image URL logic needed.

### 5. Grid layout matches `ProductGrid` structure

**Decision:** Use the same grid CSS: `grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4` within the main content area. Each grid item follows `inline-flex w-full flex-col text-center` with `aspect-square` image area.

**Rationale:** Visual consistency with gallery and shop pages.

## Risks / Trade-offs

- **[Extra query on list endpoint]** → The product preview query adds one more DB call per list request. Mitigated by limiting to first 4 products per auction and using a single batched query with `IN (...)` clause. Given the calendar is month-scoped, auction count per query is small (typically <20).

- **[Image grid complexity]** → The 2×2 mosaic with "+X" logic adds UI complexity. Mitigated by isolating it in a dedicated sub-component (`AuctionImageMosaic` or similar) that receives a products array and handles all cases.

- **[Empty state]** → If an auction has 0 products (e.g., draft state that somehow passes filters), the grid element would have no image. Mitigated by showing a placeholder gray square, which is consistent with the mosaic's gray-cell pattern.
