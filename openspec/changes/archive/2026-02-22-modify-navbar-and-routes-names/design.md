## Context

The client app currently has three public-facing sections with labels that will be renamed:

| Current label | Current URL | New label | New URL |
|---|---|---|---|
| Más | `/galeria/mas` | Tienda | `/tienda` |
| Subastas | `/subastas` | Eventos | `/eventos` |
| Espacios | `/espacios` | Live | `/live` |

The Navbar component (`client/components/Navbar.js`) renders both a desktop nav and a mobile nav. It contains:
- An `isNavActive()` helper with hardcoded path checks for `/galeria/mas` and `/galeria`
- Public-facing links to `/subastas` and `/espacios` (desktop + mobile, ~4 occurrences each)
- Admin dropdown links to `/admin/subastas` and `/admin/espacios` — **these must not change**

The App Router directory structure has:
- `client/app/galeria/mas/` — with nested `p/[id]/` and `autor/[authorSlug]/` sub-routes
- `client/app/subastas/` — with `[id]/` sub-route
- `client/app/espacios/` — with `[slug]/` sub-route

Several other client files also contain `href` or `pathname` references to the old routes (sitemap, legal pages, seller publish page, FAQs).

## Goals / Non-Goals

**Goals:**
- Rename all end-user-visible labels in the Navbar to Tienda, Eventos, Live
- Rename the corresponding App Router directories so the public URLs match the new labels
- Update all internal `<Link href>`, `router.push`, and `pathname` comparisons in the client to use the new paths
- Add 301 redirects from old paths to new paths for SEO continuity

**Non-Goals:**
- Any changes to `api/` routes, controllers, services, or database schema
- Any changes to admin-facing routes (`/admin/subastas`, `/admin/espacios`) or their navbar links
- Any changes to Socket.IO event names, LiveKit integration identifiers, or Stripe references
- Internationalization or dynamic label configuration

## Decisions

### 1. Rename directories rather than using rewrites

**Decision:** Physically rename the App Router directories (`subastas → eventos`, `espacios → live`, `galeria/mas → tienda` promoted to top-level).

**Rationale:** Next.js App Router derives routes directly from the filesystem. Renaming directories is the canonical approach — no additional config or indirection needed. Using `rewrites` would hide the URL mismatch and add maintenance cost.

**Alternative considered:** `next.config.js` rewrites — rejected because it keeps the old directory names in place, creating confusion and making the code harder to understand long-term.

### 2. Promote `galeria/mas` to top-level `/tienda`

**Decision:** Move `client/app/galeria/mas/` to `client/app/tienda/` (top-level), changing the URL from `/galeria/mas` to `/tienda`.

**Rationale:** "Tienda" is a distinct section that logically belongs at the top level alongside `galeria`, `eventos`, and `live`. Keeping it nested under `/galeria/` would contradict the new brand naming. The `isNavActive` helper already has a special case for `/galeria/mas` that distinguishes it from `/galeria` — this becomes simpler at top level.

### 3. Add 301 redirects in `next.config.js`

**Decision:** Add permanent (308/301) redirects for the three old public paths:
- `/galeria/mas` → `/tienda`
- `/galeria/mas/:path*` → `/tienda/:path*`
- `/subastas` → `/eventos`
- `/subastas/:path*` → `/eventos/:path*`
- `/espacios` → `/live`
- `/espacios/:path*` → `/live/:path*`

**Rationale:** Existing bookmarks and any external links will break without redirects. The sitemap currently lists old URLs — even after updating it, search engine caches need to be signaled. 301 redirects are the standard solution and have zero runtime overhead in Next.js (handled at the framework level).

### 4. Admin navbar links stay unchanged

**Decision:** The admin dropdown links in the Navbar (`/admin/subastas`, `/admin/espacios`) and their display text are not modified.

**Rationale:** Admin zone is out of scope per the proposal. Changing admin-facing terminology would require coordination with admin users and is a separate concern.

## Risks / Trade-offs

- **Internal link sprawl** → Several files outside the Navbar reference old paths (sitemap.js, legal pages, FAQs, seller publish page). Missing even one creates a broken link. Mitigation: grep for all occurrences of `/subastas`, `/espacios`, `/galeria/mas` in `client/` before closing the task.

- **`isNavActive` logic** → The helper has a special case `if (href === '/galeria/mas')` that prevents the `/galeria` link from also lighting up. Moving to `/tienda` removes this special case — the logic simplifies. Mitigation: review the helper and remove the now-unnecessary branch.

- **Sitemap and SEO metadata** → `client/app/sitemap.js` generates the sitemap with hardcoded paths. Updating redirects alone is not enough; the sitemap must reference the new canonical URLs. Mitigation: update sitemap.js as part of the tasks.

## Migration Plan

1. Add redirects to `next.config.js` first (no user impact, safe to deploy alone)
2. Rename App Router directories
3. Update Navbar labels and hrefs
4. Update all other internal `<Link>` / `pathname` references in client files
5. Update sitemap.js
6. Smoke-test all three sections in dev; verify old URLs redirect correctly

No database migration or API changes required. Rollback: revert directory renames and remove redirects from config.

## Open Questions

- None — scope is fully defined and all decisions are made.
