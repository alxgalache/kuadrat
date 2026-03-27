## ADDED Requirements

### Requirement: Sendcloud-enabled products skip legacy shipping modal

When Sendcloud is enabled for a product type (`SENDCLOUD_ENABLED_ART` for art, `SENDCLOUD_ENABLED_OTHERS` for others), clicking "Añadir a la cesta" on the product detail page SHALL add the item to the cart without shipping info and without opening the ShippingSelectionModal. The legacy modal flow SHALL continue to work for product types where Sendcloud is not enabled.

#### Scenario: Art product with Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and buyer clicks "Añadir a la cesta" on an art product
- **THEN** the product is added to cart with `shipping: null` and no ShippingSelectionModal is shown

#### Scenario: Art product with Sendcloud disabled
- **WHEN** `SENDCLOUD_ENABLED_ART` is `false` and buyer clicks "Añadir a la cesta" on an art product
- **THEN** the ShippingSelectionModal opens as before (legacy flow)

#### Scenario: Others product with Sendcloud enabled
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is `true` and buyer clicks "Añadir a la cesta" on an others product
- **THEN** the product is added to cart with `shipping: null` and no ShippingSelectionModal is shown

#### Scenario: Others product with Sendcloud disabled
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is `false` and buyer clicks "Añadir a la cesta" on an others product
- **THEN** the ShippingSelectionModal opens as before (legacy flow)

### Requirement: Cart Step 1 displays pending shipping message for Sendcloud items

In the cart drawer Step 1, items that use Sendcloud shipping and have `shipping: null` SHALL display "Envío: se calculará en el siguiente paso" where shipping info would normally appear. These items SHALL be excluded from the shipping cost totals. The "Completar pedido" button SHALL be enabled when all legacy items have shipping, regardless of whether Sendcloud items have shipping.

#### Scenario: Sendcloud item without shipping in cart
- **WHEN** a Sendcloud-enabled item is in the cart with `shipping: null`
- **THEN** the cart displays "Envío: se calculará en el siguiente paso" for that item and excludes it from the "Envío" total

#### Scenario: Mixed cart with legacy and Sendcloud items
- **WHEN** the cart contains both a legacy item with shipping and a Sendcloud item without shipping
- **THEN** the "Completar pedido" button is enabled, the legacy item's shipping is shown in the total, and the Sendcloud item shows the pending message

#### Scenario: Only legacy items without shipping
- **WHEN** all items are legacy (Sendcloud not enabled) and some lack shipping
- **THEN** the "Completar pedido" button is disabled with the existing warning message

### Requirement: Address changes clear Sendcloud shipping selections without React errors

When the buyer changes the delivery address country, postal code, or city fields, the Sendcloud shipping selections SHALL be cleared. This clearing SHALL NOT cause a React "setState during render" error.

#### Scenario: Buyer changes postal code
- **WHEN** the buyer modifies the postal code in the address form and Sendcloud is enabled
- **THEN** all Sendcloud shipping selections are cleared without console errors

#### Scenario: Buyer changes country
- **WHEN** the buyer changes the country dropdown and Sendcloud is enabled
- **THEN** all Sendcloud shipping selections are cleared without console errors

#### Scenario: Address form interaction does not trigger React errors
- **WHEN** the buyer interacts with any address field
- **THEN** no "Cannot update a component while rendering a different component" error is thrown

### Requirement: ShippingStep correctly parses API response

The ShippingStep component SHALL access the seller groups from the API response using `res.sellers` (not `res.data?.sellers`), matching the format returned by `apiRequest()`.

#### Scenario: Successful shipping options fetch
- **WHEN** the ShippingStep fetches shipping options from the API
- **THEN** the seller groups are extracted from `res.sellers` and rendered as SellerShippingGroup components

#### Scenario: API returns sellers with delivery options and pickup
- **WHEN** the API returns a seller with delivery options and a pickup option
- **THEN** both delivery options and the pickup option are displayed in the SellerShippingGroup

### Requirement: Partial Sendcloud errors show available options with warning

When the Sendcloud API fails for a seller's delivery options but the seller has a pickup option, the API response SHALL include a `deliveryError` message for that seller. The frontend SHALL display a warning about the delivery error alongside the available pickup option.

#### Scenario: Sendcloud API error with pickup available
- **WHEN** the Sendcloud API returns an error for delivery options but the seller has a configured pickup address
- **THEN** the API response includes `deliveryError` with a descriptive message, the frontend shows a warning banner, and the pickup option is displayed and selectable

#### Scenario: Sendcloud API error with no pickup
- **WHEN** the Sendcloud API returns an error and the seller has no pickup address
- **THEN** the API response includes `deliveryError` and the frontend shows "No hay opciones de envío disponibles" with the error message

### Requirement: Invalid first_mile values are not sent to Sendcloud API

The `buildFunctionalities()` function SHALL validate the `first_mile` value against the allowed Sendcloud enum (`'pickup'`, `'dropoff'`, `'pickup_dropoff'`, `'fulfilment'`). Invalid values SHALL be logged and excluded from the API request.

#### Scenario: Valid first_mile value
- **WHEN** the seller config has `first_mile` set to `'pickup'`
- **THEN** the value is included in the Sendcloud API request functionalities

#### Scenario: Invalid first_mile value
- **WHEN** the seller config has `first_mile` set to an invalid value (e.g., `'true'` or `'1'`)
- **THEN** the value is excluded from the API request and a warning is logged

#### Scenario: Empty first_mile value
- **WHEN** the seller config has `first_mile` as null or empty string
- **THEN** no `first_mile` field is included in the API request (existing behavior preserved)
