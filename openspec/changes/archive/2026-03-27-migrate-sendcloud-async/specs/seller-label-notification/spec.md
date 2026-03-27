## ADDED Requirements

### Requirement: Seller email notification when shipping label is ready

The system SHALL send an email to the seller when a shipping label becomes available for their order item, with the label PDF attached to the email.

#### Scenario: Label ready triggers seller notification
- **WHEN** the webhook reports status 1000 (Ready to send) for an order item
- **THEN** the system SHALL send an email to the seller associated with that order item

#### Scenario: Label PDF downloaded from Sendcloud API
- **WHEN** preparing the seller label notification email
- **THEN** the system SHALL download the label PDF from `GET /v3/parcels/{parcel_id}/documents/label` with `Accept: application/pdf` header using the Sendcloud API client

#### Scenario: Label PDF attached to email
- **WHEN** the label PDF is downloaded successfully
- **THEN** the email SHALL include the PDF as a Nodemailer attachment with filename `etiqueta-envio-{orderId}.pdf` and content type `application/pdf`

#### Scenario: Email sent without attachment on download failure
- **WHEN** the label PDF download fails (timeout, API error, etc.)
- **THEN** the system SHALL log the error, and send the email without attachment but with a message indicating the label can be downloaded from the seller dashboard

#### Scenario: Email content includes order details
- **WHEN** the seller label email is sent
- **THEN** the email SHALL include: the order ID, a summary of the items in the shipment, the tracking number (if available), and a link to the seller dashboard orders page

#### Scenario: Email function signature
- **WHEN** `sendLabelReadyEmail()` is called
- **THEN** it SHALL accept `{ sellerEmail, sellerName, orderId, orderItemId, trackingNumber, parcelId }` as parameters

### Requirement: Label download endpoint adapted for parcel ID

The seller label download endpoint SHALL use `sendcloud_parcel_id` with the V3 parcel documents API.

#### Scenario: Label downloaded using parcel ID
- **WHEN** a seller requests a label download for an order item
- **THEN** the system SHALL use `sendcloud_parcel_id` to call `GET /v3/parcels/{parcel_id}/documents/label`

#### Scenario: Label not yet available
- **WHEN** a seller requests a label download but the parcel is still in ANNOUNCING status (label not yet generated)
- **THEN** the endpoint SHALL return a 404 response with message "La etiqueta se está generando. Por favor, inténtalo de nuevo en unos minutos."

#### Scenario: No parcel ID stored
- **WHEN** a seller requests a label download but `sendcloud_parcel_id` is null
- **THEN** the endpoint SHALL return a 404 response with message "No hay etiqueta de envío disponible"
