## ADDED Requirements

### Requirement: Pickup warning in seller new order email

The `sendSellerNewOrderEmail` function SHALL always include a warning paragraph in the email HTML, regardless of the seller's `first_mile` configuration. The warning text SHALL read: "Recuerda que si eliges programar una recogida, debes hacerlo en los detalles del envio dentro de la seccion 'Mis envios' en un plazo maximo de 7 dias."

#### Scenario: Seller receives new order email
- **WHEN** a new order is placed and `sendSellerNewOrderEmail` is called for any seller
- **THEN** the email HTML includes the pickup warning paragraph styled as a warning/notice block, placed after the main content and before the footer

#### Scenario: Warning is always present
- **WHEN** the seller has `first_mile='dropoff'`
- **THEN** the email still includes the pickup warning (it is always shown regardless of seller config)

### Requirement: Warning visual styling

The pickup warning SHALL be styled as a distinct notice block within the email, visually differentiated from the surrounding content (e.g., with a light background color and/or a left border), so the seller can identify it as important information.

#### Scenario: Warning is visually distinct
- **WHEN** the seller views the email
- **THEN** the warning paragraph is enclosed in a styled container (e.g., light yellow/amber background with left border) that distinguishes it from regular email text
