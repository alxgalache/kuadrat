## 1. Database Schema

- [x] 1.1 Add `product_id INTEGER` and `product_type TEXT CHECK(product_type IN ('art','other'))` columns to `shipping_zones` CREATE TABLE in `api/config/database.js`

## 2. API Validation

- [x] 2.1 Add `product_id` (optional positive integer) and `product_type` (optional enum 'art'|'other') to `createZoneSchema` in `api/validators/shippingSchemas.js`, with cross-field validation (both must be present or both absent)
- [x] 2.2 Add same fields to `updateZoneSchema` in `api/validators/shippingSchemas.js`

## 3. Admin API — Zone CRUD

- [x] 3.1 Update `createShippingZone` in `api/controllers/shippingController.js` to INSERT `product_id` and `product_type` from request body
- [x] 3.2 Update `updateShippingZone` in `api/controllers/shippingController.js` to UPDATE `product_id` and `product_type` (setting to NULL when cleared)
- [x] 3.3 Update `getShippingZones` in `api/controllers/shippingController.js` to LEFT JOIN `art` and `others` tables and return `product_name`, `product_id`, `product_type` per zone

## 4. Buyer API — Available Shipping (⚠️ high-risk: shared infrastructure)

- [x] 4.1 Update pickup query in `getAvailableShipping` (shippingController.js ~lines 660-703) to SELECT `product_id` and `product_type`, and exclude zones where product_id does not match the requested product
- [x] 4.2 Update delivery-with-postal-code query in `getAvailableShipping` (~lines 726-783) to SELECT `product_id` and `product_type`, and exclude non-matching product zones
- [x] 4.3 Update delivery-without-postal-code query in `getAvailableShipping` (~lines 804-832) to SELECT `product_id` and `product_type`, and exclude non-matching product zones
- [x] 4.4 Update deduplication logic in `getAvailableShipping` (~lines 786-791) to implement product-specific priority: for each method, if a zone with matching product_id exists, discard generic zones; normalize 'others' → 'other' for product_type comparison

## 5. Admin Frontend — Zone Form & Table

- [x] 5.1 Add `product_id` and `product_type` to `formData` state in `client/app/admin/envios/[id]/zones/page.js`
- [x] 5.2 Add product loading effect: when `formData.seller_id` changes, fetch products via `adminAPI.authors.getProducts(sellerId)` and store in local state; clear product selection on seller change
- [x] 5.3 Add "Producto" select input to the zone form (disabled when no seller selected, shows product name, value encodes id+type); placed after the seller select
- [x] 5.4 Update `handleSubmit` to include `product_id` and `product_type` in the create/update API call payload
- [x] 5.5 Update `handleEdit` to populate `product_id` and `product_type` from zone data into formData (and trigger product list load for that seller)
- [x] 5.6 Update `handleCancel` / form reset to clear `product_id` and `product_type`
- [x] 5.7 Add "Producto" column to the zones table displaying `product_name` (or dash when null)
