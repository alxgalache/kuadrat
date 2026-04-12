## Why

The auction system has two critical bugs (buyer address data not saving during registration, and auctions not auto-finishing when time expires) that prevent the feature from working correctly in production. Additionally, once fixed, we need a way for the admin to convert winning auction bids into orders so that seller payouts can be calculated, matching the existing order-based payout flow.

## What Changes

- **Fix buyer address data loss**: The frontend sends delivery/invoicing addresses as nested objects (`deliveryAddress: { address_1, ... }`) but the backend controller destructures flat field names (`deliveryAddress1, deliveryAddress2, ...`). Fix the mapping so all address fields are correctly persisted in `auction_buyers`.
- **Fix auction auto-finish on time expiry**: The scheduler's `processAuctionEnd` can fail mid-execution (e.g. during winner charge processing) before broadcasting the `auction_ended` socket event. Refactor so the broadcast always fires regardless of downstream failures. Also add a client-side failsafe that disables bidding when the countdown reaches zero, and close the BidModal with a notification if the auction ends while the user is mid-bid.
- **Remove automatic winner charging from scheduler**: The current scheduler attempts to charge winners automatically when an auction ends. This is being replaced by a manual admin-driven billing flow, so remove the auto-charge logic from `processAuctionEnd`.
- **Add bid listing to admin auction detail page**: On the admin auction detail page (`/admin/subastas/[id]`), add a section showing all bids for each product, sorted by date descending, with bidder personal data and bid amount.
- **Add "Facturar" (invoice) action per bid**: Each bid row in the admin panel gets a "Facturar" button. This action creates an `orders` record + `art_order_items` record by mapping data from `auction_buyers`, `auction_bids`, and `auction_authorised_payment_data`. It then charges the buyer's saved payment method via Stripe and sets the order status to `paid`, plugging into the existing order confirmation → seller wallet payout flow.

## Capabilities

### New Capabilities
- `auction-bid-billing`: Admin-driven flow to convert a winning auction bid into an order, charge the buyer, and integrate with the existing seller payout pipeline.

### Modified Capabilities
- (none — the auction system has no existing openspec specs; the fixes are implementation corrections)

## Impact

- **Backend files affected**:
  - `api/controllers/auctionController.js` — fix `registerBuyer` to correctly map nested address objects to flat DB columns
  - `api/scheduler/auctionScheduler.js` — refactor `processAuctionEnd` to always broadcast `auction_ended`, remove auto-charge logic
  - `api/controllers/auctionAdminController.js` — add new endpoint for creating order from auction bid
  - `api/services/auctionService.js` — add helper to fetch bid + buyer + payment data for billing
  - `api/routes/admin/auctionRoutes.js` — new admin route for bid billing
- **Frontend files affected**:
  - `client/components/BidModal.js` — handle auction-ended-while-bidding scenario
  - `client/app/eventos/subasta/[id]/AuctionDetail.js` — add client-side countdown expiry detection
  - `client/hooks/useAuctionSocket.js` — no structural changes (already handles `auction_ended`)
  - `client/app/admin/subastas/[id]/page.js` — add bid listing section and "Facturar" action
  - `client/lib/api.js` — add admin API call for bid billing
- **Database**: No schema changes needed. Uses existing `orders`, `art_order_items`, `auction_buyers`, `auction_bids`, `auction_authorised_payment_data` tables.
- **Dependencies**: No new dependencies.
