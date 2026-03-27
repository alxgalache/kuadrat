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
