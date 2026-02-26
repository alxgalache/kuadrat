## 1. Backend — Enrich Auction List API

- [x] 1.1 Add product preview query to `getAuctionsByDateRange()` in `api/services/auctionService.js`. Fetch first 4 products per auction (UNION of `auction_arts` + `auction_others` joined to their product tables and users), returning `basename`, `name`, `product_type`, `seller_name`, `start_price`, `current_price`, ordered by `position`, limited to 4 per auction. Group results by `auction_id` and attach as `product_previews` array on each auction object.
- [x] 1.2 Verify that the existing `product_count` and `sellers_summary` fields continue to be returned alongside `product_previews`. No changes needed to the controller (`api/controllers/auctionController.js`) since it passes through the service result.

## 2. Frontend — AuctionImageMosaic Component

- [x] 2.1 Create `client/components/AuctionImageMosaic.js` — a component that receives a `products` array (with `basename`, `product_type`) and `productCount` (total). Renders: single image if 1 product; 2×2 grid for 2-4 products (gray `bg-gray-200` placeholders for empty cells); 2×2 grid with "+X" rounded label in 4th cell for 5+ products. Uses `getArtImageUrl` / `getOthersImageUrl` for image URLs. The container must be `aspect-square` with `rounded-md overflow-hidden`.

## 3. Frontend — Subasta Badge Component

- [x] 3.1 Create `client/components/AuctionBadge.js` — a pill badge component rendering "Subasta" text with a pulsing red dot. Use Tailwind's `animate-ping` on an absolutely-positioned red circle element to create the pulse effect, with a solid red dot underneath. Badge has `rounded-full` corners, `absolute top-2 left-2` positioning (relative to parent), and a semi-transparent white or dark background for contrast.

## 4. Frontend — AuctionGridItem Component

- [x] 4.1 Create `client/components/AuctionGridItem.js` — a grid element component that composes `AuctionImageMosaic` and `AuctionBadge`. Receives a full auction object (with `product_previews`, `product_count`, `sellers_summary`). Renders: image area (with mosaic + badge overlay), text area below. The entire element links to `/eventos/{auction.id}`.
- [x] 4.2 Implement single-product text display in `AuctionGridItem`: show seller name (small gray text), product title (bold), "Precio de salida: €X.XX" (gray), "Precio actual: €X.XX" (primary).
- [x] 4.3 Implement multi-product text display in `AuctionGridItem`: show aggregated author ("Name y X más" or just the name if single seller), auction name as title (bold), and "X items" instead of prices.

## 5. Frontend — Eventos Page Refactor

- [x] 5.1 Refactor `client/app/eventos/page.js` — replace the current auction card list (`rounded-lg border` cards with text-only content) with a grid container using `grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4`, rendering `AuctionGridItem` for each auction. Keep the sidebar `AuctionCalendar`, date filtering logic, month navigation, and all existing state management unchanged.
- [x] 5.2 Remove unused card-specific code and imports from `client/app/eventos/page.js` (status label map, seller badge rendering, date formatting helpers only used by the old cards — verify before removing).

## 6. Verification

- [x] 6.1 Test the `/eventos` page in the browser across viewports: verify 2-col mobile grid, 4-col desktop grid, calendar sidebar behavior, date filtering.
- [x] 6.2 Test auction grid elements with varying product counts (0, 1, 2, 3, 4, 5+): verify image mosaic rendering, "+X" label, conditional text (author aggregation, price vs item count).
- [x] 6.3 Verify "Subasta" badge renders with pulsing red dot animation and is visible over both light and dark images.
