## ADDED Requirements

### Requirement: Client-side aspect ratio detection for detail images
The product image carousel on the art and store detail pages SHALL determine each image's aspect ratio in the browser, using the natural width and height available when the image finishes loading. An image SHALL be considered square when `|naturalWidth / naturalHeight − 1| <= 0.02`; otherwise it is non-square (vertical when height > width, horizontal when width > height). While an image's ratio is not yet known, it SHALL be treated as square (no indicator, no lightbox trigger).

#### Scenario: Non-square image loads in the carousel
- **WHEN** the currently visible carousel image finishes loading and its ratio deviates from 1:1 by more than 2%
- **THEN** the image is classified as non-square (vertical or horizontal according to its dimensions)

#### Scenario: Square image loads in the carousel
- **WHEN** the currently visible carousel image finishes loading and its ratio is within 2% of 1:1
- **THEN** the image is classified as square and no cropped-image indicator is shown

### Requirement: "Ver imagen completa" pill on cropped detail images
When the currently visible image in the detail carousel is non-square, the carousel SHALL overlay a pill at the top-right corner of the image containing an orientation icon followed by the text "Ver imagen completa". The icon SHALL be a small rectangle outline whose orientation matches the image (portrait rectangle for vertical images, landscape rectangle for horizontal images) and SHALL be hidden from assistive technology (`aria-hidden`). The pill SHALL NOT be rendered when the visible image is square or its ratio is unknown. The product grid SHALL NOT show this pill.

#### Scenario: Pill shown for a vertical image
- **WHEN** the visible carousel image is vertical (non-square)
- **THEN** a pill appears at the top-right of the image with a portrait-oriented rectangle icon and the text "Ver imagen completa"

#### Scenario: Pill hidden for a square image
- **WHEN** the visible carousel image is square
- **THEN** no pill is rendered over the image

#### Scenario: Pill updates while navigating the carousel
- **WHEN** the user navigates the carousel from a non-square image to a square one (or vice versa)
- **THEN** the pill visibility updates to reflect the newly visible image

#### Scenario: Grid unchanged
- **WHEN** products render in the gallery or store grid
- **THEN** images keep the existing cropped (`object-cover`) presentation with no pill and no lightbox trigger

### Requirement: Lightbox opens from cropped detail images
When the visible carousel image is non-square, the image area SHALL show `cursor-pointer` and clicking it (or the pill) SHALL open a full-image lightbox modal. When the visible image is square, clicking the image SHALL NOT open the lightbox and no pointer cursor SHALL be applied.

#### Scenario: Click on a cropped image opens the lightbox
- **WHEN** the user clicks a non-square visible image on the detail page
- **THEN** the lightbox modal opens showing that image

#### Scenario: Click on a square image does nothing
- **WHEN** the user clicks a square visible image on the detail page
- **THEN** no lightbox opens

### Requirement: Lightbox displays the full uncropped image
The lightbox SHALL render as a modal dialog with a semi-transparent black backdrop that darkens the page, and SHALL display the current image complete and uncropped, preserving its aspect ratio within the viewport. The dialog panel SHALL be sized to the image's exact rendered box (its aspect ratio fitted into the viewport limits), so that every control overlays the image itself and any click outside the visible image counts as an outside click. A close button ("X") SHALL be positioned at the top-right corner INSIDE the image. The lightbox SHALL close when the user clicks anywhere outside the visible image (the darkened area), clicks the close button, or presses Escape. All accessible labels SHALL be in Spanish (es-ES).

#### Scenario: Full image visible in the lightbox
- **WHEN** the lightbox is open for a vertical or horizontal image
- **THEN** the entire image is visible without cropping, letterboxed against the darkened backdrop

#### Scenario: Close via click outside the image
- **WHEN** the user clicks the darkened area at any point outside the visible image, however close to its edge
- **THEN** the lightbox closes and the detail page state is preserved

#### Scenario: Close via X button
- **WHEN** the user clicks the "X" button at the top-right
- **THEN** the lightbox closes

#### Scenario: Close via Escape key
- **WHEN** the user presses the Escape key while the lightbox is open
- **THEN** the lightbox closes

### Requirement: Lightbox navigation across product images
When the product has more than one image, the lightbox SHALL show previous/next arrow buttons using the same visual design as the existing detail carousel arrows (circular, semi-transparent white background), positioned INSIDE the image at its left and right edges. Navigation SHALL be circular, SHALL cover all of the product's images (including square ones), and SHALL start at the image that was visible in the carousel when the lightbox opened. Navigating inside the lightbox SHALL NOT change the carousel's visible image. When the product has a single image, no arrows SHALL be rendered.

#### Scenario: Arrows shown for multi-image product
- **WHEN** the lightbox is open for a product with two or more images
- **THEN** previous and next arrows are shown with the same styling as the carousel arrows, and clicking them cycles through all product images

#### Scenario: No arrows for single-image product
- **WHEN** the lightbox is open for a product with exactly one image
- **THEN** no navigation arrows are rendered

#### Scenario: Lightbox opens at the current carousel image
- **WHEN** the user opens the lightbox while the carousel shows the third image
- **THEN** the lightbox initially displays that third image
