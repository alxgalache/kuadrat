## ADDED Requirements

### Requirement: Stale arrived items alert endpoint
The system SHALL provide an admin endpoint `GET /api/admin/orders/alerts/stale-arrived` that identifies all order items with status "arrived" where `status_modified` is more than 10 days ago, and sends an alert email to the admin.

#### Scenario: Items found in stale arrived state
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-arrived` and there are items in "arrived" status for more than 10 days
- **THEN** the system SHALL send an email to the address in `config.registrationEmail` containing the list of stale items with their details (order number, product name, product type, days in arrived status), sorted descending by number of days
- **THEN** the response SHALL include the list of stale items and a confirmation that the email was sent

#### Scenario: No stale arrived items found
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-arrived` and no items have been in "arrived" status for more than 10 days
- **THEN** the response SHALL indicate that no stale items were found
- **THEN** no email SHALL be sent

#### Scenario: Email delivery fails
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-arrived` and stale items exist but email delivery fails
- **THEN** the response SHALL still include the list of stale items
- **THEN** the email error SHALL be logged but not thrown

### Requirement: Stale sent items alert endpoint
The system SHALL provide an admin endpoint `GET /api/admin/orders/alerts/stale-sent` that identifies all order items with status "sent" where `status_modified` is more than 15 days ago, and sends an alert email to the admin.

#### Scenario: Items found in stale sent state
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-sent` and there are items in "sent" status for more than 15 days
- **THEN** the system SHALL send an email to the address in `config.registrationEmail` containing the list of stale items with their details (order number, product name, product type, days in sent status), sorted descending by number of days
- **THEN** the response SHALL include the list of stale items and a confirmation that the email was sent

#### Scenario: No stale sent items found
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-sent` and no items have been in "sent" status for more than 15 days
- **THEN** the response SHALL indicate that no stale items were found
- **THEN** no email SHALL be sent

#### Scenario: Email delivery fails for stale sent
- **WHEN** admin calls `GET /api/admin/orders/alerts/stale-sent` and stale items exist but email delivery fails
- **THEN** the response SHALL still include the list of stale items
- **THEN** the email error SHALL be logged but not thrown

### Requirement: Alert endpoints require admin authentication
Both alert endpoints SHALL require admin authentication (JWT + admin role).

#### Scenario: Unauthenticated request to alert endpoint
- **WHEN** a request is made to either alert endpoint without valid admin credentials
- **THEN** the system SHALL return a 401 or 403 error

### Requirement: Alert email content
The alert emails SHALL include for each stale item: the order number, product name, product type (art or other), and the number of days the item has been in the stale status. Items SHALL be ordered descending by the number of days in the stale status.

#### Scenario: Alert email format
- **WHEN** an alert email is generated with stale items
- **THEN** the email subject SHALL clearly indicate the alert type (stale arrived or stale sent)
- **THEN** each item in the email body SHALL display the order number, product name, product type, and number of days in the status
- **THEN** items SHALL appear sorted from most days to fewest days
