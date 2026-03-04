## ADDED Requirements

### Requirement: Buyer can mark a single item as received
The system SHALL allow the buyer to change a single order item's status from `sent` to `arrived` via the public order page, using the order token for authentication.

#### Scenario: Successfully mark item as received
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/items/:itemId/status` with `{ status: "arrived", product_type: "art"|"other" }`
- **AND** the order token is valid
- **AND** the item belongs to the order
- **AND** the item's current status is `sent`
- **THEN** the item status SHALL be updated to `arrived`
- **AND** the response SHALL return the updated order object
- **AND** the seller's `available_withdrawal` SHALL NOT be modified

#### Scenario: Reject marking item as received when status is not sent
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/items/:itemId/status` with `{ status: "arrived" }`
- **AND** the item's current status is NOT `sent`
- **THEN** the system SHALL return a 400 error with an appropriate message

#### Scenario: Reject with invalid order token
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/items/:itemId/status`
- **AND** the token does not match any order
- **THEN** the system SHALL return a 404 error

#### Scenario: Reject when item does not belong to order
- **WHEN** the buyer sends a status update for an item that does not belong to the order identified by the token
- **THEN** the system SHALL return a 404 error

### Requirement: Buyer can confirm a single item reception
The system SHALL allow the buyer to change a single order item's status from `arrived` to `confirmed` via the public order page. On confirmation, the seller's `available_withdrawal` SHALL be atomically incremented by the item's `price_at_purchase - commission_amount`.

#### Scenario: Successfully confirm item reception
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/items/:itemId/status` with `{ status: "confirmed", product_type: "art"|"other" }`
- **AND** the order token is valid
- **AND** the item belongs to the order
- **AND** the item's current status is `arrived`
- **THEN** the item status SHALL be updated to `confirmed`
- **AND** the seller's `available_withdrawal` SHALL be atomically incremented by `price_at_purchase - commission_amount`
- **AND** the response SHALL return the updated order object

#### Scenario: Prevent double-crediting on confirmation
- **WHEN** the buyer sends a confirm request for an item that is already `confirmed`
- **THEN** the system SHALL return a 400 error
- **AND** the seller's `available_withdrawal` SHALL NOT be modified

#### Scenario: Reject confirming when status is not arrived
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/items/:itemId/status` with `{ status: "confirmed" }`
- **AND** the item's current status is NOT `arrived`
- **THEN** the system SHALL return a 400 error

#### Scenario: Credit correct seller in multi-seller order
- **WHEN** the buyer confirms an item in an order containing items from multiple sellers
- **THEN** only the seller who owns the confirmed item SHALL have their `available_withdrawal` incremented

### Requirement: Buyer can mark all items in an order as received
The system SHALL allow the buyer to change all order items' status from `sent` to `arrived` in a single request, provided ALL items in the order have `sent` status.

#### Scenario: Successfully mark entire order as received
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/status` with `{ status: "arrived" }`
- **AND** the order token is valid
- **AND** ALL items in the order have status `sent`
- **THEN** all item statuses SHALL be updated to `arrived`
- **AND** the order-level status SHALL be updated to `arrived`
- **AND** the response SHALL return the updated order object

#### Scenario: Reject when not all items are sent
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/status` with `{ status: "arrived" }`
- **AND** at least one item in the order does NOT have status `sent`
- **THEN** the system SHALL return a 400 error with a message indicating not all items have been sent

### Requirement: Buyer can confirm all items in an order
The system SHALL allow the buyer to confirm all order items in a single request, provided ALL items in the order have `arrived` status. The seller balance crediting SHALL be calculated per-seller.

#### Scenario: Successfully confirm entire order
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/status` with `{ status: "confirmed" }`
- **AND** the order token is valid
- **AND** ALL items in the order have status `arrived`
- **THEN** all item statuses SHALL be updated to `confirmed`
- **AND** the order-level status SHALL be updated to `confirmed`
- **AND** each seller's `available_withdrawal` SHALL be atomically incremented by the sum of `(price_at_purchase - commission_amount)` for their respective items
- **AND** the response SHALL return the updated order object

#### Scenario: Reject when not all items are arrived
- **WHEN** the buyer sends `PATCH /api/orders/public/token/:token/status` with `{ status: "confirmed" }`
- **AND** at least one item in the order does NOT have status `arrived`
- **THEN** the system SHALL return a 400 error

#### Scenario: Per-seller balance calculation in multi-seller order
- **WHEN** the buyer confirms an order containing items from seller A and seller B
- **THEN** seller A's `available_withdrawal` SHALL be incremented by the sum of `(price_at_purchase - commission_amount)` for seller A's items only
- **AND** seller B's `available_withdrawal` SHALL be incremented by the sum of `(price_at_purchase - commission_amount)` for seller B's items only

### Requirement: Order-level status auto-promotion
The system SHALL automatically promote the order-level status when all items reach a given status, following the same pattern as the existing `checkAndUpdateOrderStatus` helper.

#### Scenario: Order status promotes to arrived when all items are arrived
- **WHEN** a single item is marked as `arrived`
- **AND** all other items in the order already have `arrived` status (or higher)
- **THEN** the order-level status SHALL be updated to `arrived`

