## MODIFIED Requirements

### Requirement: Auction list grid layout
The `/eventos` page SHALL display both auctions and draws in a responsive image-centric grid layout matching the `ProductGrid` visual pattern. The grid SHALL use 2 columns on mobile and 4 columns on desktop (`lg` breakpoint). The `AuctionCalendar` sidebar and date filtering behavior SHALL remain unchanged but SHALL account for both event types when highlighting dates.

#### Scenario: Desktop grid rendering
- **WHEN** the user views the `/eventos` page on a desktop viewport (>=1024px)
- **THEN** the page displays a sidebar with `AuctionCalendar` on the left and a 4-column grid of event elements (auctions and draws intermixed) on the right

#### Scenario: Mobile grid rendering
- **WHEN** the user views the `/eventos` page on a mobile viewport (<1024px)
- **THEN** the page displays the calendar above the content area, followed by a 2-column grid of event elements

#### Scenario: No events for selected date
- **WHEN** the user selects a date with no auctions or draws
- **THEN** an empty state message SHALL be displayed

#### Scenario: Mixed events for selected date
- **WHEN** the user selects a date that has both auctions and draws
- **THEN** both event types SHALL appear in the grid, each rendered by its appropriate component (`AuctionGridItem` or `DrawGridItem`)

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

### Requirement: Auction list API product preview data
The `GET /api/auctions` list endpoint (date range query) SHALL return product preview data for each auction, including the first 4 products' image basenames, product types, seller names, and pricing information.

#### Scenario: API response with product previews
- **WHEN** the frontend requests `GET /api/auctions?from=...&to=...`
- **THEN** each auction object in the response SHALL include a `product_previews` array containing up to 4 products, each with: `basename`, `name`, `product_type` ('art' | 'other'), `seller_name`, `start_price`, and `current_price`, ordered by position

#### Scenario: Auction with no products
- **WHEN** an auction has 0 products
- **THEN** the `product_previews` array SHALL be empty (`[]`)

#### Scenario: Auction with more than 4 products
- **WHEN** an auction has more than 4 products
- **THEN** the `product_previews` array SHALL contain only the first 4 products (ordered by position), and the existing `product_count` field provides the total count

---

### Requirement: Grid element links to detail page
Each grid element SHALL be clickable and navigate to the appropriate detail page based on event type.

#### Scenario: Clicking an auction grid element
- **WHEN** the user clicks on an auction grid element
- **THEN** the browser navigates to `/eventos/{auction_id}` (the auction detail page)

#### Scenario: Clicking a draw grid element
- **WHEN** the user clicks on a draw grid element
- **THEN** the browser navigates to `/eventos/sorteo/{draw_id}` (the draw detail page)

## ADDED Requirements

### Requirement: "Sorteo" badge with non-pulsing black dot
Each draw grid element SHALL display a "Sorteo" pill badge positioned at the upper-left corner of the image area. The badge SHALL use the same visual structure as the auction badge but with a static (non-pulsing) black dot and the text "Sorteo".

#### Scenario: Draw badge rendering
- **WHEN** a draw grid element is rendered
- **THEN** a pill-shaped badge appears at the upper-left corner with a static black dot (no animation) and the label "Sorteo"

#### Scenario: Draw badge visual style
- **WHEN** the draw badge is visible
- **THEN** the black dot SHALL NOT animate (no ping/pulse effect), and the badge SHALL have the same background style and positioning as the auction badge

---

### Requirement: Draw grid element display
Each draw grid element SHALL display a single product image (full `aspect-square`), the author/seller name, product title, and draw price. Since draws have exactly one product, no mosaic or multi-product logic is needed.

#### Scenario: Draw grid element with art product
- **WHEN** a draw referencing an art product is rendered in the grid
- **THEN** the element SHALL display: the art product image (from `getArtImageUrl(basename)`), the seller name (gray small text), the product title (bold, linked to draw detail), and the draw price formatted as EUR

#### Scenario: Draw grid element with others product
- **WHEN** a draw referencing an others product is rendered in the grid
- **THEN** the element SHALL display: the others product image (from `getOthersImageUrl(basename)`), the seller name, the product title, and the draw price

---

### Requirement: Eventos page fetches both event types
The Eventos page SHALL fetch both auctions and draws for the selected month and merge them for display. Date filtering and calendar highlighting SHALL consider both event types.

#### Scenario: Page loads both auctions and draws
- **WHEN** the Eventos page loads or the calendar month changes
- **THEN** the page SHALL fetch `GET /api/auctions?from=...&to=...` and `GET /api/draws?from=...&to=...` in parallel and merge the results

#### Scenario: Calendar highlights dates with draws
- **WHEN** the calendar renders for a month that has draws but no auctions on certain dates
- **THEN** those dates SHALL still be highlighted as having events

#### Scenario: Date filter applies to both types
- **WHEN** the user selects a date
- **THEN** the grid SHALL show auctions AND draws whose date ranges overlap the selected date
