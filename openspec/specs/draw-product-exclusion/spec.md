## ADDED Requirements

### Requirement: Draw flag on product tables
The `art` and `others` tables SHALL each include a `for_draw INTEGER NOT NULL DEFAULT 0` column. This column indicates whether the product is currently linked to a draw and MUST be excluded from public gallery/shop listings.

#### Scenario: Art table includes for_draw column
- **WHEN** `initializeDatabase()` runs
- **THEN** the `art` table SHALL include a `for_draw` column with type INTEGER, NOT NULL constraint, and DEFAULT 0

#### Scenario: Others table includes for_draw column
- **WHEN** `initializeDatabase()` runs
- **THEN** the `others` table SHALL include a `for_draw` column with type INTEGER, NOT NULL constraint, and DEFAULT 0

---

### Requirement: Art products listing excludes draw products
The public art listing endpoint (`GET /api/art`) SHALL exclude products where `for_draw = 1`, in addition to existing filters (`visible = 1`, `is_sold = 0`, `status = 'approved'`, `removed = 0`, `for_auction = 0 OR NULL`).

#### Scenario: Art product linked to a draw is hidden from gallery
- **WHEN** a GET request is made to `/api/art`
- **AND** an art product has `for_draw = 1`
- **THEN** that product SHALL NOT appear in the response

#### Scenario: Art product not linked to a draw appears in gallery
- **WHEN** a GET request is made to `/api/art`
- **AND** an art product has `for_draw = 0` and meets all other visibility criteria
- **THEN** that product SHALL appear in the response

---

### Requirement: Others products listing excludes draw products
The public others listing endpoint (`GET /api/others`) SHALL exclude products where `for_draw = 1`, in addition to existing filters.

#### Scenario: Others product linked to a draw is hidden from shop
- **WHEN** a GET request is made to `/api/others`
- **AND** an others product has `for_draw = 1`
- **THEN** that product SHALL NOT appear in the response

#### Scenario: Others product not linked to a draw appears in shop
- **WHEN** a GET request is made to `/api/others`
- **AND** an others product has `for_draw = 0` and meets all other visibility criteria
- **THEN** that product SHALL appear in the response
