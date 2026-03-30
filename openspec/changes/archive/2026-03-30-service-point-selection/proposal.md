## Why

When a buyer selects a service-point (pickup) shipping option in the checkout, the current `ServicePointSelector` displays a basic inline list of service points with minimal information (name, address, distance). There is no map view and no clear selection/confirmation UX. The user document requests an overlay experience inside the cart drawer — a map at the top with markers and a scrollable list below with radio-button cards and an "Aceptar" button — so the buyer can visually locate and confidently choose a pickup point. The selected service point ID must be persisted and sent to Sendcloud when creating the shipment.

## What Changes

- **Replace the inline `ServicePointSelector` component** with a full-screen overlay (within the drawer bounds) that includes:
  - A Google Maps view showing markers for all nearby service points
  - A scrollable list of service point cards with name, address, hours, and a radio button
  - Bidirectional selection: clicking a marker selects the card and vice versa
  - An "Aceptar" button (disabled until a point is selected) that confirms the choice and closes the overlay
- **Reuse the existing Google Maps API key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) already used in `AddressAutocomplete` for the Places API. The Maps JavaScript API with the `marker` library is sufficient — no additional API keys or packages needed.
- **Preserve existing data flow**: the selected `servicePointId` already propagates from `SellerShippingGroup` → `CartContext` → order creation → `sendcloudProvider.createShipments` (`to_service_point`). Only the selection UI changes.

## Capabilities

### New Capabilities
- `service-point-map-overlay`: Full overlay UI within the cart drawer for browsing and selecting service points on a map + list, with opening hours and bidirectional selection.

### Modified Capabilities
_(none — the existing `sendcloud-checkout-shipping` spec already defines the `servicePointId` storage and `requiresServicePoint` flag; this change only replaces the selector UI component)_

## Impact

- **Frontend components**: `client/components/shipping/ServicePointSelector.js` (rewrite), `client/components/shipping/SellerShippingGroup.js` (minor — trigger overlay instead of inline list)
- **Google Maps**: Additional Maps JavaScript API usage (map rendering, markers). The existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` must have the Maps JavaScript API enabled (it likely already does since `AddressAutocomplete` loads `maps.googleapis.com/maps/api/js`).
- **No backend changes**: The service points API endpoint (`GET /api/shipping/service-points`) and shipment creation flow remain unchanged.
- **No new dependencies**: Google Maps is loaded via script tag (same pattern as `AddressAutocomplete`). No npm packages needed.
