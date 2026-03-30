## ADDED Requirements

### Requirement: Service point overlay opens when a service-point option is selected

When the buyer selects a delivery option that has `requiresServicePoint: true` in the `SellerShippingGroup`, the system SHALL display a full-overlay panel inside the cart drawer, covering the drawer content with a semi-transparent backdrop.

#### Scenario: Buyer clicks a service-point delivery option
- **WHEN** the buyer clicks on a delivery option where `requiresServicePoint` is `true`
- **THEN** the `ServicePointSelector` overlay SHALL appear inside the drawer, covering the full drawer area with a dimmed backdrop behind it

#### Scenario: Overlay does not open for home delivery options
- **WHEN** the buyer clicks on a delivery option where `requiresServicePoint` is `false` or absent
- **THEN** no overlay SHALL appear; the selection is applied directly as before

### Requirement: Overlay layout with map and list

The overlay SHALL display a Google Maps view in the upper portion and a scrollable list of service points in the lower portion, plus a header and a confirmation button.

#### Scenario: Overlay structure
- **WHEN** the overlay is displayed
- **THEN** the layout SHALL consist of (top to bottom): a header bar with a close button and title "Selecciona un punto de recogida", a Google Maps map occupying approximately 40% of the overlay height, a scrollable list of service point cards occupying the remaining space, and a fixed "Aceptar" button at the bottom

#### Scenario: Map displays service point markers
- **WHEN** service points are loaded from the API
- **THEN** each service point SHALL be represented as a marker on the Google Maps map, positioned at the latitude and longitude from the Sendcloud response

#### Scenario: Map initial view
- **WHEN** the map renders with service points
- **THEN** the map SHALL be centered and zoomed to fit all service point markers within the visible area

### Requirement: Service point list cards show relevant information

Each service point in the scrollable list SHALL display name, address, today's opening hours, and a radio button for selection.

#### Scenario: Card content
- **WHEN** a service point card is rendered
- **THEN** it SHALL display: the service point name, the street address (street + house number), the city and postal code, and today's opening hours parsed from `formatted_opening_times`

#### Scenario: Today's opening hours displayed
- **WHEN** the service point has `formatted_opening_times` with entries for today's day-of-week (0=Monday through 6=Sunday)
- **THEN** the card SHALL display "Hoy: " followed by the time ranges (e.g., "Hoy: 09:30 - 15:00, 17:00 - 20:30")

#### Scenario: Today is closed
- **WHEN** today's entry in `formatted_opening_times` is an empty array
- **THEN** the card SHALL display "Hoy: Cerrado"

#### Scenario: Radio button on card
- **WHEN** a service point card is rendered
- **THEN** it SHALL include a radio button on the right side of the card, checked only when this service point is the currently selected one

### Requirement: Bidirectional selection between map and list

Selecting a service point on the map SHALL highlight the corresponding list card, and selecting a list card SHALL highlight the corresponding map marker.

#### Scenario: Marker click selects corresponding card
- **WHEN** the buyer clicks a marker on the map
- **THEN** the corresponding list card SHALL be scrolled into view, its radio button SHALL be checked, and the map SHALL center on that marker

#### Scenario: Card click selects corresponding marker
- **WHEN** the buyer clicks a service point card in the list
- **THEN** the radio button on that card SHALL be checked and the map SHALL pan to center on the corresponding marker

#### Scenario: Previous selection is deselected
- **WHEN** the buyer selects a different service point (via map or list)
- **THEN** the previously selected card's radio button SHALL be unchecked

### Requirement: Aceptar button confirms selection

The overlay SHALL have an "Aceptar" button that is disabled until a service point is selected, and confirms the choice when clicked.

#### Scenario: Button disabled without selection
- **WHEN** the overlay is displayed and no service point has been selected
- **THEN** the "Aceptar" button SHALL be disabled (visually dimmed and not clickable)

#### Scenario: Button enabled with selection
- **WHEN** the buyer has selected a service point (via map marker or list card)
- **THEN** the "Aceptar" button SHALL be enabled

#### Scenario: Confirming selection
- **WHEN** the buyer clicks the enabled "Aceptar" button
- **THEN** the overlay SHALL close, and the selected service point's `id` SHALL be stored as the `servicePointId` in the shipping selection for that seller

#### Scenario: Selection name reflects service point
- **WHEN** the buyer confirms a service point selection
- **THEN** the shipping selection `name` SHALL include both the carrier name and the service point name (e.g., "Correos Express - KIOSCO EL PUENTE")

### Requirement: Overlay can be dismissed without confirming

The buyer SHALL be able to close the overlay without confirming a selection, leaving the previous state unchanged.

#### Scenario: Close button dismisses overlay
- **WHEN** the buyer clicks the close button (X) in the overlay header
- **THEN** the overlay SHALL close without modifying the shipping selection

#### Scenario: Backdrop click dismisses overlay
- **WHEN** the buyer clicks the dimmed backdrop area outside the overlay content
- **THEN** the overlay SHALL close without modifying the shipping selection

### Requirement: Loading and error states in overlay

The overlay SHALL handle loading and error states for both the service points API call and the Google Maps script loading.

#### Scenario: Loading service points
- **WHEN** the service points are being fetched from the API
- **THEN** the overlay SHALL display a loading spinner or skeleton in the list area and a placeholder in the map area

#### Scenario: Service points fetch error
- **WHEN** the service points API call fails
- **THEN** the overlay SHALL display an error message "No se pudieron cargar los puntos de recogida" with a retry option

#### Scenario: Google Maps fails to load
- **WHEN** the Google Maps script fails to load (missing API key, network error)
- **THEN** the list of service points SHALL still be displayed without the map section, and the overlay SHALL show a notice "No se pudo cargar el mapa"

#### Scenario: No service points available
- **WHEN** the API returns an empty array of service points
- **THEN** the overlay SHALL display "No hay puntos de recogida disponibles en esta zona" and the "Aceptar" button SHALL remain disabled

### Requirement: Google Maps script is loaded via shared utility

The Google Maps JavaScript API script SHALL be loaded using a shared singleton utility, reusable by both `AddressAutocomplete` and `ServicePointSelector`.

#### Scenario: Script not yet loaded
- **WHEN** the overlay opens and the Google Maps script has not been loaded
- **THEN** the shared utility SHALL load the script with the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` API key and the `places,marker` libraries

#### Scenario: Script already loaded
- **WHEN** the overlay opens and the Google Maps script was previously loaded by `AddressAutocomplete` or a prior overlay
- **THEN** the shared utility SHALL resolve immediately without loading a duplicate script

#### Scenario: API key not configured
- **WHEN** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is not set
- **THEN** the overlay SHALL render the service point list without the map and display a notice
