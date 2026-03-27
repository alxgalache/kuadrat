## Context

The current shipping system uses admin-configured shipping methods, zones, and postal code rules stored in the database. Buyers select shipping per product via `ShippingSelectionModal` at add-to-cart time (Step 1 in `ShoppingCartDrawer`), before entering their address. Sellers manually manage order status transitions. Shipping rates are static, configured per zone.

Sendcloud provides carrier-backed shipping with real-time rate calculation, label generation, and webhook-driven tracking. The integration must coexist with the legacy system via a provider abstraction, as art products may need the legacy flow in some cases.

Key existing structures:
- `ShoppingCartDrawer.js`: 3-step flow (Cart → Address → Payment). Shipping selected per item in Step 1 via modal.
- `CartContext.js`: Cart items carry a `shipping` object with `methodId`, `methodType`, `cost`, `maxArticles`. `getShippingBreakdown()` groups by (sellerId, productType, methodId).
- `processOrderConfirmation()`: Runs after Stripe/Revolut webhook — marks order paid, updates inventory, sends confirmation email. This is the insertion point for Sendcloud shipment creation.
- `art_order_items` / `other_order_items` tables: Already have `tracking TEXT` and `status TEXT` columns with `status_modified` timestamp.
- `auctionScheduler.js`: Cron pattern using `node-cron` with 30-second intervals, error handling per item.
- `api/config/env.js`: Uses `required()`, `optional()`, `optionalBool()`, `optionalInt()` helpers.

## Goals / Non-Goals

**Goals:**
- Real-time shipping rate calculation based on buyer's actual destination address
- Automatic label generation after payment for sellers to download
- Webhook-driven order status tracking (no manual seller intervention for status)
- Provider abstraction allowing per-product-type switching between legacy and Sendcloud
- Service point selection (carrier pickup locations) at checkout
- Seller pickup option preserved alongside Sendcloud options
- Auto-confirm delivery after configurable X days (crediting seller earnings)
- Per-seller Sendcloud configuration (sender address, shipping preferences, customs)
- Co-packable field for `others` products to control parcel grouping

**Non-Goals:**
- Return shipment integration (future)
- Sendcloud panel configuration automation (admin configures manually)
- Carrier pickup scheduling via Sendcloud API (sellers handle physically)
- Abstracting the admin shipping UI (legacy pages show/hide based on provider flag)
- Dark mode or i18n beyond es-ES
- Migration of existing orders/sellers (test environment — clean slate)

## Decisions

### 1. Provider Abstraction Architecture

**Decision**: Service-layer abstraction with a factory pattern. The frontend calls the same API endpoints regardless of provider; the backend selects the implementation via `ShippingProviderFactory`.

**Alternatives considered**:
- *Env var toggle with if/else branches*: Simpler initially but creates spaghetti across 15+ files. Rejected for maintainability.
- *Hard cutover*: Simplest code but no rollback. Rejected because art logistics may need legacy fallback.
- *Database flag per product*: Adds runtime flexibility but same dual-path burden. Unnecessary since per-product-type granularity via env vars suffices.

**Implementation**:

```
api/services/shipping/
├── shippingProviderFactory.js    — getProvider(productType) → provider instance
├── legacyProvider.js             — wraps current DB-based shipping logic
├── sendcloudProvider.js          — wraps Sendcloud API calls
└── sendcloudApiClient.js         — low-level HTTP client for Sendcloud API
```

Interface methods:
- `getDeliveryOptions({ sellerId, items, buyerAddress })` → normalized options array
- `getServicePoints({ carrier, country, postalCode })` → service points array (Sendcloud only; legacy returns empty)
- `createShipments({ order, itemGroups })` → shipment results with IDs and label URLs
- `getShipmentStatus(shipmentId)` → status object
- `cancelShipment(shipmentId)` → boolean
- `handleWebhook(payload)` → status update instructions

Both providers return the same normalized response shape so the frontend/controllers don't branch.

### 2. Checkout Flow Restructure — New Step 3

**Decision**: Insert a "Shipping Selection" step between Address (current step 2) and Payment (current step 3). The ShoppingCartDrawer becomes a 4-step flow.

**Alternatives considered**:
- *Keep shipping in Step 1 (per-item modal)*: Doesn't work with Sendcloud because rates require destination address (entered in Step 2). Rejected.
- *Combine shipping selection with address step*: Too crowded, especially with multiple sellers and service points. Rejected.

