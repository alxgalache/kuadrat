## 1. Redirects

- [x] 1.1 Add permanent 301 redirects in `client/next.config.js` for `/galeria/mas` → `/tienda`, `/galeria/mas/:path*` → `/tienda/:path*`, `/subastas` → `/eventos`, `/subastas/:path*` → `/eventos/:path*`, `/espacios` → `/live`, `/espacios/:path*` → `/live/:path*`

## 2. App Router Directory Renames

- [x] 2.1 Rename `client/app/galeria/mas/` → `client/app/tienda/` (promote to top-level, preserving nested `p/[id]/` and `autor/[authorSlug]/` sub-routes)
- [x] 2.2 Rename `client/app/subastas/` → `client/app/eventos/` (preserving nested `[id]/` sub-route)
- [x] 2.3 Rename `client/app/espacios/` → `client/app/live/` (preserving nested `[slug]/` sub-route)

## 3. Navbar

- [x] 3.1 Update labels in `client/components/Navbar.js`: "Más" → "Tienda", "Subastas" → "Eventos", "Espacios" → "Live" (desktop + mobile, ~4 occurrences each for Subastas/Espacios)
- [x] 3.2 Update `href` values in `client/components/Navbar.js`: `/galeria/mas` → `/tienda`, `/subastas` → `/eventos`, `/espacios` → `/live`
- [x] 3.3 Simplify the `isNavActive()` helper in `client/components/Navbar.js`: remove the special-case branch for `/galeria/mas` (no longer needed at `/tienda`)

## 4. Internal Links in Client Files

- [x] 4.1 Grep `client/` for all occurrences of `/subastas`, `/espacios`, `/galeria/mas` (excluding `node_modules`, `.next`, admin routes) — list every file that needs updating
- [x] 4.2 Update all `<Link href>` and `router.push` references in non-Navbar client files to use `/tienda`, `/eventos`, `/live` (e.g. seller publish page, legal pages, FAQs, any breadcrumb or back-links)

## 5. SEO Metadata

- [x] 5.1 Update `client/app/sitemap.js` — replace hardcoded `/subastas`, `/espacios`, `/galeria/mas` entries with `/eventos`, `/live`, `/tienda`
- [x] 5.2 Update canonical URLs and `og:url` meta tags inside the renamed route pages (`tienda`, `eventos`, `live`) if they contain hardcoded old paths

## 6. Verification

- [ ] 6.1 Start the dev server and confirm `/tienda`, `/eventos`, `/live` each load the correct page
- [ ] 6.2 Confirm old paths `/galeria/mas`, `/subastas`, `/espacios` redirect (301) to the new paths
- [ ] 6.3 Confirm admin navbar links (`/admin/subastas`, `/admin/espacios`) are unchanged and still functional

- [x] 6.4 Grep `client/` one final time for residual references to `/subastas`, `/espacios`, `/galeria/mas` (excluding admin routes and redirects in next.config.js) — result should be empty
