## ADDED Requirements

### Requirement: Draw postal code validation endpoint
The system SHALL provide a `POST /api/draws/:id/validate-postal-code` endpoint that accepts `{ postalCode, country }` and returns `{ valid: boolean }`. The endpoint SHALL resolve the draw's product and its seller, then check whether the seller has any active shipping zone that covers the given postal code (using the same polymorphic postal ref logic as `shipping_zones_postal_codes`). If the seller has no shipping zones at all, the endpoint SHALL return `{ valid: true }` (no restrictions).

#### Scenario: Postal code covered by seller's shipping zone
- **WHEN** `POST /api/draws/:id/validate-postal-code` is called with a postal code that matches a seller's shipping zone (direct postal_code ref, province ref, or country ref)
- **THEN** the system SHALL return `{ valid: true }`

#### Scenario: Postal code not covered by any shipping zone
- **WHEN** `POST /api/draws/:id/validate-postal-code` is called with a postal code that does not match any of the seller's shipping zones
- **THEN** the system SHALL return `{ valid: false }`

#### Scenario: Seller has no shipping zone postal restrictions
- **WHEN** the seller's shipping zones have no postal code references (zones apply country-wide)
- **THEN** the system SHALL return `{ valid: true }`

#### Scenario: Seller has no shipping zones at all
- **WHEN** the draw's product seller has no active shipping methods or zones configured
- **THEN** the system SHALL return `{ valid: true }` (no delivery restrictions)

#### Scenario: Invalid draw ID
- **WHEN** `POST /api/draws/:id/validate-postal-code` is called with a non-existent draw ID
- **THEN** the system SHALL return a 404 error

---

### Requirement: Draw postal code validation in participation modal
The `DrawParticipationModal` SHALL validate the delivery postal code during the DELIVERY step using the `usePostalCodeValidation` hook. The validation function SHALL call `drawsAPI.validatePostalCode(drawId, postalCode, country)`. The user SHALL NOT be able to proceed to the INVOICING step while the postal code is invalid.

#### Scenario: Valid postal code allows progression
- **WHEN** the user enters a postal code in the DELIVERY step that is valid for the draw's product seller
- **THEN** the system SHALL display a green check indicator and enable the "Siguiente" button

#### Scenario: Invalid postal code blocks progression
- **WHEN** the user enters a postal code that is not covered by the seller's shipping zones
- **THEN** the system SHALL display an error message "No realizamos envíos a este código postal" and the "Siguiente" button SHALL be disabled

#### Scenario: Postal code validation in progress
- **WHEN** the user is typing a postal code and validation is pending (debounced)
- **THEN** the system SHALL display a loading indicator on the postal code field

#### Scenario: Postal code too short
- **WHEN** the user has entered fewer than 4 characters in the postal code field
- **THEN** the system SHALL NOT trigger validation and the field SHALL show no validation state

---

### Requirement: Draw API client postal code validation function
The `drawsAPI` object in `lib/api.js` SHALL include a `validatePostalCode(drawId, postalCode, country)` function that makes a POST request to `/api/draws/${drawId}/validate-postal-code` with `{ postalCode, country }` in the body.

#### Scenario: API client function exists
- **WHEN** `drawsAPI.validatePostalCode(drawId, postalCode, country)` is called
- **THEN** the function SHALL make a POST request to `/api/draws/${drawId}/validate-postal-code` with `{ postalCode, country }` and return the parsed response

---

### Requirement: Draw postal code validation Zod schema
The `drawSchemas.js` file SHALL include a `validatePostalCodeSchema` that validates the request body: `postalCode` (required, non-empty string) and `country` (required, 2-character string, default "ES").

#### Scenario: Valid request body passes validation
- **WHEN** a request body `{ postalCode: "28001", country: "ES" }` is validated
- **THEN** the validation SHALL pass

#### Scenario: Missing postal code fails validation
- **WHEN** a request body without `postalCode` is validated
- **THEN** the validation SHALL fail with an error message
