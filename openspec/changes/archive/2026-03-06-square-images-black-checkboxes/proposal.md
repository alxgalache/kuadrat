## Why

Product detail pages in the gallery (`/galeria/p/[id]`) and shop (`/tienda/p/[id]`) display images at their original aspect ratio, causing inconsistent page layouts depending on whether the uploaded photo is portrait or landscape. The event detail page (`/live/[slug]`) already enforces a 1:1 square crop — the product pages should match for visual consistency. Additionally, checkboxes on the seller publish page appear with the browser's default blue color instead of black, breaking the monochrome design language used elsewhere in the app.

## What Changes

- **Square product images**: Change the image container in `ArtProductDetail.js` and `OthersProductDetail.js` to use a 1:1 aspect ratio with `object-cover` cropping, matching the pattern already used in `EventDetail.js` (`aspect-square` + `overflow-hidden` + `relative` container, `fill` + `object-cover` on the Next.js `Image` component).
- **Black checkboxes**: Add `accent-black` to the three checkbox inputs in `client/app/seller/publish/page.js` (forAuction, aiGenerated, hasVariations) to override the browser's default blue checked state. This matches the pattern already used in `client/app/orders/page.js` and `client/app/orders/[id]/page.js`.

## Capabilities

### New Capabilities

_(none — these are styling adjustments to existing pages)_

### Modified Capabilities

_(none — no spec-level behavior changes, only CSS/styling tweaks)_

## Impact

- **Files changed**:
  - `client/app/galeria/p/[id]/ArtProductDetail.js` — image container + Image props
  - `client/app/tienda/p/[id]/OthersProductDetail.js` — image container + Image props
  - `client/app/seller/publish/page.js` — checkbox className on 3 inputs
- No API, database, or dependency changes.
