## ADDED Requirements

### Requirement: Shipping selection step in checkout drawer

The `ShoppingCartDrawer` SHALL include a "Selección de envío" step (Step 3) between the address step and the payment step, making the checkout a 4-step flow: Cart → Address → Shipping → Payment.

#### Scenario: Step flow order
- **WHEN** the buyer proceeds through the checkout
- **THEN** the steps SHALL be: Step 1 (Cart Review), Step 2 (Address & Personal Info), Step 3 (Shipping Selection), Step 4 (Payment)

#### Scenario: Shipping step loads after address
- **WHEN** the buyer completes Step 2 (address entry) and clicks "Continuar"
- **THEN** the system SHALL transition to Step 3 and fetch shipping options from the backend using the buyer's delivery address

#### Scenario: Cannot proceed without shipping selections
- **WHEN** the buyer is on Step 3 and has not selected a shipping option for every seller group
- **THEN** the "Continuar al pago" button SHALL be disabled

#### Scenario: All sellers have selections
- **WHEN** the buyer has selected a shipping option for every seller group in the cart
- **THEN** the "Continuar al pago" button SHALL be enabled and clicking it transitions to Step 4

### Requirement: Per-seller shipping option display

Step 3 SHALL display shipping options grouped by seller. Each seller group shows the seller name, product count, and available delivery options from the shipping provider.

#### Scenario: Multiple sellers in cart
- **WHEN** the cart contains products from Artist A and Artist B
- **THEN** Step 3 SHALL display two separate groups, each labeled with the seller name and the number of products

#### Scenario: Shipping option details
- **WHEN** shipping options are displayed for a seller
- **THEN** each option SHALL show: carrier name, carrier logo (if available), price in EUR, and estimated delivery days range

#### Scenario: Multi-parcel cost display
- **WHEN** a seller group requires multiple parcels (e.g., 2 art pieces)
- **THEN** the total cost SHALL be the sum of all parcel rates, and the display SHALL indicate the per-parcel breakdown (e.g., "15.80€ (7.90€ × 2 bultos)")

### Requirement: Seller pickup option in checkout

Step 3 SHALL include a "Recogida en persona" option for sellers who have a pickup address configured, alongside the Sendcloud delivery options.

#### Scenario: Seller has pickup address
- **WHEN** a seller has `pickup_address`, `pickup_city`, `pickup_postal_code`, and `pickup_country` set in the users table
- **THEN** the shipping options for that seller SHALL include a "Recogida en persona" option with cost 0€ and the seller's pickup address displayed

#### Scenario: Seller has no pickup address
- **WHEN** a seller does not have pickup address fields set
- **THEN** the "Recogida en persona" option SHALL NOT be displayed for that seller

#### Scenario: Pickup instructions shown
- **WHEN** the seller has `pickup_instructions` set
- **THEN** the pickup option SHALL display those instructions below the address

### Requirement: Service point selection in checkout

When a buyer selects a service-point delivery option, the system SHALL display a list of nearby service points and require the buyer to select one.

#### Scenario: Service point option selected
- **WHEN** the buyer clicks on a delivery option that has `requiresServicePoint: true`
- **THEN** the system SHALL fetch service points from `GET /api/shipping/service-points` for the relevant carrier and buyer's postal code, and display them

#### Scenario: Service point list display
- **WHEN** service points are displayed
- **THEN** each service point SHALL show: name, address (street + city), opening hours, and distance from buyer's postal code

#### Scenario: Service point must be selected
- **WHEN** a service-point delivery option is selected but no specific service point has been chosen
- **THEN** the seller group SHALL be considered incomplete and the proceed button SHALL remain disabled

#### Scenario: Service point stored in selection
- **WHEN** the buyer selects a specific service point
- **THEN** the `servicePointId` SHALL be stored in the shipping selection for that seller and included in the order data for shipment creation

### Requirement: Shipping options API endpoint

The system SHALL provide a `POST /api/shipping/options` endpoint that returns normalized shipping options for a cart, grouped by seller.

#### Scenario: Request format
- **WHEN** a request is sent with `{ items: [{ productId, productType, quantity, sellerId, weight, dimensions, canCopack }], deliveryAddress: { country, postalCode, city, address } }`
- **THEN** the system SHALL group items by seller, determine parcels per seller (art=separate, others=copack grouping), call the appropriate provider per product type, and return options per seller

#### Scenario: Response format
- **WHEN** the endpoint returns successfully
- **THEN** the response SHALL contain `{ sellers: [{ sellerId, sellerName, parcelCount, deliveryOptions: [...], pickupOption: { address, city, postalCode, country, instructions } | null }] }`

