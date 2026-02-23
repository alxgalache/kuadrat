## Why

The current navigation labels ("Más", "Subastas", "Espacios") do not accurately represent the sections they link to and may confuse end users. Renaming them to clearer, more intuitive names ("Tienda", "Eventos", "Live") improves discoverability and aligns the UI language with what users expect to find in each section.

## What Changes

- Rename navbar label **"Más"** → **"Tienda"** and update its client-side URL accordingly
- Rename navbar label **"Subastas"** → **"Eventos"** and update its client-side URL accordingly
- Rename navbar label **"Espacios"** → **"Live"** and update its client-side URL accordingly
- All backend API endpoints, database schema, admin zone, Socket.IO events, and LiveKit integration identifiers remain **unchanged**

## Capabilities

### New Capabilities
- `navigation-naming`: Display names and URL paths for the main navigation sections (Tienda, Eventos, Live) as seen by the end user in the web client

### Modified Capabilities
<!-- No existing specs to modify — openspec/specs/ is empty -->

## Impact

- `client/components/Navbar.js` — update label strings and `href` values for the three renamed items
- `client/app/subastas/` → rename directory to `client/app/eventos/` (Next.js App Router route)
- `client/app/espacios/` → rename directory to `client/app/live/`
- `client/app/galeria/mas/` (or equivalent) → move/rename to match the new "Tienda" URL path
- Any internal `<Link href="...">` or `router.push(...)` references to `/subastas`, `/espacios`, or `/galeria/mas` across client components must be updated to point to the new paths
- SEO metadata (sitemap, robots, og:url) in client pages may reference old paths — review for consistency
- No API routes, no DB schema, no admin routes, no Socket.IO event names, no LiveKit service code are affected
