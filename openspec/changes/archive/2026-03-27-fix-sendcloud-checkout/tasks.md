## 1. Backend: Sendcloud provider input validation

- [x] 1.1 Validate `first_mile` against allowed enum (`'pickup'`, `'dropoff'`, `'pickup_dropoff'`, `'fulfilment'`) in `buildFunctionalities()` at `api/services/shipping/sendcloudProvider.js`. Log a warning and skip invalid values.

## 2. Backend: Per-seller delivery error flag

- [x] 2.1 Add `deliveryError` field (string or null) to each seller object in the response of `api/controllers/shippingOptionsController.js`. Set it to the error message when Sendcloud API fails for a seller's delivery options.

## 3. Frontend: Fix ShippingStep API response parsing

- [x] 3.1 Fix `res.data?.sellers` → `res.sellers` in `client/components/shipping/ShippingStep.js` line 48.

## 4. Frontend: SellerShippingGroup partial error display

- [x] 4.1 Update `client/components/shipping/SellerShippingGroup.js` to accept and display `deliveryError` from the seller object. Show a warning message when `deliveryOptions` is empty and `deliveryError` is set, while still rendering the pickup option.

## 5. Frontend: Product detail pages skip modal when Sendcloud enabled

- [x] 5.1 Update `client/app/galeria/p/[id]/ArtProductDetail.js`: import `SENDCLOUD_ENABLED_ART` from constants. When true, `handleAddToCart` adds to cart with `shipping: null` and shows banner — no ShippingSelectionModal.
- [x] 5.2 Update `client/app/tienda/p/[id]/OthersProductDetail.js`: import `SENDCLOUD_ENABLED_OTHERS` from constants. When true, `handleAddToCart` adds to cart with `shipping: null` and shows banner — no ShippingSelectionModal.

## 6. Frontend: Cart drawer Step 1 handles Sendcloud items

- [x] 6.1 Update cart item rendering in `client/components/ShoppingCartDrawer.js` to show "Envío: se calculará en el siguiente paso" for Sendcloud-enabled items with `shipping: null`.
- [x] 6.2 Update the "Completar pedido" button validation in `ShoppingCartDrawer.js` to allow Sendcloud items without shipping (only require `item.shipping` for legacy items when `SENDCLOUD_ENABLED` is false for that product type).
- [x] 6.3 Update the order summary in `ShoppingCartDrawer.js` Step 1 to exclude Sendcloud items (no shipping yet) from shipping cost totals and breakdown.

## 7. Frontend: Fix React setState-during-render error

- [x] 7.1 In `client/components/ShoppingCartDrawer.js`, remove `clearShippingSelections()` from inside the `setDeliveryAddressRaw` state updater. Revert `setDeliveryAddress` to a plain setter.
- [x] 7.2 Add a `useEffect` in `ShoppingCartDrawer.js` that watches `deliveryAddress.country`, `deliveryAddress.postalCode`, and `deliveryAddress.city` and calls `clearShippingSelections()` when they change (guarded by `SENDCLOUD_ENABLED`). Use a ref to track previous values and skip the initial mount.
