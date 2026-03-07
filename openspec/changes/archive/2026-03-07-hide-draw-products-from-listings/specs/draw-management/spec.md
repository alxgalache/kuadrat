## ADDED Requirements

### Requirement: Set for_draw flag on draw creation
When a draw is created, the system SHALL set `for_draw = 1` on the linked product (in the `art` or `others` table, based on `product_type`).

#### Scenario: Creating a draw flags the art product
- **WHEN** admin creates a draw with `product_type = 'art'` and `product_id = 42`
- **THEN** the system SHALL execute `UPDATE art SET for_draw = 1 WHERE id = 42`

#### Scenario: Creating a draw flags the others product
- **WHEN** admin creates a draw with `product_type = 'other'` and `product_id = 7`
- **THEN** the system SHALL execute `UPDATE others SET for_draw = 1 WHERE id = 7`

---

### Requirement: Reset for_draw flag on draw cancellation
When a draw is cancelled, the system SHALL set `for_draw = 0` on the linked product.

#### Scenario: Cancelling a draw restores the product to listings
- **WHEN** admin cancels a draw linked to `product_type = 'art'` and `product_id = 42`
- **THEN** the system SHALL execute `UPDATE art SET for_draw = 0 WHERE id = 42`

---

### Requirement: Reset for_draw flag on draw deletion
When a draw is deleted, the system SHALL set `for_draw = 0` on the linked product before deleting the draw record.

#### Scenario: Deleting a draft draw restores the product to listings
- **WHEN** admin deletes a draw in `draft` status linked to `product_type = 'other'` and `product_id = 7`
- **THEN** the system SHALL execute `UPDATE others SET for_draw = 0 WHERE id = 7` before deleting the draw

---

### Requirement: Update for_draw flag on draw product change
When a draw's `product_id` or `product_type` is updated, the system SHALL reset `for_draw = 0` on the previously linked product and set `for_draw = 1` on the newly linked product.

#### Scenario: Changing the draw's product resets old and sets new
- **WHEN** admin updates a draw from `product_id = 42, product_type = 'art'` to `product_id = 99, product_type = 'art'`
- **THEN** the system SHALL set `for_draw = 0` on art product 42 and `for_draw = 1` on art product 99

#### Scenario: Changing the draw's product type across tables
- **WHEN** admin updates a draw from `product_id = 42, product_type = 'art'` to `product_id = 7, product_type = 'other'`
- **THEN** the system SHALL set `for_draw = 0` on art product 42 and `for_draw = 1` on others product 7