**Implementation**:

```
Step 1: Cart Review (items, quantities — NO shipping selection)
Step 2: Address & Personal Info (delivery address, invoicing address)
Step 3: Shipping Selection (NEW — per-seller groups with options from provider)
Step 4: Payment (Stripe/Revolut — moved from current Step 3)
```

Flow details:
- Step 2 → 3 transition: API call `POST /api/shipping/options` with cart items + buyer address. Backend groups items per seller, calls provider per group, returns normalized options.
- Step 3 state: `shippingSelections` object keyed by sellerId → `{ optionId, type, servicePointId?, cost }`. Button disabled until all sellers have a selection.
- Step 3 → 4: Shipping selections stored in CartContext. Total recalculated.
- If buyer goes back to Step 2 and changes address: shipping selections are **cleared** and must be re-selected.

The legacy `ShippingSelectionModal` is retained for the legacy provider path. When legacy is active for a product type, the old per-item modal flow continues in Step 1 and Step 3 is skipped for those items.

### 3. Parcel Grouping Strategy

**Decision**: Art products = always separate parcels (one per piece). Others products = grouped by co-packability.

**Rationale**: Art pieces are unique, fragile, and differently sized — combining them in one parcel makes no physical sense. Merchandise (others) can often be combined.

**Implementation**:

```
Per seller in cart:
├── Art items → each becomes its own parcel (own weight, own dimensions)
└── Other items
    ├── Co-packable (can_copack=1) → aggregate into one parcel (summed weight)
    └── Non-co-packable (can_copack=0) → each becomes its own parcel
```

For the co-packable aggregate parcel, only weight is summed. Dimensions are NOT sent to Sendcloud (weight-only rate calculation). This avoids the unsolvable dimension aggregation problem and works because Sendcloud accepts weight without dimensions.

For individual parcels (art, non-co-packable), both weight and dimensions are sent if available.

Rate display: One shipping method selected per seller. Total cost = sum of all parcel rates for that method. Displayed as: "SEUR Standard — 15.80€ (7.90€ × 2 bultos)".

### 4. Sendcloud API Endpoints Used

**Decision**: Use V3 `POST /v3/shipping-options` for rate queries and `POST /v3/shipments/announce` for shipment creation. Use V2 `GET /service-points` for service point search.

**Rationale**: V3 shipping-options supports multi-parcel in a single request (the `parcels` array) and returns quotes with `calculate_quotes: true`. V3 shipments/announce is synchronous and returns labels immediately. Service points are only available via V2.

**Rate query** (`POST /v3/shipping-options`):
```json
{
  "from_country_code": "<seller_config.sender_country>",
  "from_postal_code": "<seller_config.sender_postal_code>",
  "to_country_code": "<buyer.country>",
  "to_postal_code": "<buyer.postalCode>",
  "parcels": [
    { "weight": { "value": "3", "unit": "kg" }, "dimensions": {...} }
  ],
  "functionalities": {
    "signature": "<seller_config.require_signature>",
    "fragile_goods": "<seller_config.fragile_goods>",
    "first_mile": "<seller_config.first_mile>"
  },
  "calculate_quotes": true
}
```

**Shipment creation** (`POST /v3/shipments/announce`):
```json
{
  "from_address": { "<seller_config.sender_*>" },
  "to_address": { "<buyer address>" },
  "ship_with": {
    "type": "shipping_option_code",
    "properties": { "shipping_option_code": "<selected_option>" }
  },
  "order_number": "<kuadrat_order_id>",
  "parcels": [{ "weight": {...}, "parcel_items": [...] }]
}
```

**Service points** (`GET /v2/service-points`):
```
?country=ES&carrier=<carrier_code>&postal_code=<buyer_postal>&radius=5000
```

### 5. Webhook Status Mapping

**Decision**: Use Sendcloud Event Subscriptions (V3) for push-based status updates. Map Sendcloud numeric statuses to internal lifecycle. Add auto-confirm scheduler.

**Status mapping**:

