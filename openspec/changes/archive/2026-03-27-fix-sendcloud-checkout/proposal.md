## Why

The Sendcloud shipping integration (from the `add-sendcloud` change) has three categories of bugs discovered during testing that prevent the checkout flow from working correctly. The legacy ShippingSelectionModal is shown even when Sendcloud is enabled, a React setState-during-render error crashes the address form, and the ShippingStep component never renders results due to a wrong data access path. These must be fixed before Sendcloud shipping can be used in production.

## What Changes

- **Skip legacy ShippingSelectionModal for Sendcloud-enabled product types**: When `SENDCLOUD_ENABLED_ART` or `SENDCLOUD_ENABLED_OTHERS` is true, product detail pages add items to cart without shipping info and without opening the modal. Shipping is deferred to Step 3 of the checkout drawer.
- **Show "shipping pending" message in cart Step 1**: Items added via Sendcloud flow (no shipping info) display "Envío: se calculará en el siguiente paso" instead of shipping details. They are excluded from shipping cost totals at this stage.
- **Fix React setState-during-render error**: Move `clearShippingSelections()` call out of the `setDeliveryAddressRaw` state updater and into a `useEffect` that watches address field changes.
- **Fix ShippingStep data access**: Change `res.data?.sellers` to `res.sellers` to match the `apiRequest()` return format.
- **Surface partial errors in shipping options**: When Sendcloud API fails for a seller but pickup is available, show a warning message alongside the pickup option. Add `deliveryError` flag per seller in the backend response.
- **Validate `first_mile` enum value**: Prevent invalid `first_mile` values from being sent to the Sendcloud API by validating against the allowed enum before including in the request.

## Capabilities

### New Capabilities

- `sendcloud-checkout-bugfixes`: Fixes to the Sendcloud checkout flow covering product page add-to-cart behavior, cart drawer shipping display, React state management, API response parsing, partial error handling, and input validation.

### Modified Capabilities

(none — these are implementation bug fixes within the existing `sendcloud-checkout-shipping` capability, not requirement changes)

## Impact

- **Frontend product pages**: `ArtProductDetail.js`, `OthersProductDetail.js` — conditional logic for Sendcloud-enabled product types
- **Frontend cart drawer**: `ShoppingCartDrawer.js` — cart item rendering, order summary, checkout button validation
- **Frontend shipping step**: `ShippingStep.js` — API response parsing fix
- **Frontend shipping group**: `SellerShippingGroup.js` — partial error display
- **Backend shipping controller**: `shippingOptionsController.js` — per-seller error flag in response
- **Backend Sendcloud provider**: `sendcloudProvider.js` — `first_mile` enum validation
