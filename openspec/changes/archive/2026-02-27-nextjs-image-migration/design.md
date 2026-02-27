## Context

The Kuadrat frontend is an image-heavy art gallery. Currently ~35+ `<img>` elements appear across 18 files in `client/app/` and `client/components/`. Only `ShoppingCartDrawer.js` imports `next/image` but still uses a plain `<img>` in its JSX. `next.config.js` already has `remotePatterns: [{ protocol: 'https', hostname: '**' }]`, covering all remote image sources.

Next.js `<Image>` requires either explicit `width`/`height` or a `fill` prop. The choice between these depends on context:
- **Fixed-size images** (icons, thumbnails with known px): use explicit `width` + `height`
- **Responsive/fluid images** that stretch to fill a parent container: use `fill` + `sizes` + `position: relative` on the parent

## Goals / Non-Goals

**Goals:**
- Replace every `<img>` element in `client/` with `<Image>` from `next/image`
- Apply appropriate sizing strategy (explicit dimensions vs `fill`) per use case
- Ensure all parent containers of `fill` images have `position: relative` and a defined height
- Maintain identical visual output — no layout shifts or style regressions

**Non-Goals:**
- Changing image sources, API responses, or upload logic
- Adding new image optimisation beyond what `next/image` provides out of the box
- Modifying `next.config.js` remote patterns (already correct)
- Improving or restructuring any surrounding component logic

## Decisions

### 1. `fill` vs explicit `width`/`height`

**Decision:** Use `fill` for images inside containers whose size is defined by CSS (Tailwind `aspect-*`, `h-*`, `w-*` classes), and explicit dimensions only for icons with a known fixed pixel size.

**Rationale:** Most images in the app live inside flex/grid cells or aspect-ratio containers where the parent dictates size. Providing explicit `width`/`height` here would either be wrong at different breakpoints or require complex calculations. `fill` is the idiomatic approach and matches the existing CSS layout model.

**Alternatives considered:**
- Always use explicit dimensions — rejected because product images are dynamic and displayed at varying sizes across breakpoints.
- Use `layout="responsive"` (Next.js 12 API) — rejected; Next.js 13+ dropped this in favour of `fill` + CSS.

### 2. `sizes` attribute

**Decision:** Provide a `sizes` hint for all `fill` images. Use a sensible default (`"100vw"` for full-width images, specific breakpoint values for grid items) to help the browser select the optimal source size.

**Rationale:** Without `sizes`, the browser assumes the image is full-viewport-width and downloads unnecessarily large files on mobile.

### 3. Migration approach — file-by-file, no abstraction

**Decision:** Migrate each file individually without introducing a shared `<AppImage>` wrapper component.

**Rationale:** A wrapper adds indirection with no benefit for this codebase — the patterns are already well-defined and the number of call sites is manageable. Over-engineering a one-time migration is unnecessary. Each file gets a direct import from `next/image`.

### 4. `priority` prop for above-the-fold images

**Decision:** Add `priority` to hero/primary images on pages where the first visible image is the LCP element (home page hero, product detail primary image, event/auction detail hero).

**Rationale:** Without `priority`, Next.js lazy-loads all images including LCP images, which degrades Core Web Vitals scores.

## Risks / Trade-offs

- **Parent containers without defined height** → `fill` images will collapse to zero height. Mitigation: verify each container has explicit height or aspect-ratio CSS before migrating; add `relative` + height class where missing.
- **`<img>` inside `className="size-full"` containers** → these already set `width: 100%; height: 100%`. With `fill`, the parent must be `position: relative`. Mitigation: add `relative` class to parent `<div>` where absent.
- **Local static assets** (e.g., `/brand/icons/dice.png`) → `<Image>` works for local public assets. Just provide `width` and `height` matching the rendered size. No config change needed.
- **Dynamic `src` values that may be null/undefined** → `<Image>` will throw on falsy `src`. Mitigation: keep the same null-guards that exist on `<img>` (e.g., conditional rendering before the tag).

## Migration Plan

1. **Audit**: Compile the full list of `<img>` occurrences per file (done in proposal — ~35 occurrences, 18 files).
2. **Migrate components first** (shared components used across many pages): AuctionImageMosaic, DrawGridItem, ProductGrid, Navbar, EventBadge, DrawHowWorksModal, AuctionGridItem, AuthorModal, DrawParticipationModal, ShoppingCartDrawer.
3. **Migrate pages** (app router files): seller, admin, galeria, tienda, eventos, live, pedido, autores, home.
4. **Visual check**: Confirm no layout collapse or broken images in development.
5. **No rollback strategy needed** — change is reversible by reverting files; no data or infra changes.
