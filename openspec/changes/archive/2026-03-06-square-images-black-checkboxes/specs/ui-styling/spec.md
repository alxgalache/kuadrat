## ADDED Requirements

### Requirement: Product detail images display in 1:1 aspect ratio
Product detail pages for art (`/galeria/p/[id]`) and shop (`/tienda/p/[id]`) products SHALL display the product image in a square (1:1) aspect ratio container. The image SHALL be cropped to fill the container using `object-cover`, trimming excess content on the shorter axis.

#### Scenario: Landscape image displayed as square
- **WHEN** a product has a landscape (wider than tall) image
- **THEN** the image is displayed in a 1:1 square container with the sides cropped

#### Scenario: Portrait image displayed as square
- **WHEN** a product has a portrait (taller than wide) image
- **THEN** the image is displayed in a 1:1 square container with the top/bottom cropped

#### Scenario: Consistent with event detail page
- **WHEN** comparing the image container markup in ArtProductDetail, OthersProductDetail, and EventDetail
- **THEN** all three use the same pattern: `aspect-square` container with `overflow-hidden`, and `fill` + `object-cover` on the Image component

### Requirement: Seller publish checkboxes use black accent color
Checkbox inputs on the seller publish page (`/seller/publish`) SHALL display with a black accent color when checked, matching the monochrome design language.

#### Scenario: Checked checkbox appears black
- **WHEN** a seller checks the "forAuction", "aiGenerated", or "hasVariations" checkbox
- **THEN** the checkbox fill color is black (not the browser default blue)