#### Scenario: Order status promotes to confirmed when all items are confirmed
- **WHEN** a single item is marked as `confirmed`
- **AND** all other items in the order already have `confirmed` status
- **THEN** the order-level status SHALL be updated to `confirmed`

### Requirement: Validation schemas for buyer status updates
The system SHALL validate buyer status update requests using Zod schemas.

#### Scenario: Valid item status update request
- **WHEN** the buyer sends `{ status: "arrived"|"confirmed", product_type: "art"|"other" }`
- **THEN** the request SHALL pass validation

#### Scenario: Reject invalid status values
- **WHEN** the buyer sends a status value other than `arrived` or `confirmed`
- **THEN** the request SHALL fail validation with a 400 error

#### Scenario: Reject missing product_type for item updates
- **WHEN** the buyer sends an item status update without `product_type`
- **THEN** the request SHALL fail validation with a 400 error

#### Scenario: Valid order-level status update request
- **WHEN** the buyer sends `{ status: "arrived"|"confirmed" }`
- **THEN** the request SHALL pass validation

### Requirement: Email notifications on buyer status changes
The system SHALL send email notifications when the buyer changes order/item status.

#### Scenario: Email on item marked as received
- **WHEN** an item status changes to `arrived`
- **THEN** a notification email SHALL be sent to the seller informing them the buyer has received the item

#### Scenario: Email on item confirmed
- **WHEN** an item status changes to `confirmed`
- **THEN** a notification email SHALL be sent to the seller informing them the buyer has confirmed reception and the payment has been credited to their balance

### Requirement: Frontend buyer action - mark as received
The public order page SHALL display a "Marcar como recibido" action for items with `sent` status, and an order-level action when all items are `sent`.

#### Scenario: Per-item mark as received button
- **WHEN** the buyer views an order item with status `sent`
- **THEN** the UI SHALL show a "Marcar como recibido" action in a popover menu on the item

#### Scenario: Order-level mark as received button
- **WHEN** all items in the order have status `sent`
- **THEN** the UI SHALL show a "Marcar como recibido" action in the order header area

#### Scenario: Confirmation modal for mark as received
- **WHEN** the buyer clicks "Marcar como recibido" (item or order level)
- **THEN** a confirmation modal SHALL appear asking the buyer to confirm they have received the product(s)
- **AND** the modal SHALL have "Cancelar" and "Confirmar" buttons

#### Scenario: Hide mark as received when not applicable
- **WHEN** an item's status is NOT `sent`
- **THEN** the "Marcar como recibido" action SHALL NOT be shown for that item

### Requirement: Frontend buyer action - confirm reception
The public order page SHALL display a "Confirmar recepcion" action for items with `arrived` status, and an order-level action when all items are `arrived`.

#### Scenario: Per-item confirm reception button
- **WHEN** the buyer views an order item with status `arrived`
- **THEN** the UI SHALL show a "Confirmar recepcion" action in a popover menu on the item

#### Scenario: Order-level confirm reception button
- **WHEN** all items in the order have status `arrived`
- **THEN** the UI SHALL show a "Confirmar recepcion" action in the order header area

#### Scenario: Confirmation modal with warnings
- **WHEN** the buyer clicks "Confirmar recepcion" (item or order level)
- **THEN** a confirmation modal SHALL appear with:
  - A message stating the buyer confirms the product arrived in good condition
  - A warning that they will NOT be able to claim for damages after confirming
  - An informational note that the product will be automatically confirmed after 10 days if no issues are reported
  - "Cancelar" and "Confirmar" buttons

#### Scenario: Hide confirm when not applicable
- **WHEN** an item's status is NOT `arrived`
- **THEN** the "Confirmar recepcion" action SHALL NOT be shown for that item

### Requirement: Frontend API client methods for buyer status updates
The `ordersAPI` object in `client/lib/api.js` SHALL include methods for buyer-initiated public status updates.

#### Scenario: Public item status update method
- **WHEN** calling `ordersAPI.updateItemStatusPublic(token, itemId, status, productType)`
- **THEN** it SHALL send `PATCH /api/orders/public/token/:token/items/:itemId/status` with `{ status, product_type }` and `skipAuthHandling: true`

#### Scenario: Public order status update method
- **WHEN** calling `ordersAPI.updateOrderStatusPublic(token, status)`
- **THEN** it SHALL send `PATCH /api/orders/public/token/:token/status` with `{ status }` and `skipAuthHandling: true`

### Requirement: Future auto-confirm timer (NOT IMPLEMENTED)
**NOTE: This requirement is documented for future implementation only. It SHALL NOT be implemented in this change.**

After an item's status changes to `arrived`, a 10-day countdown SHALL begin. If the buyer does not confirm or report issues within 10 days, the system SHALL automatically change the item status to `confirmed` and credit the seller's balance. This will likely be implemented as a scheduled task (similar to `auctionScheduler.js`).

#### Scenario: Auto-confirm after 10 days (FUTURE)
- **WHEN** an item has been in `arrived` status for 10 days
- **AND** the buyer has not confirmed or reported issues
- **THEN** the system SHALL automatically transition the item to `confirmed`
- **AND** the seller's `available_withdrawal` SHALL be credited accordingly
