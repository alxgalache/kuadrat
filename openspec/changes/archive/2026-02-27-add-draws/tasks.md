## 1. Database Schema

- [x] 1.1 Add `draws` table to `api/config/database.js` — columns: id (TEXT PK UUID), name, description, product_id (INTEGER), product_type (TEXT CHECK 'art'|'other'), price (REAL), units (INTEGER DEFAULT 1), max_participations (INTEGER), start_datetime, end_datetime, status (TEXT CHECK 'draft'|'scheduled'|'active'|'finished'|'cancelled' DEFAULT 'draft'), created_at. **[HIGH-RISK: shared DB schema file]**
- [x] 1.2 Add `draw_buyers` table to `api/config/database.js` — same structure as `auction_buyers` but with `draw_id` FK → draws(id) CASCADE. Columns: id, draw_id, first_name, last_name, email, bid_password, delivery address fields, invoicing address fields, created_at
- [x] 1.3 Add `draw_participations` table to `api/config/database.js` — columns: id (TEXT PK UUID), draw_id (FK → draws), draw_buyer_id (FK → draw_buyers), created_at
- [x] 1.4 Add `draw_authorised_payment_data` table to `api/config/database.js` — same structure as `auction_authorised_payment_data` but with draw_buyer_id FK → draw_buyers
- [x] 1.5 Add performance indexes to `api/config/database.js` — on draw_participations(draw_id), draw_participations(draw_buyer_id), draw_buyers(draw_id), draws(status)

## 2. Backend Validators

- [x] 2.1 Create `api/validators/drawSchemas.js` — Zod schemas for: createDrawSchema (name, product_id, product_type, price, units, max_participations, start_datetime, end_datetime required), updateDrawSchema (all optional), registerBuyerSchema, verifyBuyerSchema, setupPaymentSchema, confirmPaymentSchema, enterDrawSchema

## 3. Backend Service Layer

- [x] 3.1 Create `api/services/drawService.js` — CRUD functions: createDraw, updateDraw, deleteDraw, getDrawById (hydrated with product data via JOIN on art/others based on product_type), listDraws, getDrawsByDateRange (with product preview and participation count)
- [x] 3.2 Add buyer management to `api/services/drawService.js` — createOrGetDrawBuyer (generate 6-char password, return existing if same email+draw_id), verifyBidPassword, getDrawBuyer
- [x] 3.3 Add participation logic to `api/services/drawService.js` — enterDraw (check uniqueness by email per draw, check max_participations cap, check draw is active, check payment authorized, insert draw_participations record), getParticipationCount, hasParticipation
- [x] 3.4 Add payment data functions to `api/services/drawService.js` — getBuyerPaymentData, savePaymentData (mirror auction pattern)

## 4. Backend Controllers

- [x] 4.1 Create `api/controllers/drawController.js` — public endpoints: getDraws (date range query), getDrawDetail, registerBuyer, verifyBuyer, setupPayment (create Stripe SetupIntent via stripeService), confirmPayment, enterDraw (validate + create participation + send confirmation email). Use sendSuccess/sendCreated/ApiError patterns
- [x] 4.2 Create `api/controllers/drawAdminController.js` — admin endpoints: createDraw, listDraws, getDraw, updateDraw, deleteDraw, startDraw (scheduled → active), cancelDraw

## 5. Backend Routes

- [x] 5.1 Create `api/routes/drawRoutes.js` — public routes: GET /api/draws (cacheControl 30s), GET /api/draws/:id (cacheControl 10s), POST /api/draws/:id/register-buyer, POST /api/draws/:id/verify-buyer, POST /api/draws/:id/setup-payment, POST /api/draws/:id/confirm-payment, POST /api/draws/:id/enter. Apply validate() middleware with draw schemas
- [x] 5.2 Create `api/routes/admin/drawRoutes.js` — admin routes: POST, GET, GET/:id, PUT/:id, DELETE/:id, POST/:id/start, POST/:id/cancel
- [x] 5.3 Mount draw routes in `api/routes/admin/index.js` — add drawRoutes import and router.use('/draws', drawRoutes) **[HIGH-RISK: shared admin router]**
- [x] 5.4 Mount public draw routes in `api/server.js` — add drawRoutes import and app.use('/api/draws', drawRoutes) **[HIGH-RISK: shared server file]**

## 6. Email Templates

- [x] 6.1 Add `sendDrawEntryConfirmationEmail()` to `api/services/emailService.js` — HTML template in Spanish with logo, product image, participant name, draw name, product name, access password, draw price. Based on sendBidConfirmationEmail template structure **[HIGH-RISK: shared email service]**
- [x] 6.2 Add `sendDrawWinnerEmail()` to `api/services/emailService.js` — HTML template for winner notification with draw name, product details, winning price, next steps

