## Why

The "Eventos" section currently only supports auctions. We need to introduce **Draws** (Sorteos) as a second event type so that the platform can raffle products (art or others) to participants, expanding the engagement model beyond competitive bidding. Draws and auctions will coexist in the same Eventos grid, each with distinct user flows and visual treatment.

## What Changes

- **New database tables**: `draws`, `draw_participations`, `draw_buyers`, `draw_authorised_payment_data` — mirroring the auction table structure but tailored for single-product raffles with participation caps.
- **New backend layer**: Draw service, controllers (public + admin), routes, Zod validators, and email templates — following the exact patterns established by auctions.
- **New draw detail page**: Product-centric layout (similar to art/others detail pages) showing product info, units available, participant count, max participations, and an "Inscribirse en el sorteo" button that opens a multi-step participation modal.
- **New participation modal**: Similar to BidModal but adapted for draws — buyer registration, delivery/invoicing address, payment authorization (0 EUR via Stripe SetupIntent), and draw entry confirmation (showing price, image, confirm button).
- **Draw lifecycle automation**: Scheduler for transitioning draws through statuses (draft → scheduled → active → finished), with automated winner selection at draw end.
- **Draw-specific emails**: New email templates for draw entry confirmation and winner notification, based on existing auction email templates.
- **Mixed Eventos grid**: The `/eventos` page grid will display both auctions and draws. Draws show a "Sorteo" badge with a non-pulsing black dot (vs. auction's pulsing red dot), a single product image, author name, title, and price.
- **Draw admin pages**: Admin CRUD for managing draws (create, edit, start, cancel), mirroring the auction admin pages.

## Capabilities

### New Capabilities
- `draw-management`: Database schema, CRUD service layer, admin API endpoints, and Zod validators for draws and related tables (draw_buyers, draw_participations, draw_authorised_payment_data).
- `draw-participation`: User-facing participation flow — buyer registration, multi-step modal, payment authorization (0 EUR SetupIntent), entry confirmation, and uniqueness enforcement (email + IP).
- `draw-detail-page`: Draw detail page layout (product-centric, mirroring art/others detail pages), displaying product info, draw metadata (units, max participations, current participants), and the "Inscribirse en el sorteo" entry point.
- `draw-lifecycle`: Automated draw lifecycle management — scheduler for status transitions, winner selection logic, post-draw payment processing, and email notifications (entry confirmation, winner notification).

### Modified Capabilities
- `auction-grid-display`: The Eventos grid now shows both auctions and draws. Draw grid elements use a "Sorteo" badge with a non-pulsing black dot, display a single product image (no mosaic), and show author name, title, and price. The API endpoint must return both event types.

## Impact

**Backend (api/):**
- `config/database.js` — 4+ new tables with indexes
- New files: `services/drawService.js`, `controllers/drawController.js`, `controllers/drawAdminController.js`, `routes/drawRoutes.js`, `routes/admin/drawRoutes.js`, `validators/drawSchemas.js`, `scheduler/drawScheduler.js`
- Modified: `services/emailService.js` (new draw email templates), `routes/admin/index.js` (mount draw admin routes)
- The existing auction list API or a new unified endpoint must return draws alongside auctions for the Eventos page

**Frontend (client/):**
- New pages: `app/eventos/sorteo/[id]/page.js` (draw detail)
- New components: `DrawDetail.js`, `DrawParticipationModal.js`, `DrawBadge.js`, `DrawGridItem.js`
- Modified: `app/eventos/page.js` (fetch and render both auctions and draws), `lib/api.js` (add `drawsAPI` object)
- New admin pages: `app/admin/sorteos/`

**No breaking changes** — auctions continue to work as-is. Draws are a purely additive feature.
