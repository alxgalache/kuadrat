## ADDED Requirements

### Requirement: Client-side aspect ratio detection for detail images
The product image carousel on the art and store detail pages SHALL determine each image's aspect ratio in the browser, using the natural width and height available when the image finishes loading, and SHALL make those ratios available to the lightbox so it can size its panel to the image's box before its own load event. Ratio detection is presentational only and SHALL NOT gate whether the lightbox can be opened.

#### Scenario: Ratio recorded when a carousel image loads
- **WHEN** a carousel image finishes loading
- **THEN** its `naturalWidth / naturalHeight` ratio is recorded and passed to the lightbox as a known ratio

### Requirement: "Ver imagen completa" pill on detail images
For every product image shown in the detail carousel, the carousel SHALL overlay a pill at the top-right corner of the image containing a magnifying-glass (zoom) icon followed by the text "Ver imagen completa". The icon SHALL be hidden from assistive technology (`aria-hidden`). The pill SHALL be shown for all images regardless of aspect ratio. The product grid SHALL NOT show this pill.

#### Scenario: Pill shown for any detail image
- **WHEN** any image is visible in the detail carousel (square, vertical or horizontal)
- **THEN** a pill appears at the top-right of the image with a magnifying-glass icon and the text "Ver imagen completa"

#### Scenario: Grid unchanged
- **WHEN** products render in the gallery or store grid
- **THEN** images keep the existing cropped (`object-cover`) presentation with no pill and no lightbox trigger

### Requirement: Lightbox opens from any detail image
Clicking the visible carousel image (or the pill) SHALL open a full-image lightbox modal for any image, regardless of its aspect ratio. The image area SHALL show `cursor-pointer` whenever an image is present.

#### Scenario: Click on a detail image opens the lightbox
- **WHEN** the user clicks the visible image on the detail page
- **THEN** the lightbox modal opens showing that image

#### Scenario: Lightbox opens for a square image
- **WHEN** the visible image is square and the user clicks it
- **THEN** the lightbox opens showing that image

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

### Requirement: Mouse-wheel zoom inside the lightbox
The lightbox SHALL let the user zoom into the current image with the mouse wheel while the pointer is over the image. Zooming SHALL affect only the image, never the surrounding page or the darkened backdrop, which SHALL remain visually unchanged. The image SHALL be clipped to its framed box (the same rectangle as the un-zoomed image) so that zooming enlarges detail within that frame; the parts of the enlarged image that fall outside the frame SHALL NOT be shown, and the close-on-outside-click behavior and corner controls SHALL be preserved. The wheel listener SHALL be non-passive so the browser's default page scroll/zoom is prevented while the pointer is over the image. Zoom SHALL be bounded between fit (1x, no zoom) and a maximum factor. While zoomed in, moving the cursor over the image SHALL pan the visible section to follow the pointer (store-style magnifier), with panning bounded so no empty area is exposed. The cursor over the image SHALL be the default pointer (no zoom/grab cursor). The zoom SHALL reset to the initial (un-zoomed) view when the pointer leaves the image, and also when the lightbox opens/closes or the visible image changes. Touch pinch-zoom is out of scope.

#### Scenario: Wheel zooms only the image
- **WHEN** the user scrolls the mouse wheel while the pointer is over the open lightbox image
- **THEN** the image scales up/down within its frame, the underlying page does not scroll or zoom, and the darkened backdrop is unchanged

#### Scenario: Zoom stays within the image frame
- **WHEN** the user zooms in
- **THEN** the enlarged image is clipped to its framed box (the overflow is hidden), the close button and navigation arrows remain at the box corners, and clicking outside the box still closes the lightbox

#### Scenario: Pan follows the cursor while zoomed
- **WHEN** the image is zoomed in and the user moves the cursor across it
- **THEN** the visible section pans to follow the pointer, bounded so no empty area is exposed

#### Scenario: Default cursor over the image
- **WHEN** the pointer is over the lightbox image
- **THEN** the default mouse cursor is shown (not a magnifier/zoom or grab cursor)

#### Scenario: Zoom resets when the cursor leaves the image
- **WHEN** the cursor leaves the image area after zooming
- **THEN** the zoom returns to the initial (un-zoomed) view

#### Scenario: Zoom resets on navigation or close
- **WHEN** the user navigates to another image or closes the lightbox after zooming
- **THEN** the zoom resets to fit (1x, no pan)

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
