## Why

The Next.js `<Image>` component provides automatic image optimization (lazy loading, WebP/AVIF conversion, responsive sizing, built-in LCP improvements) that is entirely absent when using plain `<img>` tags. The frontend currently has ~35+ `<img>` occurrences across pages and components, missing these performance gains on an image-heavy art gallery where visual quality and page speed are critical.

## What Changes

- Replace all `<img>` elements with Next.js `<Image>` in all client pages and components
- Add `import Image from 'next/image'` to every affected file
- Apply correct `width`/`height` props (or `fill` layout) to each image based on its use case
- Ensure `next.config.js` remote patterns continue to cover all image sources (already configured)
- Remove any redundant `<img>` usage that is already partially migrated (e.g., `ShoppingCartDrawer.js` imports `Image` but still uses `<img>`)

## Capabilities

### New Capabilities

- `nextjs-image-usage`: Standardised usage of Next.js `<Image>` component across all pages and components — defines the rules, prop requirements, and migration patterns.

### Modified Capabilities

- `auction-grid-display`: The grid item image rendering changes from `<img>` to `<Image>` (implementation detail, no requirement change — no spec update needed).

## Impact

- **Files affected (~18 files):** `components/` (ShoppingCartDrawer, AuthorModal, DrawParticipationModal, EventBadge, AuctionImageMosaic, DrawGridItem, ProductGrid, Navbar, DrawHowWorksModal, AuctionGridItem), `app/` pages in seller/, admin/, galeria/, tienda/, eventos/, live/, pedido/, autores/, home
- **No API or backend changes**
- **No new dependencies** (next/image is built into Next.js)
- **`next.config.js`** already has `remotePatterns: [{ protocol: 'https', hostname: '**' }]` — no changes needed
- **Risk:** Low — purely cosmetic/rendering change; images already load correctly, `<Image>` adds optimisation on top
