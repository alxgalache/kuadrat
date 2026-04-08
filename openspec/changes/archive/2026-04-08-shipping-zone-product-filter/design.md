## Context

The shipping system currently allows admins to create shipping methods with zones configured per seller, country, and postal code region. When a buyer adds a product to the cart and enters their postal code, the `getAvailableShipping` endpoint returns all matching shipping methods based on the seller, country, and postal code — but there is no mechanism to restrict a shipping zone to a specific product.

The `shipping_zones` table stores seller_id, country, and cost; the `shipping_zones_postal_codes` pivot table stores polymorphic postal references. The `getAvailableShipping` controller (shippingController.js lines 595-856) handles both pickup and delivery methods, with a deduplication step that groups by method_id and selects the lowest cost zone.

The existing `draws` table already implements a polymorphic product reference pattern with `product_id INTEGER` and `product_type TEXT CHECK(product_type IN ('art','other'))`, which we will follow.

## Goals / Non-Goals

**Goals:**
- Allow admins to optionally assign a specific product (art or others) to a shipping zone
- When a product-specific zone exists for a method, it takes priority over generic (product_id IS NULL) zones for the same method
- Apply the product filter to both pickup and delivery shipping methods
- Maintain full backward compatibility — zones without a product continue to work as before
- Expose product name in the admin zones list for clarity

**Non-Goals:**
- Multi-product zones (one zone = one product or none) — out of scope
- Automatic cleanup when a product is deleted (admin responsibility, consistent with draws pattern)
- Foreign key constraints on product_id (polymorphic reference, same as draws)
- Changes to the buyer-facing ShippingSelectionModal or client API functions (filtering is server-side)

## Decisions

### 1. Polymorphic product reference (product_id + product_type)

Follow the `draws` table pattern: two nullable columns `product_id INTEGER` and `product_type TEXT CHECK(product_type IN ('art','other'))`. No foreign key constraint since the ID can reference either the `art` or `others` table.

**Rationale:** Consistent with existing patterns in the codebase. Avoids schema complexity of separate join tables. The CHECK constraint on product_type provides basic integrity.

**Alternative considered:** A single `product_ref` TEXT column encoding both type and ID (e.g., "art:42"). Rejected because it would require string parsing, couldn't use numeric indexes, and breaks from established patterns.

### 2. Priority logic: product-specific zones override generic zones

When resolving available shipping for a product, for each shipping method:
1. Collect all matching zones (by seller, country, postal code)
2. Partition into product-specific (matching product_id + product_type) and generic (product_id IS NULL)
3. If any product-specific zone matches → use ONLY product-specific zones for that method
4. If no product-specific zone matches → use generic zones as before
5. Within each partition, keep the lowest-cost zone (existing deduplication behavior)

Additionally: if a zone has a product_id that does NOT match the current product, that zone is excluded entirely (it belongs to a different product).

**Rationale:** This gives admins fine-grained control without breaking existing behavior. A product-specific zone is a more precise rule and should win over a generic one.

**Alternative considered:** Additive approach (show both generic and product-specific). Rejected by user — specific should prevail.

### 3. Naming convention: 'art' | 'other' (singular)

Use singular form in the `product_type` CHECK constraint, consistent with `draws.product_type` and `auction_bids.product_type`. The `getAvailableShipping` endpoint receives `productType` as 'art' or 'others' (plural) from the client — normalize 'others' → 'other' when comparing against shipping_zones.product_type.

**Rationale:** Internal DB consistency is more important than matching API params. The normalization is a one-line conversion.

### 4. Product select depends on seller selection

The admin form shows a "Producto" select only after a seller is selected. When the seller changes, the product list reloads and any previously selected product is cleared. Uses the existing `GET /api/admin/authors/:id/products` endpoint (returns both art and others products).

**Rationale:** Products belong to sellers; showing products without a seller context is meaningless. The endpoint already exists and returns the needed data.

### 5. Conditional JOIN for product name in admin list

The `getShippingZones` admin endpoint will use a CASE expression with two LEFT JOINs (one to `art`, one to `others`) to resolve the product name based on `product_type`. This avoids a separate query per zone.

**Rationale:** A single query is more efficient. The LEFT JOINs add minimal overhead since most zones will have NULL product_id.

## Risks / Trade-offs

**[Risk] Orphaned product references** → If a product is deleted, zones keep pointing to a non-existent product. The admin must clean up manually. This is consistent with the draws pattern. The admin zones list will show a null/missing product name, which serves as a visual indicator.

**[Risk] Naming inconsistency between API and DB** → The `productType` API param uses 'others' (plural) while the DB column uses 'other' (singular). Mitigated by normalizing in the controller before comparison. A comment in the code will document this.

**[Risk] Performance of double LEFT JOIN** → The getShippingZones admin query adds two LEFT JOINs. Since this is an admin-only endpoint with typically small result sets (< 50 zones per method), impact is negligible.

**[Trade-off] No multi-product zones** → A zone can be tied to at most one product. To apply the same shipping rule to multiple products, admin must create multiple zones. This keeps the schema simple and avoids a many-to-many join table.
