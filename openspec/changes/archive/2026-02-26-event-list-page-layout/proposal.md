## Why

The auctions list page (`/eventos`) currently shows text-only stacked cards with no product imagery, which is inconsistent with the visual-first approach used in the gallery (`/galeria`) and shop (`/tienda`). Since Kuadrat is an art marketplace where visuals are key, auction listings should showcase the artwork being auctioned using the same image-centric grid layout as the product pages.

## What Changes

- **Replace auction text cards with a product-style grid layout** on the `/eventos` page. Each auction will display as a grid element with image(s), title, author, and pricing information — matching the `ProductGrid` component style used in `/galeria` and `/tienda`.
- **Multi-product image handling**: Auctions with multiple products will show a 2×2 image grid inside the element's image area (2 products: top two cells filled; 3: one empty cell; 4: all filled; 5+: first 3 shown + a "+X" counter badge in the 4th cell).
- **Conditional text display**: Single-product auctions show author, title, start price, and current price. Multi-product auctions show aggregated author ("Miguel García y [x] más") and item count ("3 items") instead of pricing.
- **"Subasta" badge**: A rounded pill badge with a pulsing red dot animation, positioned at the upper-left corner of each grid element's image area.
- **Enrich the auctions list API** to include product preview data (images, authors, prices) so the grid can render without fetching each auction's detail individually.
- **Keep the calendar sidebar**: The `AuctionCalendar` component and its date filtering behavior remain unchanged.

## Capabilities

### New Capabilities
- `auction-grid-display`: Auction list grid layout with image handling (single/multi-product), conditional text, and "Subasta" badge with pulsing dot animation.

### Modified Capabilities
<!-- No existing spec requirements are changing -->

## Impact

- **Frontend**: `client/app/eventos/page.js` — major rewrite of the auction list rendering (replace card markup with grid). New component(s) for the auction grid element with 2×2 image logic and badge.
- **Backend**: `api/services/auctionService.js` and `api/controllers/auctionController.js` — enrich the `GET /api/auctions` list endpoint to include product preview fields (first N product basenames, first author name, start/current prices) so the frontend doesn't need to fetch each auction detail.
- **Components**: New `AuctionGridItem` component (or similar) handling image grid, badge, and conditional text. May reuse patterns from `ProductGrid.js`.
- **Styles**: New TailwindCSS classes for the pulsing dot animation (CSS keyframes via Tailwind config or inline styles).
