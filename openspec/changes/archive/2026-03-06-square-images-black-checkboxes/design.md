## Context

Two visual inconsistencies exist in the frontend:

1. **Product images**: `ArtProductDetail.js` and `OthersProductDetail.js` render product images at their natural aspect ratio using `width={0} height={0}` with `style={{ width: '100%', height: 'auto' }}` and `object-contain`. This causes varying page layouts. Meanwhile, `EventDetail.js` already uses a 1:1 container with `aspect-square overflow-hidden relative` and `fill` + `object-cover` on the Image — producing a consistent square layout.

2. **Checkbox color**: The publish page (`seller/publish/page.js`) uses `text-black focus:ring-black` on its checkboxes but is missing `accent-black`. Without `accent-color: black`, browsers render the checked state in their default blue. The orders pages already use the correct pattern: `accent-black text-black focus:ring-black`.

## Goals / Non-Goals

**Goals:**
- Make art and shop product detail images display in a uniform 1:1 square ratio
- Make publish page checkboxes render in black when checked

**Non-Goals:**
- Changing any other image displays (gallery grid, admin pages, etc.)
- Changing checkbox styling site-wide (only the publish page is affected)
- Changing image upload validation or processing

## Decisions

### 1. Use `aspect-square` + `object-cover` + `fill` pattern (same as EventDetail)

**Rationale**: This is already proven in the codebase (`EventDetail.js:361`). Using `fill` with `object-cover` lets the browser crop the image to fit the square container, centering the subject. The `overflow-hidden` on the container hides the cropped portions.

**Alternative considered**: Using `object-cover` with explicit `width`/`height` values — rejected because `fill` + container sizing is the idiomatic Next.js Image pattern for responsive containers.

**Changes per file**:
- Container div: add `aspect-square overflow-hidden relative`, keep `rounded-lg bg-gray-200`
- Image component: replace `width={0} height={0}` with `fill`, remove `style={{ width: '100%', height: 'auto' }}`, change `object-contain` to `object-cover`

### 2. Add `accent-black` to checkbox className

**Rationale**: The CSS `accent-color` property controls the native checkbox fill color. Tailwind's `accent-black` maps to `accent-color: #000`. This is already used on the orders pages and is the simplest fix.

**Alternative considered**: Custom checkbox component with SVG — over-engineered for this use case.

## Risks / Trade-offs

- **Image cropping**: Square crops will hide parts of non-square images. This is an accepted trade-off per the user's request, prioritizing layout consistency over showing the full image.
- **No risk of regression**: These are isolated CSS changes with no logic or state impact.
