## 1. Shared Google Maps Utility

- [x] 1.1 Extract the Google Maps script loading logic from `client/components/AddressAutocomplete.js` into a shared utility at `client/lib/googleMaps.js`. Export a `loadGoogleMaps(libraries)` function that returns a Promise resolving when the script is loaded. Move the singleton flags (`googleMapsScriptLoading`, `googleMapsScriptLoaded`, `googleMapsCallbacks`) into this module.
- [x] 1.2 Update `client/components/AddressAutocomplete.js` to import and use `loadGoogleMaps` from `client/lib/googleMaps.js` instead of its inline script loading logic. Verify the autocomplete address flow still works.

## 2. Rewrite ServicePointSelector as Overlay

- [x] 2.1 Rewrite `client/components/shipping/ServicePointSelector.js` to render as a full overlay inside the drawer. Structure: absolute-positioned container with dimmed backdrop, header with title "Selecciona un punto de recogida" and close (X) button, map area (~40% height), scrollable list area (~60% height), and fixed "Aceptar" button at the bottom. Props: `{ carrier, country, postalCode, onConfirm, onClose, selectedId }`.
- [x] 2.2 Implement the Google Maps rendering inside the overlay using `loadGoogleMaps` from the shared utility. Create the map instance via `google.maps.Map` in a `useRef`/`useEffect`. Add markers for each service point using lat/lng from the Sendcloud response. Fit bounds to show all markers on initial render.
- [x] 2.3 Implement the service point list cards. Each card displays: name, street address (street + house_number), city + postal_code, today's opening hours parsed from `formatted_opening_times` (show "Hoy: Cerrado" if empty), and a radio button on the right side.
- [x] 2.4 Implement bidirectional selection: clicking a map marker selects the corresponding card (scroll into view, check radio), clicking a list card pans the map to the marker. Track selected service point in local state.
- [x] 2.5 Implement the "Aceptar" button: disabled when no service point is selected, calls `onConfirm(selectedServicePoint)` when clicked.
- [x] 2.6 Implement dismiss behavior: clicking the close (X) button or the backdrop calls `onClose()` without modifying the selection.
- [x] 2.7 Implement loading, error, and empty states: spinner while fetching service points, error message with retry, "No hay puntos de recogida disponibles en esta zona" when empty, graceful degradation (list without map) when Google Maps fails to load.

## 3. Update SellerShippingGroup Integration

- [x] 3.1 Update `client/components/shipping/SellerShippingGroup.js` to pass `onConfirm` and `onClose` callbacks to `ServicePointSelector` instead of the current `onSelect`. When `onConfirm` fires, call the existing `onSelect(sellerId, {...})` to finalize the shipping selection with the `servicePointId`. When `onClose` fires, revert `showServicePoints` state without changing the selection.

## 4. Verification

- [x] 4.1 Test the full flow: select a service-point delivery option → overlay opens → service points load on map and list → select a point via list → map pans → click "Aceptar" → overlay closes → selection is stored with `servicePointId` → proceed to payment → verify `servicePointId` is included in the order data.
- [x] 4.2 Test bidirectional selection: select via map marker → list card scrolls into view and is checked. Select via list card → map pans to marker.
- [x] 4.3 Test edge cases: dismiss overlay without selecting, Google Maps fails to load (list still works), no service points returned, API error with retry.
- [x] 4.4 Verify `AddressAutocomplete` still works correctly after the script loading extraction in task 1.2.
