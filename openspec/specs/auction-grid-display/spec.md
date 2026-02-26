### Requirement: Auction list grid layout
The `/eventos` page SHALL display auctions in a responsive image-centric grid layout matching the `ProductGrid` visual pattern. The grid SHALL use 2 columns on mobile and 4 columns on desktop (`lg` breakpoint). The `AuctionCalendar` sidebar and date filtering behavior SHALL remain unchanged.

#### Scenario: Desktop grid rendering
- **WHEN** the user views the `/eventos` page on a desktop viewport (≥1024px)
- **THEN** the page displays a sidebar with `AuctionCalendar` on the left and a 4-column grid of auction elements on the right

#### Scenario: Mobile grid rendering
- **WHEN** the user views the `/eventos` page on a mobile viewport (<1024px)
- **THEN** the page displays the calendar above the content area, followed by a 2-column grid of auction elements

#### Scenario: No auctions for selected date
- **WHEN** the user selects a date with no auctions
- **THEN** an empty state message SHALL be displayed (existing behavior preserved)

---

### Requirement: Single-product auction image display
When an auction has exactly one product, the grid element SHALL display the product image as a single `aspect-square` image covering the full image area.

#### Scenario: Single product image
- **WHEN** an auction has 1 product
- **THEN** the grid element image area shows the product image at full size with `aspect-square` and `object-cover`

---

### Requirement: Multi-product 2×2 image mosaic
When an auction has more than one product, the grid element SHALL display a 2×2 image mosaic inside the image area following specific fill rules.

#### Scenario: Two products
- **WHEN** an auction has 2 products
- **THEN** the mosaic shows the 2 product images in the top-left and top-right cells, and the bottom-left and bottom-right cells are filled with a gray placeholder (`bg-gray-200`)

#### Scenario: Three products
- **WHEN** an auction has 3 products
- **THEN** the mosaic shows 3 product images in the top-left, top-right, and bottom-left cells, and the bottom-right cell is filled with a gray placeholder

#### Scenario: Four products
- **WHEN** an auction has 4 products
- **THEN** the mosaic shows all 4 product images in the 2×2 grid

#### Scenario: Five or more products
- **WHEN** an auction has 5 or more products
- **THEN** the mosaic shows the first 3 product images in the top-left, top-right, and bottom-left cells, and the bottom-right cell displays a gray background with a fully-rounded "+X" label where X is the number of remaining products not shown (total product count minus 3)

---

### Requirement: "Subasta" badge with pulsing dot
Each auction grid element SHALL display a "Subasta" pill badge positioned at the upper-left corner of the image area. The badge SHALL contain a pulsing red dot animation followed by the text "Subasta".

#### Scenario: Badge rendering
- **WHEN** an auction grid element is rendered
- **THEN** a pill-shaped badge with rounded corners appears at the upper-left corner of the image area, containing a red pulsing dot (scale+fade animation) and the label "Subasta"

#### Scenario: Badge visual style
- **WHEN** the badge is visible
- **THEN** the red dot continuously animates with a ping/pulse effect (expanding and fading out), and the badge has a semi-transparent or solid background to ensure readability over images

---

### Requirement: Single-product auction text display
When an auction has exactly one product, the grid element text area SHALL display the author name, product title, starting price, and current price.

#### Scenario: Single product text content
- **WHEN** an auction has 1 product
- **THEN** the text area below the image shows: the author/seller name (gray, small text), the product title (bold, linked to auction detail), the starting price labeled "Precio de salida" (gray text), and the current price labeled "Precio actual" (primary text)

---

### Requirement: Multi-product auction text display
When an auction has more than one product, the grid element text area SHALL display an aggregated author and item count instead of individual product details.

#### Scenario: Multi-product author display
- **WHEN** an auction has more than 1 product
- **THEN** the author line shows the first author's name followed by "y [X] más" where X is the count of remaining distinct authors (e.g., "Miguel García y 2 más")

#### Scenario: Multi-product author with single seller
- **WHEN** an auction has more than 1 product but all from the same seller
- **THEN** the author line shows only that seller's name without the "y X más" suffix

#### Scenario: Multi-product item count display
- **WHEN** an auction has more than 1 product
- **THEN** instead of price information, the text area shows the total product count as "X items" (e.g., "3 items")

---

### Requirement: Auction list API product preview data
The `GET /api/auctions` list endpoint (date range query) SHALL return product preview data for each auction, including the first 4 products' image basenames, product types, seller names, and pricing information.

#### Scenario: API response with product previews
- **WHEN** the frontend requests `GET /api/auctions?from=...&to=...`
- **THEN** each auction object in the response SHALL include a `product_previews` array containing up to 4 products, each with: `basename`, `name`, `product_type` (`'art'` | `'other'`), `seller_name`, `start_price`, and `current_price`, ordered by position

#### Scenario: Auction with no products
- **WHEN** an auction has 0 products
- **THEN** the `product_previews` array SHALL be empty (`[]`)

#### Scenario: Auction with more than 4 products
- **WHEN** an auction has more than 4 products
- **THEN** the `product_previews` array SHALL contain only the first 4 products (ordered by position), and the existing `product_count` field provides the total count

---

### Requirement: Grid element links to auction detail
Each auction grid element SHALL be clickable and navigate to the auction detail page.

#### Scenario: Clicking an auction grid element
- **WHEN** the user clicks on an auction grid element
- **THEN** the browser navigates to `/eventos/{auction_id}` (the auction detail page)
