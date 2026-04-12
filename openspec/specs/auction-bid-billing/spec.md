## ADDED Requirements

### Requirement: Admin can view all bids for an auction
The system SHALL provide an admin-only endpoint and UI section that lists all bids placed on a given auction, sorted by date descending, with buyer personal data and bid amount displayed per row.

#### Scenario: Admin views bid list on finished auction
- **WHEN** the admin navigates to the auction detail page for a finished auction
- **THEN** the system displays a section titled "Pujas" listing all bids with columns: buyer full name, email, bid amount, and date, sorted by most recent first

#### Scenario: Admin views bid list on active auction
- **WHEN** the admin navigates to the auction detail page for an active auction
- **THEN** the bid list section is visible but the "Facturar" action is not available (auction must be finished)

#### Scenario: No bids exist for auction
- **WHEN** the admin views an auction that has zero bids
- **THEN** the system displays a message "No hay pujas registradas" in the bids section

### Requirement: Admin can bill a bid to create an order
The system SHALL allow the admin to trigger a "Facturar" action on any bid of a finished auction. This action MUST create an `orders` record and an `art_order_items` record, charge the buyer's saved payment method via Stripe, and set the order status to `paid`.

#### Scenario: Successful billing of a winning bid
- **WHEN** the admin clicks "Facturar" on a bid for a finished auction
- **AND** the buyer has valid saved payment data in `auction_authorised_payment_data`
- **THEN** the system creates an `orders` record with buyer delivery/invoicing addresses mapped from `auction_buyers`
- **AND** creates an `art_order_items` record with `art_id` from the bid's `product_id` and `price_at_purchase` from the bid's `amount`
- **AND** computes `commission_amount` as `amount * (DEALER_COMMISSION_ART / 100)`, reading the value from `config.payment.dealerCommissionArt`
- **AND** charges the buyer via Stripe using their saved payment method
- **AND** sets the order status to `paid`
- **AND** stores the Stripe payment intent ID in the order record
- **AND** displays a success notification to the admin

#### Scenario: Billing a bid that was already billed
- **WHEN** the admin clicks "Facturar" on a bid that has already been billed
- **THEN** the system rejects the action with an error "Esta puja ya ha sido facturada"
- **AND** does not create a duplicate order

#### Scenario: Stripe charge failure during billing
- **WHEN** the admin clicks "Facturar" on a bid
- **AND** the Stripe charge fails (e.g., card declined, payment method expired)
- **THEN** the system does not create a `paid` order
- **AND** displays an error notification to the admin with the Stripe error message

#### Scenario: Billing attempted on non-finished auction
- **WHEN** the admin attempts to bill a bid for an auction that is not in `finished` status
- **THEN** the system rejects the action with an error "La subasta debe estar finalizada para facturar"

### Requirement: Billed auction orders integrate with seller payout pipeline
The orders created from auction billing MUST follow the standard order lifecycle. When an `art_order_items` status changes to `confirmed`, the seller's `available_withdrawal_art_rebu` balance SHALL be credited with `price_at_purchase - commission_amount`.

#### Scenario: Auction order item confirmed triggers payout credit
- **WHEN** a seller confirms an art_order_item that was created from an auction bid
- **THEN** the system credits the seller's `available_withdrawal_art_rebu` with `price_at_purchase - commission_amount`
- **AND** the seller can include this amount in their next payout request

### Requirement: Buyer address data is correctly persisted during bid registration
The system MUST correctly save all delivery and invoicing address fields when a buyer registers for an auction via the bid modal. The fields `delivery_address_1`, `delivery_address_2`, `delivery_postal_code`, `delivery_city`, `delivery_province`, `delivery_country`, `invoicing_address_1`, `invoicing_address_2`, `invoicing_postal_code`, `invoicing_city`, `invoicing_province`, `invoicing_country` MUST be populated in `auction_buyers`.

#### Scenario: Buyer registers with full address data
- **WHEN** a buyer completes the bid modal with delivery and invoicing addresses
- **AND** submits the registration
- **THEN** all 12 address fields are persisted in the `auction_buyers` table with the values entered by the buyer

#### Scenario: Buyer registers with same billing address as delivery
- **WHEN** a buyer checks "Same as delivery address" in the bid modal
- **THEN** the invoicing address fields are populated with the delivery address values

### Requirement: Auction auto-finishes when time expires
The system MUST transition an active auction to `finished` status when its `end_datetime` has passed. The frontend MUST disable bidding immediately when the countdown reaches zero, without waiting for the server event.

#### Scenario: Scheduler detects expired auction
- **WHEN** the scheduler runs and finds an active auction whose `end_datetime` is in the past
- **THEN** the system sets the auction status to `finished` in the database
- **AND** broadcasts an `auction_ended` socket event to all connected clients in the auction room

#### Scenario: Client-side countdown reaches zero
- **WHEN** the countdown timer on the auction detail page reaches zero
- **THEN** the bid button is disabled immediately
- **AND** the UI shows the auction as finalized

#### Scenario: Socket broadcast always fires regardless of downstream failures
- **WHEN** the scheduler ends an auction and encounters errors during post-processing
- **THEN** the `auction_ended` socket event is STILL broadcast to clients

### Requirement: BidModal closes when auction ends mid-bid
The system MUST close the bid modal and display a notification if the auction finishes while the user is in the middle of the bid process.

#### Scenario: Auction ends while user is filling bid modal
- **WHEN** a buyer has the bid modal open
- **AND** the auction transitions to `finished` (via socket event or client countdown)
- **THEN** the modal closes automatically
- **AND** the system displays an error notification: "La subasta acaba de finalizar"
- **AND** the auction detail page shows the auction as finalized