#### Scenario: Mixed providers
- **WHEN** the cart contains art items (Sendcloud enabled) and others items (Sendcloud disabled) from the same seller
- **THEN** the system SHALL query the appropriate provider for each product type and return combined options per seller

### Requirement: Service points API endpoint

The system SHALL provide a `GET /api/shipping/service-points` endpoint that proxies service point queries to Sendcloud.

#### Scenario: Query service points
- **WHEN** a request is sent with `?carrier=correos_express&country=ES&postalCode=28001`
- **THEN** the system SHALL call the Sendcloud service points API and return a normalized list of service points

#### Scenario: Sendcloud not enabled
- **WHEN** the service points endpoint is called but Sendcloud is not enabled for any product type
- **THEN** the system SHALL return an empty array

### Requirement: Address change invalidates shipping selections

When the buyer modifies the delivery address in Step 2 after having made shipping selections in Step 3, all shipping selections SHALL be cleared.

#### Scenario: Address changed after shipping selected
- **WHEN** the buyer navigates back from Step 3 to Step 2, changes the postal code or country, and proceeds to Step 3 again
- **THEN** all previous shipping selections SHALL be cleared and shipping options SHALL be re-fetched with the new address

#### Scenario: Address unchanged
- **WHEN** the buyer navigates back from Step 3 to Step 2 without changing the delivery address
- **THEN** the previous shipping selections SHALL be preserved when returning to Step 3

### Requirement: Parcel grouping logic

The shipping options endpoint SHALL group cart items into parcels according to product type and co-packability rules.

#### Scenario: Art products are separate parcels
- **WHEN** a seller has 3 art products in the cart
- **THEN** the system SHALL create 3 separate parcels, each with the individual product's weight and dimensions

#### Scenario: Co-packable others products are aggregated
- **WHEN** a seller has 3 others products with `can_copack=1`
- **THEN** the system SHALL create 1 parcel with summed weight (quantity × weight per item)

#### Scenario: Non-co-packable others products are separate
- **WHEN** a seller has 2 others products with `can_copack=0`
- **THEN** the system SHALL create 2 separate parcels, each with the individual product's weight and dimensions

#### Scenario: Mixed co-packable and non-co-packable
- **WHEN** a seller has 2 co-packable items and 1 non-co-packable item
- **THEN** the system SHALL create 2 parcels: one aggregated parcel for the co-packable items and one individual parcel for the non-co-packable item

### Requirement: CartContext shipping data for Sendcloud

The `CartContext` SHALL support storing per-seller shipping selections for the Sendcloud flow, alongside the existing per-item shipping for the legacy flow.

#### Scenario: Sendcloud shipping selections stored per seller
- **WHEN** the buyer selects a shipping option in Step 3 for a Sendcloud-managed seller
- **THEN** the CartContext SHALL store `{ optionId, type, carrier, cost, shippingOptionCode, servicePointId }` keyed by sellerId

#### Scenario: Total shipping calculation includes both flows
- **WHEN** `getTotalShipping()` is called and the cart has both legacy and Sendcloud items
- **THEN** the total SHALL be the sum of legacy per-item shipping costs plus Sendcloud per-seller shipping costs

#### Scenario: Shipping selections cleared on cart modification
- **WHEN** a product is added to or removed from the cart
- **THEN** the Sendcloud shipping selections for the affected seller SHALL be cleared (rates may no longer be valid)

### Requirement: Remove per-item shipping selection for Sendcloud products

When Sendcloud is active for a product type, the `ShippingSelectionModal` SHALL NOT be triggered for products of that type in Step 1.

#### Scenario: No shipping modal for Sendcloud art products
- **WHEN** `SENDCLOUD_ENABLED_ART` is `true` and the buyer adds an art product to the cart
- **THEN** the `ShippingSelectionModal` SHALL NOT open; shipping will be selected in Step 3

#### Scenario: Legacy modal preserved for non-Sendcloud products
- **WHEN** `SENDCLOUD_ENABLED_OTHERS` is `false` and the buyer adds an others product to the cart
- **THEN** the `ShippingSelectionModal` SHALL open as currently (legacy behavior)

#### Scenario: Step 1 validation adjusted
- **WHEN** the buyer clicks "Completar pedido" in Step 1 and some items use Sendcloud (no per-item shipping)
- **THEN** the validation SHALL only require shipping for legacy items; Sendcloud items are validated in Step 3
