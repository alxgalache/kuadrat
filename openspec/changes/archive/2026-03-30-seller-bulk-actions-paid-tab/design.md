## Context

The seller orders page (`/seller/pedidos`) currently allows scheduling pickups and consulting service points per individual order card. Sellers with multiple paid orders from the same carrier must repeat the process for each order. The page also lacks carrier information on order cards.

The existing backend endpoint `POST /seller/orders/:orderId/pickup` handles single-order pickups. The Sendcloud `/v3/pickups` API supports multiple items in a single request, making bulk pickup feasible. The `ServicePointsInfoModal` already accepts carrier/country/postalCode as props, so it can be reused directly.

## Goals / Non-Goals

**Goals:**
- Allow sellers to schedule a single Sendcloud pickup covering multiple paid orders for the same carrier
- Allow sellers to consult service points by carrier without needing to open a specific order
- Display carrier name on each order card for quick identification
- Reuse existing modal components and patterns where possible

**Non-Goals:**
- Cross-carrier bulk pickups (each pickup is carrier-specific per Sendcloud API constraints)
- Modifying the per-order pickup flow (existing PickupModal remains unchanged)
- Adding pickup scheduling for non-"Pagados" tabs
- Carrier name mapping/translation (display raw carrier codes as-is, formatted with capitalize)

## Decisions

### 1. Bulk pickup: new endpoint vs. reusing existing

**Decision**: Create a new `POST /seller/orders/bulk-pickup` endpoint.

**Rationale**: The existing `/orders/:orderId/pickup` validates against a single order and stores one `order_id` in `sendcloud_pickups`. A bulk operation needs to validate multiple orders, aggregate weights, and store pickup records for each order. Modifying the existing endpoint would break the single-order flow's simplicity.

**Alternative considered**: Calling the existing endpoint in a loop from the frontend. Rejected because it would create multiple Sendcloud pickups instead of one, defeating the purpose.

### 2. Database: one pickup row per order vs. shared pickup ID

**Decision**: Create one `sendcloud_pickups` row per order involved in the bulk pickup, all sharing the same `sendcloud_pickup_id`.

**Rationale**: The existing query in `getSellerOrders` looks up pickups by `order_id`. Changing this to a many-to-many table would require schema changes and query rewrites. Inserting multiple rows with the same `sendcloud_pickup_id` preserves backward compatibility — the seller orders page already checks `order.pickup !== null` to determine if pickup was scheduled.

### 3. BulkPickupModal: new component vs. extending PickupModal

**Decision**: Create a new `BulkPickupModal` component that reuses the address/time-slot form pattern from `PickupModal` but adds carrier selection and order selection steps.

**Rationale**: The bulk modal has a multi-step flow (select carrier → select orders → fill address form) that differs significantly from the simple single-form PickupModal. Extending PickupModal would add complexity to both flows.

### 4. BulkServicePointsModal: wrapper approach

**Decision**: Create a thin `BulkServicePointsModal` that wraps a carrier select dropdown and renders `ServicePointsInfoModal` inline after selection.

**Rationale**: The service points display logic is identical regardless of whether it's triggered from an order card or the global action. Only the carrier selection mechanism differs. Embedding the existing modal's content avoids duplication.

### 5. Carrier extraction from orders

**Decision**: Extract unique carrier codes from the currently loaded `orders` array on the frontend. No additional API call needed.

**Rationale**: The `getSellerOrders` response already includes `sendcloudCarrierCode` on each item. Filtering unique carriers from the current page's orders is trivial and avoids an extra backend roundtrip.

### 6. Carrier display name

**Decision**: Display the carrier code with CSS `capitalize` (e.g., "correos" → "Correos"). No carrier name mapping table.

**Rationale**: Sendcloud carrier codes are lowercase versions of the carrier name (e.g., `correos`, `correos_express`, `dhl`). Capitalizing and replacing underscores with spaces produces readable names. A full mapping table would require maintenance and external data fetching.

### 7. Items aggregation in Sendcloud pickup request

**Decision**: The bulk pickup request aggregates all selected orders' items into the `items` array. Each order contributes one item entry with `quantity: 1`, `container_type: "parcel"`, and the order's total weight. The `quantity` field at the top level reflects the total number of parcels.

**Rationale**: Sendcloud's pickup API `items` array represents physical parcels to be picked up. Each order is one parcel. The `quantity` top-level field is the total parcel count.

## Risks / Trade-offs

- **[Risk] Sendcloud pickup API may reject too many items** → Mitigation: The UI does not impose a hard limit but the Sendcloud API may. Errors will be surfaced to the user via the modal's error state.
- **[Risk] Partial failure: some orders' status updated, others not** → Mitigation: Since Sendcloud creates the pickup atomically, we only update order statuses after a successful Sendcloud response. All status updates are done in sequence — if one fails, remaining orders won't be updated but the pickup exists. This is acceptable since the scheduler can reconcile.
- **[Trade-off] Duplicate pickup rows share `sendcloud_pickup_id`** → This is denormalized but preserves backward compatibility with existing pickup lookup queries. If pickup management becomes more complex, a `sendcloud_pickup_orders` junction table could be introduced later.
- **[Trade-off] Carrier list comes from current page only** → If orders are paginated, carriers from other pages won't appear. Acceptable because the "Pagados" tab typically has a manageable number of orders, and the global actions operate on visible orders only.