## 7. Draw Lifecycle Scheduler

- [x] 7.1 Add draw lifecycle checks to `api/scheduler/auctionScheduler.js` — in the existing 30s cron: query scheduled draws past start_datetime → transition to active; query active draws past end_datetime → transition to finished with participation count logging **[HIGH-RISK: shared scheduler file]**

## 8. Frontend API Client

- [x] 8.1 Add `drawsAPI` object to `client/lib/api.js` — functions: getByDateRange(from, to), getById(id), registerBuyer(drawId, data), verifyBuyer(drawId, email, password), setupPayment(drawId, buyerId), confirmPayment(drawId, buyerId, setupIntentId), enterDraw(drawId, buyerId) **[HIGH-RISK: shared API client]**
- [x] 8.2 Add `adminAPI.draws` object to `client/lib/api.js` — functions: getAll(status?), getById(id), create(data), update(id, data), delete(id), start(id), cancel(id)

## 9. Frontend Event Badge Component

- [x] 9.1 Create `client/components/EventBadge.js` — shared badge component accepting `type` prop ('auction' | 'draw'): auction renders red pulsing dot + "Subasta", draw renders black static dot + "Sorteo". Same positioning and style classes as existing AuctionBadge
- [x] 9.2 Update `client/components/AuctionBadge.js` — refactor to be a thin wrapper around EventBadge with type="auction" for backwards compatibility
- [x] 9.3 Update `client/components/AuctionGridItem.js` — import and use updated AuctionBadge (should work without changes if wrapper is correct)

## 10. Frontend Draw Grid Item

- [x] 10.1 Create `client/components/DrawGridItem.js` — grid card component: displays EventBadge with type="draw", single product image (aspect-square, object-cover), seller name (gray text), product title (bold, linked to /eventos/sorteo/{drawId}), price formatted as EUR. Follow AuctionGridItem structure

## 11. Frontend Eventos Page (Mixed Grid)

- [x] 11.1 Update `client/app/eventos/page.js` — import drawsAPI, fetch both auctions and draws in parallel on month change (Promise.all), merge results with type discriminator ('auction' | 'draw'), update date filtering to include draws, pass draw dates to AuctionCalendar for highlighting **[HIGH-RISK: shared Eventos page]**
- [x] 11.2 Update grid rendering in `client/app/eventos/page.js` — render AuctionGridItem for type='auction' and DrawGridItem for type='draw' in the same grid

## 12. Frontend Draw Detail Page

- [x] 12.1 Create `client/app/eventos/sorteo/[id]/page.js` — server component wrapper with generateMetadata() for SEO (title, description, OG tags from draw data), renders DrawDetail client component
- [x] 12.2 Add `fetchDraw(id)` to `client/lib/serverApi.js` — server-side fetch for draw detail metadata generation
- [x] 12.3 Create `client/app/eventos/sorteo/[id]/DrawDetail.js` — client component with two-column layout (lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8): left column shows product image (resolved by product_type), right column shows product name (h1), seller name, draw price, draw metadata (units, max_participations, current participants), date range, and "Inscribirse en el sorteo" button. Button disabled states for full/finished/cancelled draws

## 13. Frontend Draw Participation Modal

- [x] 13.1 Create `client/components/DrawParticipationModal.js` — multi-step modal following BidModal phase pattern: CHOOSE, VERIFY, TERMS, PERSONAL, DELIVERY, INVOICING, PAYMENT (Stripe Elements), CONFIRM (product image + price + confirm button), SUCCESS (entry confirmed + password). Uses drawsAPI for all API calls. Stores session in localStorage keyed by draw ID. No live price tracking (static price)

## 14. Frontend Admin Pages

- [x] 14.1 Create `client/app/admin/sorteos/page.js` — admin draws list page: table with Name, Start, End, Status (badge), Product, Participants count. Actions: View, Start (if scheduled), Cancel (if not finished). Link to create new draw
- [x] 14.2 Create `client/app/admin/sorteos/nueva/page.js` — admin create draw page: form with name, description, product selector (art or other), price, units, max_participations, start_datetime, end_datetime. Submit calls adminAPI.draws.create()
- [x] 14.3 Create `client/app/admin/sorteos/[id]/page.js` — admin edit draw page: pre-filled form, update on submit via adminAPI.draws.update(). Show current status, participation count. Start/Cancel action buttons
- [x] 14.4 Add "Sorteos" link to admin sidebar/navigation — link to /admin/sorteos in the admin layout navigation **[HIGH-RISK: shared admin layout]**