| Sendcloud Status | Code | Internal Status | Action |
|--|--|--|--|
| Ready to send | 1000 | paid | Initial state after shipment creation |
| Being announced | 1001 | paid | No change |
| En route to sorting center | 3 | sent | Email buyer "pedido enviado" |
| Delivered to carrier / sorting | 11, 62, 91 | sent | No change (already sent) |
| Out for delivery | 21 | sent | No change |
| Delivered | 11 (final) | arrived | Start X-day auto-confirm timer |
| Delivery attempt failed | 80 | sent | Notify admin |
| Cancelled | 2000 | — | Alert admin, manual handling |

**Auto-confirm scheduler**: New `api/scheduler/confirmationScheduler.js` using the same `node-cron` pattern. Runs every hour (not every 30s — less urgency than auctions).

```javascript
// Every hour: find arrived items past the auto-confirm window
cron.schedule('0 * * * *', async () => {
  const cutoff = new Date(Date.now() - config.sendcloud.autoConfirmDays * 86400000)
  const items = await db.execute({
    sql: `SELECT id, order_id, seller_id FROM art_order_items
          WHERE status = 'arrived' AND status_modified <= ?
          UNION ALL
          SELECT id, order_id, seller_id FROM other_order_items
          WHERE status = 'arrived' AND status_modified <= ?`,
    args: [cutoff.toISOString(), cutoff.toISOString()]
  })
  // For each: update to 'confirmed', increment seller available_withdrawal
})
```

### 6. Database Schema Changes

**Decision**: Add `user_sendcloud_configuration` table, `can_copack` to `others`, and `sendcloud_shipment_id` + `sendcloud_tracking_url` to both order_items tables.

