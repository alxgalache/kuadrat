## Context

The Kuadrat auction system allows buyers to bid on artworks in real-time via Socket.IO. The flow is:

1. Admin creates an auction with products, sets start/end datetimes, and publishes it.
2. Buyers register via `BidModal` (personal data, addresses, Stripe payment setup), then place bids.
3. A scheduler (`auctionScheduler.js`) runs every 30 seconds: starts scheduled auctions and ends expired ones.
4. When an auction ends, the scheduler calls `processAuctionEnd()`, which sets the DB status to `finished` and broadcasts `auction_ended` via Socket.IO.
5. Currently, the scheduler also attempts to auto-charge winners — this needs to be replaced by a manual admin billing flow.

**Current problems:**
- **Bug #1**: Address fields arrive empty because the frontend sends nested objects (`deliveryAddress: { address_1, ... }`) but the backend destructures flat names (`deliveryAddress1`).
- **Bug #2**: If the scheduler's `processAuctionEnd` throws during winner processing, the `auction_ended` socket broadcast is never reached. The frontend has no fallback, so the UI stays "active" after time expires.
- **Missing feature**: No way for admin to convert a winning bid into an order for seller payout integration.

## Goals / Non-Goals

**Goals:**
- Fix buyer address persistence so all delivery/invoicing fields are correctly saved in `auction_buyers`.
- Ensure auctions reliably finish on the frontend when time expires, both via server broadcast and client-side countdown.
- Handle the edge case where a buyer is mid-bid when an auction ends (close modal, show notification).
- Remove automatic winner charging from the scheduler (replaced by manual admin flow).
- Provide an admin interface to view all bids and trigger billing (order creation + Stripe charge) per bid.
- The billing flow MUST create standard `orders` + `art_order_items` records so the existing payout pipeline (item confirmation → seller wallet credit) works unchanged.

**Non-Goals:**
- Automated email to auction winners (admin contacts them manually).
- Shipping cost calculation for auction orders (admin handles this externally).
- Changes to the existing seller payout/withdrawal flow.
- Draw (sorteo) functionality — unrelated.

## Decisions

### D1: Fix address mapping on the frontend (flatten before sending)

**Decision**: Flatten the nested address objects in `BidModal.js` before calling `auctionsAPI.registerBuyer()`, rather than changing the backend to accept nested objects.

**Rationale**: The backend controller + service layer consistently use flat field names (`deliveryAddress1`, `deliveryPostalCode`, etc.) matching the DB column names. Changing the backend would require updating the controller, service, and potentially the Zod validator. Flattening on the frontend is a 1-line mapping change in the API call and keeps the backend consistent.

**Alternative considered**: Restructure the backend to accept nested objects and flatten internally. Rejected because it changes more code and the flat naming convention is already established.

### D2: Separate "end auction" from "process winners" in the scheduler

**Decision**: Refactor `processAuctionEnd()` to:
1. Set auction status to `finished` in DB (already done via `endAuction()`).
2. Broadcast `auction_ended` via socket **immediately** after the DB update.
3. Remove the automatic winner charging loop entirely.

**Rationale**: The current code has the broadcast at the very end of the function, after a loop that processes and charges each winner. If any charge fails with an unhandled error, the broadcast is never sent. Since the new workflow is admin-driven billing, there's no reason to keep the auto-charge logic. Putting the broadcast right after the DB update guarantees the frontend always receives the end signal.

### D3: Add client-side countdown expiry as a failsafe

**Decision**: In `AuctionDetail.js`, add a `useEffect` that monitors the countdown timer. When the countdown reaches zero (based on `end_datetime`), immediately set a local `isTimeExpired` flag that disables the bid button. This is a UX-level failsafe — the server-side status update via socket remains authoritative.

**Rationale**: There can be up to 30 seconds of delay between the actual end time and the scheduler processing it. During this window, the frontend should not allow new bids (the backend `placeBid` already validates `status === 'active'`, so bids would fail, but the UX should be proactive).

### D4: Close BidModal on auction end with notification

**Decision**: Pass the `isEnded` state from `useAuctionSocket` into `BidModal`. When it transitions to `true` while the modal is open, automatically close the modal and display an error notification via `NotificationContext` saying "La subasta acaba de finalizar".

**Rationale**: The user should not be left filling in a form for a finished auction. Immediate feedback with a clear Spanish message is the right UX.

### D5: New admin endpoint `POST /api/admin/auctions/:auctionId/bids/:bidId/bill`

**Decision**: Create a single endpoint that:
1. Reads the bid, buyer, and authorised payment data.
2. Creates an `orders` row with fields mapped from `auction_buyers`.
3. Creates an `art_order_items` row with fields mapped from `auction_bids`.
4. Charges the buyer via Stripe using `chargeWinnerOffSession` (existing in `stripeService.js`).
5. Updates the order status to `paid` and stores Stripe payment intent details.
6. All within a transaction (order + item creation), then the Stripe charge, then the status update.

