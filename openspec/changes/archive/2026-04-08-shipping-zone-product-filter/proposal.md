## Why

Currently, shipping zones are configured per seller and postal code region, but there is no way to assign a specific shipping method/zone to a particular product. This means all products from the same seller share the same shipping options. The admin needs the ability to configure shipping zones that apply only to a specific product (art or others), enabling per-product shipping pricing and availability.

## What Changes

- Add optional `product_id` (INTEGER) and `product_type` (TEXT, 'art'|'other') columns to `shipping_zones` table for polymorphic product referencing (following the `draws` table pattern).
- Extend the shipping zone create/update API endpoints to accept and persist `product_id` and `product_type`.
- Extend the shipping zone list (admin) endpoint to return product information (name, type) when a zone is tied to a product.
- Update the `getAvailableShipping` buyer-facing endpoint to filter by product: when a zone is configured for a specific product, it only matches that product. When a product-specific zone exists for a method, it takes priority over the generic (no-product) zone for the same method.
- Add a "Producto" select field in the admin shipping zone form (depends on seller selection) that loads products via the existing `GET /api/admin/authors/:id/products` endpoint.
- Display the linked product name in the admin zones table.
- The product field is always optional — leaving it empty preserves current generic behavior.

## Capabilities

### New Capabilities
- `shipping-zone-product-filter`: Per-product shipping zone filtering — allows shipping zones to be optionally restricted to a specific product, with priority logic where product-specific zones override generic zones for the same shipping method.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Database**: `shipping_zones` table gains two nullable columns (`product_id`, `product_type`)
- **API (admin)**: `POST /api/admin/shipping/methods/:methodId/zones` and `PUT /api/admin/shipping/zones/:zoneId` accept new optional fields; `GET /api/admin/shipping/methods/:methodId/zones` returns product info
- **API (public)**: `GET /api/shipping/available` applies product filtering and priority logic for both pickup and delivery methods
- **Validators**: `shippingSchemas.js` updated with new optional fields
- **Admin UI**: `client/app/admin/envios/[id]/zones/page.js` gains product select and table column
- **No new dependencies** required