**New table** `user_sendcloud_configuration`:
```sql
CREATE TABLE IF NOT EXISTS user_sendcloud_configuration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  sender_name TEXT,
  sender_company_name TEXT,
  sender_address_1 TEXT,
  sender_address_2 TEXT,
  sender_house_number TEXT,
  sender_city TEXT,
  sender_postal_code TEXT,
  sender_country TEXT DEFAULT 'ES',
  sender_phone TEXT,
  sender_email TEXT,
  require_signature INTEGER NOT NULL DEFAULT 0,
  fragile_goods INTEGER NOT NULL DEFAULT 0,
  insurance_type TEXT NOT NULL DEFAULT 'none'
    CHECK(insurance_type IN ('none', 'full_value', 'fixed')),
  insurance_fixed_amount REAL,
  first_mile TEXT NOT NULL DEFAULT 'drop_off'
    CHECK(first_mile IN ('drop_off', 'collection')),
  preferred_carriers TEXT,
  excluded_carriers TEXT,
  default_hs_code TEXT,
  origin_country TEXT DEFAULT 'ES',
  vat_number TEXT,
  eori_number TEXT,
  self_packs INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

**Modified tables**:
- `others`: Add `can_copack INTEGER NOT NULL DEFAULT 1`
- `art_order_items`: Add `sendcloud_shipment_id TEXT`, `sendcloud_tracking_url TEXT`
- `other_order_items`: Add `sendcloud_shipment_id TEXT`, `sendcloud_tracking_url TEXT`

### 7. Env Vars

**Decision**: Add to `api/config/env.js` under a `sendcloud` group:

```javascript
sendcloud: {
  apiKey: optional('SENDCLOUD_API_KEY', ''),
  apiSecret: optional('SENDCLOUD_API_SECRET', ''),
  webhookSecret: optional('SENDCLOUD_WEBHOOK_SECRET', ''),
  enabledArt: optionalBool('SENDCLOUD_ENABLED_ART', false),
  enabledOthers: optionalBool('SENDCLOUD_ENABLED_OTHERS', false),
  autoConfirmDays: optionalInt('SENDCLOUD_AUTO_CONFIRM_DAYS', 14),
},
```

### 8. Frontend Shipping Data Shape in CartContext

**Decision**: Replace the per-item `shipping` object with a per-seller `shippingSelections` map managed in Step 3. Items in the cart no longer carry individual shipping objects when Sendcloud is active.

**New CartContext state**:
```javascript
// shippingSelections: { [sellerId]: { optionId, type, cost, carrier, servicePointId?, ... } }
// This replaces per-item shipping for Sendcloud-managed items.
// Legacy items still use per-item shipping (backward compatible).
```

**Total calculation**: `getTotalShipping()` sums legacy per-item shipping + Sendcloud per-seller shipping selections.

### 9. Admin UI for Seller Sendcloud Configuration

**Decision**: Add a "Configuración de envío" section to the existing author edit page (`/admin/authors/[id]/edit`). No new admin page — it's a natural extension of the seller profile.

**Rationale**: The admin already manages all seller settings from this page (pickup address, bio, visibility). Adding Sendcloud configuration here keeps the workflow consistent.

### 10. Seller Orders Page

**Decision**: New page at `/seller/pedidos/` showing orders grouped by status. When Sendcloud is managing a shipment, status is read-only with tracking link and label download. When legacy, seller can update status manually (existing flow).

**Implementation**: New `client/app/seller/pedidos/page.js` with an API endpoint `GET /api/seller/orders` that joins order items with Sendcloud data.

### 11. Service Points in Checkout

**Decision**: When a buyer selects a service-point delivery option in Step 3, a secondary selector appears showing nearby service points from Sendcloud's API. The buyer must select a specific service point before proceeding.

**Flow**:
1. Delivery options from `POST /v3/shipping-options` include service-point-type options
2. Buyer clicks a service-point option → triggers `GET /api/shipping/service-points?carrier=X&country=ES&postalCode=Y`
3. Backend proxies to Sendcloud `GET /v2/service-points`
4. Frontend displays list with name, address, opening hours, distance
5. Buyer selects one → stored in `shippingSelections[sellerId].servicePointId`
6. On shipment creation, `to_service_point: servicePointId` is included in the API call

### 12. Weight Enforcement

**Decision**: When Sendcloud is enabled for a product type, weight becomes mandatory at publish time. Validation is enforced both client-side (in the seller publish form) and server-side (in the product creation API route).

**Existing products without weight**: Cannot be purchased through the Sendcloud flow. The shipping options API will return an error for products missing weight, and the checkout will display a message. The admin must add weight to these products.

## Risks / Trade-offs

- **[Sendcloud API latency at checkout]** → Step 3 makes multiple API calls to Sendcloud (one per seller for rates, potentially more for service points). Mitigated by: parallel requests per seller from backend, loading skeletons per seller group in UI, 10-second timeout with graceful fallback message.

- **[Rate mismatch between checkout and shipment creation]** → Sendcloud rates can change between Step 3 (buyer sees rate) and post-payment shipment creation. Mitigated by: storing the `shipping_option_code` from the selected option and using it in `ship_with` during creation. The rate is informational; the shipment uses the current rate. Any discrepancy is absorbed by the platform (expected to be rare and small).

- **[Dual cart data model]** → Legacy items use per-item `shipping` objects; Sendcloud items use per-seller `shippingSelections`. This creates two parallel shipping data paths in CartContext. Mitigated by: clear separation via `productType` checks, and `getTotalShipping()` aggregates both paths transparently. Complexity is contained in CartContext.

- **[Webhook reliability]** → If Sendcloud webhooks fail to deliver, order status gets stuck. Mitigated by: the auto-confirm scheduler acts as a fallback (items auto-confirm after X days regardless). Additionally, a manual status override remains available to the admin.

- **[Seller Sendcloud config incomplete]** → If a seller doesn't have Sendcloud configuration (sender address), shipment creation will fail. Mitigated by: validation at checkout time — the shipping options API checks for valid seller config and returns an error if missing, preventing checkout from proceeding.

## Open Questions

- **Sendcloud `configuration_id`**: The V3 checkout delivery-options endpoint requires a `configuration_id` created in the Sendcloud panel. Need to confirm whether `POST /v3/shipping-options` (used in this design) also requires one, or if it works with just API credentials. Based on the Postman collection, `/v3/shipping-options` does NOT require a `configuration_id` — it works with `from/to` + `parcels` + `functionalities`. This is confirmed as the right endpoint.

- **Multicollo implementation**: When a seller has multiple non-co-packable `others` items, should they be created as a multicollo shipment (linked parcels, single tracking) or separate shipments? Initial implementation will use separate shipments per parcel for simplicity. Multicollo can be added later if carrier support is confirmed.

- **Insurance value source**: For `insurance_type: 'full_value'`, the insured value should be the product's sale price. For art, this is the `price` field. For others, it's `price × quantity`. Need to confirm this maps to `parcels[].additional_insured_price` in the Sendcloud API.