**Rationale**: A single endpoint keeps the admin action atomic and simple. The existing `chargeWinnerOffSession` in `stripeService` already handles off-session charges with saved payment methods — we reuse it. The order follows the standard schema so the existing payout flow triggers automatically when the item status changes to `confirmed`.

### D6: Field mappings for order creation

| Source Table | Source Field | → | Target Table | Target Field |
|---|---|---|---|---|
| `auction_buyers` | `first_name + ' ' + last_name` | → | `orders` | `full_name` |
| `auction_buyers` | `email` | → | `orders` | `email` |
| `auction_buyers` | `phone` | → | `orders` | `phone` |
| `auction_buyers` | `delivery_address_1` | → | `orders` | `delivery_address_1` |
| `auction_buyers` | `delivery_address_2` | → | `orders` | `delivery_address_2` |
| `auction_buyers` | `delivery_postal_code` | → | `orders` | `delivery_postal_code` |
| `auction_buyers` | `delivery_city` | → | `orders` | `delivery_city` |
| `auction_buyers` | `delivery_province` | → | `orders` | `delivery_province` |
| `auction_buyers` | `delivery_country` | → | `orders` | `delivery_country` |
| `auction_buyers` | `delivery_lat` | → | `orders` | `delivery_lat` |
| `auction_buyers` | `delivery_long` | → | `orders` | `delivery_lng` |
| `auction_buyers` | `invoicing_address_1` | → | `orders` | `invoicing_address_1` |
| `auction_buyers` | `invoicing_address_2` | → | `orders` | `invoicing_address_2` |
| `auction_buyers` | `invoicing_postal_code` | → | `orders` | `invoicing_postal_code` |
| `auction_buyers` | `invoicing_city` | → | `orders` | `invoicing_city` |
| `auction_buyers` | `invoicing_province` | → | `orders` | `invoicing_province` |
| `auction_buyers` | `invoicing_country` | → | `orders` | `invoicing_country` |
| `auction_bids` | `product_id` | → | `art_order_items` | `art_id` |
| `auction_bids` | `amount` | → | `art_order_items` | `price_at_purchase` |
| computed | `amount * DEALER_COMMISSION` | → | `art_order_items` | `commission_amount` |
| `auction_authorised_payment_data` | `stripe_customer_id` | → | `orders` | `stripe_customer_id` |
| `auction_authorised_payment_data` | `stripe_payment_method_id` | → | `orders` | `stripe_payment_method_id` |
| generated | `crypto.randomUUID()` | → | `orders` | `token` |
| literal | `'stripe'` | → | `orders` | `payment_provider` |
| literal | `'paid'` | → | `orders` | `status` (after charge) |
| literal | `'auction'` | → | `orders` | `source` |

**Note**: The `orders` table does not have a `source` column. We'll use `notes` or leave it implicit (the link from `auction_bids.order_id` if we add that column). Actually, since we don't change the schema, the link is tracked via the new `auction_bids` columns or simply by the order existing.

### D7: Admin bids listing endpoint `GET /api/admin/auctions/:auctionId/bids`

**Decision**: Add a simple GET endpoint that returns all bids for an auction with buyer information joined, sorted by `created_at DESC`. This keeps the admin page query simple.

## Risks / Trade-offs

- **[Risk] Race condition on billing**: If admin clicks "Facturar" twice quickly, two orders could be created for the same bid. → **Mitigation**: Check if an order already exists for this bid before creating. Add a `billed_order_id` column to `auction_bids` (nullable) to track which bids have been billed. Actually, to avoid schema changes, we can check for duplicate orders by buyer email + art_id + auction source in the controller before proceeding. Or we simply use an optimistic lock: the endpoint first checks if a prior order has been created for this exact bid (by storing the bid_id in the order's `notes` field as a reference).

- **[Risk] Stripe charge failure after order creation**: The Stripe charge might fail even with a saved payment method (e.g., card expired). → **Mitigation**: Create the order in `pending` status first, attempt charge, update to `paid` only on success. If charge fails, delete or mark the order as `failed` and return an error to admin.

- **[Risk] Countdown drift between client and server**: The client-side countdown is based on the client's system clock, which may differ from the server's. → **Mitigation**: The socket already syncs countdown data. The client-side failsafe is just a UX hint — the backend always validates auction status before accepting bids.

- **[Trade-off] No `source` column on `orders`**: We don't add a dedicated `source` column to distinguish auction orders from regular orders, to avoid schema changes. Instead, we use the `notes` field to store `"auction_bid:<bid_id>"`. This is slightly informal but keeps the schema stable.
