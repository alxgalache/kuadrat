## ADDED Requirements

### Requirement: Resolving a zone reads only the product's zones and resolves the destination once

The resolver SHALL restrict every zone query it issues — pickup, delivery with a postal code, and delivery without one — to zones that are generic (`product_id IS NULL`) or belong to the product being resolved (`product_id` and `product_type` both matching), in SQL, so that the cost of one quote does not grow with the number of other products the seller has.

The resolver SHALL resolve the destination once per call, with a single lookup of the postal code in `postal_codes`, into the postal code ids and provinces of that code in the destination country and the countries in which that code exists. The zone query SHALL receive those values as parameters and SHALL NOT join or search `postal_codes` itself, so that its cost does not depend on which `postal_codes` index the query planner chooses or on whether planner statistics exist.

The destination predicate SHALL keep its meaning: a zone matches when it has no postal refs (country-wide), or when one of its refs is a `postal_code` ref to one of those ids, a `province` ref to one of those provinces, or a `country` ref to one of those countries. It SHALL live in the resolver, under a name, and any other deliverability check over `shipping_zones` SHALL use it rather than copy it.

#### Scenario: A quote does not read the zones of the seller's other products
- **WHEN** a seller has zones for several artworks and the resolver quotes one of them
- **THEN** the rows the zone queries return SHALL be only generic zones and zones of that artwork

#### Scenario: The result is unchanged
- **WHEN** a product has both a product-specific zone and a generic zone for the same method, and another product of the same seller has its own zone for that method
- **THEN** the resolver SHALL return the product-specific zone's cost, exactly as before the restriction, since `applyProductPriority` already discarded the other product's zone

#### Scenario: The zone query never searches postal codes by province
- **WHEN** the query plan of every statement the resolver issues is inspected with `EXPLAIN QUERY PLAN`
- **THEN** no step SHALL use `idx_postal_codes_province_country`, and the zone query SHALL contain no reference to the `postal_codes` table

#### Scenario: Province ref matches the destination's province
- **WHEN** a zone carries a `province` ref to `Madrid` and the destination is `ES` / `28001`
- **THEN** the zone SHALL apply, and SHALL NOT apply to `ES` / `35001`

#### Scenario: Postal code ref matches only that postal code
- **WHEN** a zone carries a `postal_code` ref to the `postal_codes` row of `28001`
- **THEN** the zone SHALL apply to `ES` / `28001` and SHALL NOT apply to `ES` / `08001`

#### Scenario: Country ref matches any postal code of that country
- **WHEN** a zone carries a `country` ref to `ES`
- **THEN** the zone SHALL apply to any postal code that exists in `postal_codes` with country `ES`

#### Scenario: Country-wide zone matches any destination in its country
- **WHEN** a zone carries no postal refs
- **THEN** the zone SHALL apply to every postal code of its country, including one absent from `postal_codes`

#### Scenario: Unknown postal code only gets country-wide zones
- **WHEN** the destination postal code does not exist in `postal_codes`
- **THEN** only zones without postal refs SHALL apply

#### Scenario: Draw deliverability uses the same predicate
- **WHEN** a buyer validates a postal code for a draw via `POST /api/draws/:id/validate-postal-code`
- **THEN** the check SHALL use the resolver's destination predicate, SHALL NOT search `postal_codes` by province, and SHALL keep answering only whether the product can be delivered, without a cost
