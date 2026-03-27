## Context

The `add-sendcloud` change introduced a new 4-step checkout flow (Cart → Address → Shipping → Payment) to support Sendcloud-based shipping rate calculation. However, testing revealed that the product detail pages still trigger the legacy ShippingSelectionModal, the ShippingStep component never renders data due to wrong API response access, and a React state management bug crashes the address form.

The existing code has two parallel shipping flows: **legacy** (shipping selected per-item at add-to-cart time via ShippingSelectionModal) and **Sendcloud** (shipping selected per-seller at Step 3 via ShippingStep). The feature flags `SENDCLOUD_ENABLED_ART` and `SENDCLOUD_ENABLED_OTHERS` control which flow applies per product type.

## Goals / Non-Goals

**Goals:**
- Product detail pages correctly branch between legacy and Sendcloud flows based on feature flags
- Cart drawer Step 1 shows appropriate messaging for items without shipping info
- ShippingStep renders seller groups and options correctly
- Address form changes don't cause React errors
- Partial Sendcloud API failures still show available options (e.g., pickup)
- Invalid seller config values don't cause Sendcloud API 400 errors

**Non-Goals:**
- Changing the CartContext data model or localStorage schema
- Modifying the legacy shipping flow behavior
- Adding new Sendcloud API capabilities
- Changing the 4-step checkout flow structure

## Decisions

### 1. Sendcloud items added to cart without shipping

When Sendcloud is enabled for a product type, `handleAddToCart` in product detail pages will add items to cart with `shipping: null`. The ShippingSelectionModal will not be opened. This matches the design intent: shipping is determined at Step 3 after the buyer provides their address.

**Alternative considered:** Adding a placeholder shipping object — rejected because it would complicate total calculations and require special-casing throughout the cart logic.

### 2. Address change detection via useEffect instead of state updater

The current code calls `clearShippingSelections()` inside a `setDeliveryAddressRaw` updater function, which violates React's rule against calling setState on another component during render. The fix moves this logic to a `useEffect` that watches `deliveryAddress.country`, `deliveryAddress.postalCode`, and `deliveryAddress.city`.

A `useRef` tracks previous address values to only clear when these fields actually change (not on initial mount or unrelated re-renders).

**Alternative considered:** Using `queueMicrotask()` inside the updater — rejected because it's fragile and fights React's state model rather than working with it.

### 3. Per-seller deliveryError flag in API response

The backend `shippingOptionsController` already catches per-seller delivery option errors and continues. The fix adds a `deliveryError` field (string or null) to each seller object in the response. The frontend `SellerShippingGroup` uses this to show a warning alongside the pickup option.

**Alternative considered:** Returning a top-level error array — rejected because errors are per-seller and the response already groups by seller.

### 4. Defensive first_mile validation

`buildFunctionalities()` in `sendcloudProvider.js` will validate `first_mile` against the Sendcloud enum (`'pickup'`, `'dropoff'`, `'pickup_dropoff'`, `'fulfilment'`) before including it. Invalid values are logged and skipped.

### 5. Cart drawer shipping display for mixed carts

When a cart has both legacy (with shipping) and Sendcloud (without shipping) items, the order summary in Step 1 shows:
- Legacy items: normal shipping cost display
- Sendcloud items: "Envío: se calculará en el siguiente paso" per item, excluded from shipping totals
- The "Completar pedido" button is enabled as long as all legacy items have shipping (Sendcloud items don't need it at this stage)

A helper function `isSendcloudItem(item)` checks whether an item's product type uses Sendcloud, determining whether missing shipping is expected or an error.

## Risks / Trade-offs

- **[Risk] Mixed cart edge case**: A cart could contain both legacy and Sendcloud items from the same seller. → Mitigation: each flow handles its own items independently; the total is the sum of legacy shipping + Sendcloud shipping selections.
- **[Risk] useEffect timing for clearing selections**: The effect runs after render, so there's a brief moment where stale selections exist. → Mitigation: the shipping step re-fetches on mount anyway; stale selections are harmless until Step 3 re-renders.
- **[Risk] Sendcloud API errors with no delivery options AND no pickup**: Seller has neither. → Mitigation: `SellerShippingGroup` already shows "No hay opciones de envío disponibles" when both are empty. The new `deliveryError` warning provides additional context.
