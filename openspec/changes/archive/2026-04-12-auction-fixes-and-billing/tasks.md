## 1. Bug Fix: Buyer Address Data Persistence

- [x] 1.1 Fix address field mapping in `client/components/BidModal.js`: flatten the nested `deliveryAddress` and `invoicingAddress` objects into flat field names (`deliveryAddress1`, `deliveryAddress2`, `deliveryPostalCode`, `deliveryCity`, `deliveryProvince`, `deliveryCountry`, `invoicingAddress1`, `invoicingAddress2`, `invoicingPostalCode`, `invoicingCity`, `invoicingProvince`, `invoicingCountry`) before calling `auctionsAPI.registerBuyer()`. Update both call sites in `handleRegisterAndSetupPayment`.
- [x] 1.2 Verify the backend controller `api/controllers/auctionController.js` correctly destructures the flat field names and passes them to `auctionService.createOrGetAuctionBuyer()`. Confirm no changes needed on the backend side.

## 2. Bug Fix: Auction Auto-Finish on Time Expiry

- [x] 2.1 Refactor `processAuctionEnd()` in `api/scheduler/auctionScheduler.js`: move the `broadcastAuctionEnded()` call to immediately after `endAuction()` (before any winner processing). Wrap the remaining post-processing in a try-catch so errors never prevent the broadcast.
- [x] 2.2 Remove the automatic winner charging loop from `processAuctionEnd()`. The admin will handle billing manually via the new "Facturar" flow. Keep the product sold/unsold marking logic.
- [x] 2.3 Add client-side countdown expiry detection in `client/app/eventos/subasta/[id]/AuctionDetail.js`: use a `useEffect` with a timer that compares current time against `end_datetime`. When countdown reaches zero, set a local `isTimeExpired` state to `true` and use it (alongside the socket-driven `isEnded`) to disable the bid button.
- [x] 2.4 Handle auction-ended-while-BidModal-is-open in `client/components/BidModal.js`: accept an `auctionEnded` prop (driven by the parent's `isEnded || isTimeExpired` state). When this prop transitions from `false` to `true` while the modal is visible, close the modal and trigger a notification via `NotificationContext` with message "La subasta acaba de finalizar".

## 3. Admin Bids Listing

- [x] 3.1 Add `getAuctionBidsWithBuyers(auctionId)` service method in `api/services/auctionService.js` that joins `auction_bids` with `auction_buyers` and returns all bids for an auction sorted by `created_at DESC`, including buyer name, email, phone, and bid amount.
- [x] 3.2 Add `GET /api/admin/auctions/:auctionId/bids` endpoint in `api/controllers/auctionAdminController.js` that calls the service method and returns the bids list using `sendSuccess()`.
- [x] 3.3 Add the route in `api/routes/admin/auctionRoutes.js`.
- [x] 3.4 Add `adminAuctionsAPI.getAuctionBids(auctionId)` method in `client/lib/api.js`.
- [x] 3.5 Add the bids listing section to `client/app/admin/subastas/[id]/page.js`: fetch bids on page load (for finished auctions), display as a list/table with columns: buyer name, email, bid amount, date. Sort by most recent first. Show "No hay pujas registradas" when empty.

## 4. Admin Billing ("Facturar") Action

- [x] 4.1 Add `getBidBillingData(bidId)` service method in `api/services/auctionService.js` that fetches the bid, its associated buyer data from `auction_buyers`, and the buyer's payment data from `auction_authorised_payment_data`. Return all data needed for order creation.
- [x] 4.2 Add `POST /api/admin/auctions/:auctionId/bids/:bidId/bill` endpoint in `api/controllers/auctionAdminController.js`:
  - Validate: auction must be `finished`, bid must not already be billed (check `notes` field in `orders` for `auction_bid:<bidId>` reference).
  - Create `orders` row using mapped fields from `auction_buyers` (see design D6). Set `status = 'pending'`, `payment_provider = 'stripe'`, generate `token` via `crypto.randomUUID()`, store `auction_bid:<bidId>` in `notes`.
  - Create `art_order_items` row: `art_id` from bid's `product_id`, `price_at_purchase` from bid's `amount`, `commission_amount` computed as `amount * config.dealerCommission`.
  - Charge buyer via `stripeService.chargeWinnerOffSession()` using saved payment data.
  - On success: update order `status = 'paid'`, store `stripe_payment_intent_id`.
  - On failure: delete the pending order and return error.
  - Use `createBatch()` for the order + item creation. Use `sendSuccess()` for response.
- [x] 4.3 Add Zod validation schema for the billing endpoint in `api/validators/auctionSchemas.js` (validate `auctionId` and `bidId` as integer params).
- [x] 4.4 Add the route in `api/routes/admin/auctionRoutes.js`.
- [x] 4.5 Add `adminAuctionsAPI.billBid(auctionId, bidId)` method in `client/lib/api.js`.
- [x] 4.6 Add "Facturar" button per bid row in `client/app/admin/subastas/[id]/page.js`: only visible when auction status is `finished`. On click, call the billing endpoint, show loading state, then success/error notification. Disable the button after successful billing (show "Facturado" badge instead).

## 5. Verification

- [x] 5.1 Manually verify Bug #1 fix: register a buyer via BidModal and confirm all 12 address fields are populated in `auction_buyers`.
- [x] 5.2 Manually verify Bug #2 fix: let an auction's countdown reach zero and confirm the bid button is disabled, the status changes to finished, and the socket event fires.
- [x] 5.3 Manually verify billing flow: as admin, view bids on a finished auction, click "Facturar", confirm an order is created with correct field mappings and Stripe charge succeeds.
