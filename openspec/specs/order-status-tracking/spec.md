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
