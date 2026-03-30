## Context

The checkout drawer (ShoppingCartDrawer) has a shipping step (Step 3) where buyers choose shipping per seller. When a delivery option has `requiresServicePoint: true`, the current `ServicePointSelector` component renders an inline scrollable list of service points inside the `SellerShippingGroup`. It shows name, address, and distance — but no map, no opening hours, and no explicit confirmation step. The Sendcloud API response includes latitude/longitude and `formatted_opening_times` that are unused.

The `AddressAutocomplete` component already loads the Google Maps JavaScript API via a script tag singleton pattern using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, with the `places` library. This key and script loader can be reused for the service point map.

## Goals / Non-Goals

**Goals:**
- Replace the inline service point list with a full overlay inside the drawer showing a map + list
- Display service points as map markers with bidirectional selection (map ↔ list)
- Show opening hours from Sendcloud's `formatted_opening_times` in each list card
- Require explicit confirmation via an "Aceptar" button before the selection takes effect
- Reuse the existing Google Maps API key and script loading pattern

**Non-Goals:**
- Backend changes — the existing `GET /api/shipping/service-points` endpoint already returns all needed data
- Changing how `servicePointId` flows through CartContext → order creation → Sendcloud
- Supporting alternative map providers (Leaflet, Mapbox) — Google Maps is already in use
- Geolocation / "use my current location" feature
- Custom map styling or branding

## Decisions

### 1. Google Maps via script tag (reuse existing pattern)

Reuse the singleton script loader from `AddressAutocomplete.js`. Extract the script-loading logic into a shared utility (`client/lib/googleMaps.js`) so both `AddressAutocomplete` and the new overlay can load Google Maps without duplicating the script management code.

**Why not a React wrapper package** (e.g., `@react-google-maps/api`): Adding a new dependency for a single map instance is unnecessary. The vanilla JS API with `useRef` + `useEffect` is straightforward and matches the existing pattern.

**Why not Leaflet/OpenStreetMap**: Google Maps is already loaded and paid for; introducing a second map provider adds complexity for no user benefit.

### 2. Overlay within the drawer (absolute positioned, not a portal)

The overlay SHALL be an `absolute`-positioned div inside the drawer container, covering the full drawer area with a semi-transparent backdrop. This keeps it contained within the drawer's scroll and z-index context.

**Why not a portal/modal**: The requirement specifies the overlay must stay within the drawer bounds. A portal would render outside the drawer, requiring extra work to constrain positioning.

### 3. Rewrite `ServicePointSelector.js` as the overlay component

Replace the existing `ServicePointSelector` component entirely. It already owns the service point fetching and selection logic — the change is to its rendering (overlay with map + list instead of inline list).

**Why not a new component**: The old one would be dead code. Rewriting in-place avoids import changes in `SellerShippingGroup`.

### 4. `SellerShippingGroup` opens overlay instead of inline expansion

When a `requiresServicePoint` option is selected, `SellerShippingGroup` will set state to show the `ServicePointSelector` overlay. The overlay receives an `onConfirm(servicePoint)` callback that fires when the user clicks "Aceptar", at which point the shipping selection is finalized.

The `onClose` callback fires when the user dismisses without confirming, reverting to no service point selected for that option.

### 5. Map renders with markers using AdvancedMarkerElement

Use `google.maps.Map` for the map and `google.maps.marker.AdvancedMarkerElement` (or fallback to `google.maps.Marker` if the `marker` library isn't available) for the pins. Center the map on the first service point's coordinates. When a marker is clicked, scroll the corresponding list card into view and highlight it. When a list card is clicked, pan the map to that marker.

The `places` library is already loaded. The `marker` library will be added to the script URL parameter; if unavailable, fallback to the legacy `Marker` API.

### 6. Opening hours display

Parse Sendcloud's `formatted_opening_times` (keyed 0-6 for Monday-Sunday). Show today's hours prominently (e.g., "Hoy: 09:30 - 15:00, 17:00 - 20:30") and make full weekly hours expandable. If today has no hours, show "Hoy: Cerrado".

## Risks / Trade-offs

- **Google Maps API cost** → The map is only loaded when the buyer selects a service-point option, not on every checkout. Usage should be minimal. No mitigation needed.
- **Script loading race** → If `AddressAutocomplete` has already loaded the script, the overlay reuses it. If not, it triggers the load. The shared singleton pattern handles this. Mitigation: extract to shared utility.
- **Mobile drawer space** → The overlay takes the full drawer area. On small screens the map + list may feel cramped. Mitigation: the map takes ~40% of the height, list takes ~60%, both scrollable/zoomable.
- **Sendcloud response size** → The endpoint can return many service points. Mitigation: limit display to the first 20 results (the API typically returns a manageable number within the radius).
