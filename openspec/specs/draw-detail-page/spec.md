## ADDED Requirements

### Requirement: Draw detail page route
The draw detail page SHALL be accessible at `/eventos/sorteo/[id]` where `[id]` is the draw UUID. The page SHALL use Next.js App Router with server-side metadata generation (SEO title, description, OpenGraph) and a client-side detail component.

#### Scenario: Valid draw ID renders detail page
- **WHEN** a user navigates to `/eventos/sorteo/{valid-draw-id}`
- **THEN** the page SHALL render the draw detail with product information, draw metadata, and the entry button

#### Scenario: Invalid draw ID returns 404
- **WHEN** a user navigates to `/eventos/sorteo/{invalid-id}`
- **THEN** the page SHALL return a 404 not found response

#### Scenario: SEO metadata is generated server-side
- **WHEN** the draw detail page is requested
- **THEN** the page SHALL include metadata with the draw name as title, product description, and OpenGraph tags with the product image

---

### Requirement: Draw detail page layout
The draw detail page SHALL use the same two-column layout as art/others product detail pages: product image on the left, details on the right (stacked on mobile). The layout SHALL use the existing Tailwind grid pattern: `lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8`.

#### Scenario: Desktop layout renders two columns
- **WHEN** the draw detail page is viewed on a desktop viewport (>=1024px)
- **THEN** the page SHALL display the product image in the left column and draw details in the right column

#### Scenario: Mobile layout stacks vertically
- **WHEN** the draw detail page is viewed on a mobile viewport (<1024px)
- **THEN** the page SHALL display the product image above the draw details in a single column

---

### Requirement: Draw detail product information display
The draw detail page SHALL display the product's image (using the appropriate image URL helper based on product_type), the product name as the page heading, the seller/author name, and the product description (if available).

#### Scenario: Art product image displayed
- **WHEN** the draw references a product with `product_type: 'art'`
- **THEN** the image SHALL be loaded using `getArtImageUrl(basename)` and displayed with `object-contain` and rounded corners on a gray background

#### Scenario: Others product image displayed
- **WHEN** the draw references a product with `product_type: 'other'`
- **THEN** the image SHALL be loaded using `getOthersImageUrl(basename)` and displayed with the same styling

#### Scenario: Author name is clickable
- **WHEN** the author/seller name is displayed
- **THEN** it SHALL be styled as a clickable element consistent with the art/others detail page pattern

---

### Requirement: Draw metadata display
The draw detail page SHALL display draw-specific metadata above the entry button: the draw price (formatted as EUR), units available, maximum number of participations, and current number of participants. The metadata SHALL be clearly labeled in Spanish.

#### Scenario: All draw metadata fields displayed
- **WHEN** the draw detail page is rendered for a draw with units=3, max_participations=100, and 42 current participations
- **THEN** the page SHALL display: the price (e.g., "€150.00"), "Unidades: 3", "Plazas maximas: 100", and "Participantes actuales: 42"

#### Scenario: Draw at capacity shows full indicator
- **WHEN** the current participation count equals max_participations
- **THEN** the metadata SHALL indicate the draw is full (e.g., "Participantes: 100/100 - Completo")

---

### Requirement: Draw entry button
The draw detail page SHALL display an "Inscribirse en el sorteo" button that opens the `DrawParticipationModal`. The button SHALL be disabled when the draw is not active or has reached max_participations.

#### Scenario: Active draw with capacity shows enabled button
- **WHEN** the draw status is 'active' and current participants < max_participations
- **THEN** the page SHALL display an enabled black button with text "Inscribirse en el sorteo"

#### Scenario: Full draw shows disabled button
- **WHEN** the draw has reached max_participations
- **THEN** the button SHALL be disabled with text "Sorteo completo"

#### Scenario: Non-active draw shows disabled button
- **WHEN** the draw status is 'finished' or 'cancelled'
- **THEN** the button SHALL be disabled with text "Sorteo finalizado" or "Sorteo cancelado" respectively

#### Scenario: Button click opens participation modal
- **WHEN** the user clicks the enabled "Inscribirse en el sorteo" button
- **THEN** the `DrawParticipationModal` SHALL open with the draw and product data

---

### Requirement: Draw detail page date display
The draw detail page SHALL display the draw's start and end dates/times, formatted in Spanish locale.

#### Scenario: Draw dates displayed
- **WHEN** the draw detail page is rendered
- **THEN** the start and end datetimes SHALL be displayed in a human-readable format (e.g., "Del 15 de marzo 2026 al 20 de marzo 2026")
