## ADDED Requirements

### Requirement: Status modification timestamp column
The `art_order_items` and `other_order_items` tables SHALL each include a `status_modified` column of type `NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP` that records the timestamp of the most recent status change.

#### Scenario: New order item created
- **WHEN** an order item is inserted into `art_order_items` or `other_order_items`
- **THEN** `status_modified` SHALL default to the current timestamp

### Requirement: Buyer marks item as arrived updates timestamp
The system SHALL update `status_modified` to the current timestamp when a buyer marks an individual item or all items in an order as "arrived" via the public token-based endpoint.

#### Scenario: Buyer marks single item as arrived
- **WHEN** a buyer calls `updateItemStatusPublic` with status "arrived"
- **THEN** the item's `status_modified` SHALL be set to `CURRENT_TIMESTAMP`

#### Scenario: Buyer marks all order items as arrived
- **WHEN** a buyer calls `updateOrderStatusPublic` with status "arrived"
- **THEN** all items in the order (both `art_order_items` and `other_order_items`) SHALL have their `status_modified` set to `CURRENT_TIMESTAMP`

### Requirement: Buyer marks item as confirmed updates timestamp
The system SHALL update `status_modified` to the current timestamp when a buyer marks an individual item or all items in an order as "confirmed" via the public token-based endpoint.

#### Scenario: Buyer marks single item as confirmed
- **WHEN** a buyer calls `updateItemStatusPublic` with status "confirmed"
- **THEN** the item's `status_modified` SHALL be set to `CURRENT_TIMESTAMP`

#### Scenario: Buyer marks all order items as confirmed
- **WHEN** a buyer calls `updateOrderStatusPublic` with status "confirmed"
- **THEN** all items in the order SHALL have their `status_modified` set to `CURRENT_TIMESTAMP`

### Requirement: Seller marks item as sent updates timestamp
The system SHALL update `status_modified` to the current timestamp when a seller marks items as "sent" via the authenticated seller endpoint.

#### Scenario: Seller marks items as sent
- **WHEN** a seller calls `updateItemStatus` with status "sent"
- **THEN** all affected items SHALL have their `status_modified` set to `CURRENT_TIMESTAMP`

### Requirement: Admin status change updates timestamp
The system SHALL update `status_modified` to the current timestamp when an admin changes the status of an individual item or all items in an order via the admin endpoints.

#### Scenario: Admin changes single item status
- **WHEN** an admin calls `updateItemStatusAdmin` with any new status
- **THEN** the item's `status_modified` SHALL be set to `CURRENT_TIMESTAMP`

#### Scenario: Admin changes all order items status
- **WHEN** an admin calls `updateOrderStatusAdmin` with any new status
- **THEN** all items in the order SHALL have their `status_modified` set to `CURRENT_TIMESTAMP`

## MODIFIED Requirements

### Requirement: Order item status transitions

Order items SHALL support both manual status transitions (legacy provider) and automated webhook-driven transitions (Sendcloud provider). The auto-confirm timer adds a new automated transition from `arrived` to `confirmed`.

#### Scenario: Legacy manual transitions preserved
- **WHEN** an order item does NOT have a `sendcloud_shipment_id`
- **THEN** the seller SHALL be able to manually update status through the existing flow (paid → sent → arrived → confirmed)

#### Scenario: Sendcloud automated transitions
- **WHEN** an order item has a `sendcloud_shipment_id`
- **THEN** status transitions SHALL only occur via webhook notifications from Sendcloud or the auto-confirm scheduler. Manual seller updates SHALL be rejected with a 400 error.

#### Scenario: Auto-confirm transition
- **WHEN** an order item has status `arrived`, is Sendcloud-managed, and `status_modified` is older than `SENDCLOUD_AUTO_CONFIRM_DAYS`
- **THEN** the auto-confirm scheduler SHALL transition status to `confirmed` and credit the seller's `available_withdrawal`

#### Scenario: Admin override
- **WHEN** an admin manually updates an order item status
- **THEN** the update SHALL be allowed regardless of whether the item is Sendcloud-managed (admin override for edge cases)
