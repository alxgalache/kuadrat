### Requirement: Admin receives email when seller creates a product
The system SHALL send an email notification to the admin email address (`config.registrationEmail`) whenever a seller successfully creates an art or other product. The email MUST include the seller's name and the product name, and MUST indicate that the product needs validation and approval.

#### Scenario: Art product created successfully
- **WHEN** a seller creates an art product via `createArtProduct` and the DB insert succeeds
- **THEN** the system sends an email to `config.registrationEmail` containing the seller's full name, the product name, the product type ("Arte"), and a message stating the product needs to be validated and approved

#### Scenario: Other product created successfully
- **WHEN** a seller creates an other product via `createOthersProduct` and the DB insert succeeds
- **THEN** the system sends an email to `config.registrationEmail` containing the seller's full name, the product name, the product type ("Otro producto"), and a message stating the product needs to be validated and approved

#### Scenario: Admin email not configured
- **WHEN** a product is created but `config.registrationEmail` is not set
- **THEN** the system logs a warning and skips sending the email; the product creation response is unaffected

#### Scenario: Email sending fails
- **WHEN** a product is created but the SMTP transporter fails to send the email
- **THEN** the system logs the error and the product creation 201 response is still returned successfully

### Requirement: Notification email uses standard email template
The notification email MUST use the existing email template pattern: HTML format with the gallery logo, `getFormattedSender()` as the from address, `getLogoAttachment()` for logo embedding, and `escapeForEmail()` for seller/product name sanitization. The email subject MUST clearly identify it as a new product notification.

#### Scenario: Email format and content
- **WHEN** the admin notification email is sent
- **THEN** it uses HTML format with the gallery logo, a subject line referencing the new product, the seller name and product name escaped with `escapeForEmail()`, and the from address set via `getFormattedSender()`
