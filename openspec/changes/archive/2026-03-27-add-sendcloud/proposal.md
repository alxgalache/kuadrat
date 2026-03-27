## Why

The current shipping system is manual and decentralized — the admin configures shipping methods/zones/prices per seller in the database, buyers select shipping per product at add-to-cart time without knowing rates tied to their destination, and sellers manually manage order status transitions. Integrating Sendcloud replaces this with automated, carrier-backed shipping: real-time rate calculation at checkout based on actual destination, automatic label generation after payment, and webhook-driven status tracking. This enables accurate shipping costs, professional logistics, and reduces manual seller burden.

## What Changes

- **Shipping provider abstraction**: New service layer with a `ShippingProviderFactory` that selects between `LegacyProvider` (current system) and `SendcloudProvider` based on product type (`art`/`others`) and env configuration. Both providers implement the same interface (`getDeliveryOptions`, `createShipment`, `getShipmentStatus`, `cancelShipment`).
- **Per-seller Sendcloud configuration**: New `user_sendcloud_configuration` table storing each seller's sender address, shipping preferences (signature, fragile goods, insurance, first mile), carrier preferences, customs defaults, and operational flags.
- **New checkout step**: A "Shipping Selection" step (step 3) added to the `ShoppingCartDrawer` between address entry and payment. Displays shipping options per seller group with rates from Sendcloud, includes seller pickup option, and supports Sendcloud service point selection.
- **Parcel grouping logic**: Art products always ship as separate parcels. Others products gain a `can_copack` field — co-packable items from the same seller are aggregated into one parcel (summed weight); non-co-packable items ship individually. Multiple parcels per seller use multicollo when carrier supports it.
- **Post-payment shipment creation**: After Stripe payment confirmation, automatically create Sendcloud shipments (one per seller per parcel group), generating labels for sellers to download.
- **Webhook-driven status tracking**: New endpoint receives Sendcloud status webhooks, maps Sendcloud statuses to the internal order lifecycle (`paid → sent → arrived → confirmed`), and updates order items automatically.
- **Auto-confirm with timer**: A scheduled job auto-confirms delivery after X days (configurable) if the buyer doesn't dispute, triggering seller earnings credit.
- **Seller orders page**: New `/seller/pedidos/` page showing order status (read-only when Sendcloud-managed), tracking info, and label download.
- **Weight becomes mandatory**: When Sendcloud is enabled for a product type, weight is required at publish time (Sendcloud needs it for rate calculation).
- **Service points**: Buyers can select Sendcloud service points (carrier pickup locations) as a delivery option during checkout.
- **Admin UI conditional visibility**: The legacy `/admin/envios/` shipping configuration pages are hidden when Sendcloud is active for the relevant product type.

## Capabilities

### New Capabilities

- `sendcloud-provider`: Sendcloud API integration service — wraps shipping-options, shipment creation, webhook handling, service points, and label retrieval. Includes the provider abstraction layer (`ShippingProviderFactory`, `LegacyProvider`, `SendcloudProvider` interface).
- `sendcloud-seller-config`: Per-seller Sendcloud configuration management — DB table, admin CRUD UI, and API endpoints for managing sender addresses, shipping preferences, carrier preferences, and customs defaults.
- `sendcloud-checkout-shipping`: New checkout shipping selection step in the cart drawer — fetches and displays per-seller delivery options (Sendcloud rates, service points, seller pickup), handles parcel grouping logic (art=separate, others=co-packable), and validates selections before payment.
- `sendcloud-shipment-lifecycle`: Post-payment shipment creation, webhook status tracking, Sendcloud-to-internal status mapping, and auto-confirm scheduler. Covers the full lifecycle from payment to delivery confirmation.
- `sendcloud-seller-orders`: Seller-facing orders page showing Sendcloud-managed order status, tracking info, and label download. Read-only status when Sendcloud is active.

### Modified Capabilities

- `order-status-tracking`: Order status transitions now have a dual source — manual (legacy) and webhook-driven (Sendcloud). The auto-confirm timer adds a new automated transition from `arrived` to `confirmed`.

## Impact

- **Backend**: New service files (`sendcloudService.js`, `shippingProviderFactory.js`, `legacyProvider.js`, `sendcloudProvider.js`), new routes (`/shipping/options`, `/shipping/service-points`, `/shipping/webhook`, `/seller/orders`), new scheduler job, new DB table (`user_sendcloud_configuration`), schema changes to `others` table (`can_copack`), new env vars (`SENDCLOUD_API_KEY`, `SENDCLOUD_API_SECRET`, `SENDCLOUD_ENABLED_ART`, `SENDCLOUD_ENABLED_OTHERS`, `SENDCLOUD_AUTO_CONFIRM_DAYS`).
- **Frontend**: Major changes to `ShoppingCartDrawer.js` (new step 3), new components (service point selector, per-seller shipping options), new seller page (`/seller/pedidos/`), conditional rendering in admin shipping pages, weight validation changes in seller publish form.
- **Database**: New `user_sendcloud_configuration` table, `can_copack` column on `others` table, `sendcloud_shipment_id` and `sendcloud_tracking_url` columns on `order_items` table.
- **External dependencies**: Sendcloud API (v3 shipping-options, v3 shipments, v2 service-points, webhook event subscriptions).
- **Existing flows**: The Stripe webhook handler (`processOrderConfirmation`) gains a new step for Sendcloud shipment creation. The `CartContext` needs to manage shipping selections per seller. The seller publish form validation changes when Sendcloud is enabled.
