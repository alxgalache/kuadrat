## MODIFIED Requirements

### Requirement: Draw buyer registration
The system SHALL allow users to register as draw participants via `POST /api/draws/:id/register-buyer`. Registration SHALL accept firstName, lastName, email, dni, and optional delivery/invoicing address fields. The system SHALL NOT generate or store a `bid_password`. If a buyer with the same email already exists for the same draw, the existing buyer record SHALL be returned instead of creating a duplicate. The client IP address SHALL be stored in the `ip_address` column.

#### Scenario: New buyer registration
- **WHEN** a user submits registration data for a draw they haven't registered for
- **THEN** a new `draw_buyers` record SHALL be created with the provided DNI and IP address, and the response SHALL include the `drawBuyerId` (no password in response)

#### Scenario: Duplicate email registration
- **WHEN** a user submits registration with an email that already has a `draw_buyers` record for the same draw
- **THEN** the existing buyer record SHALL be returned without creating a duplicate

#### Scenario: Registration for non-active draw
- **WHEN** a user attempts to register for a draw with status other than 'active'
- **THEN** the system SHALL return a 400 error indicating the draw is not accepting participants

---

### Requirement: Draw participation modal
The frontend SHALL display a multi-step participation modal (`DrawParticipationModal`) when the user clicks "Inscribirse en el sorteo" on the draw detail page. The modal SHALL open directly into the TERMS phase with the following flow: TERMS (accept conditions) → PERSONAL (name, email, DNI + email OTP verification) → DELIVERY (delivery address) → INVOICING (invoice address) → PAYMENT (Stripe Elements) → CONFIRM (review and confirm) → SUCCESS (auto-close). The CHOOSE and VERIFY phases SHALL NOT exist.

#### Scenario: New participant completes full flow
- **WHEN** a new participant accepts terms and completes all steps through CONFIRM
- **THEN** the system SHALL register the buyer, verify email via OTP, authorize payment, create the participation, and show the SUCCESS phase

#### Scenario: No returning participant flow
- **WHEN** the modal opens
- **THEN** the modal SHALL display the TERMS phase directly — no CHOOSE phase with "Ya me registré antes" / "Nuevo participante" buttons SHALL be shown

#### Scenario: PERSONAL step includes DNI and email verification
- **WHEN** the PERSONAL step is displayed
- **THEN** the form SHALL include fields for firstName, lastName, email, and DNI. After submission, the system SHALL validate the DNI, check uniqueness, send an email OTP, and display an inline code input for verification before proceeding

#### Scenario: Confirm phase displays product details
- **WHEN** the CONFIRM phase is shown
- **THEN** the modal SHALL display the product image, product name, draw price, and a "Confirmar inscripción" button

#### Scenario: SUCCESS phase auto-closes with notification
- **WHEN** the SUCCESS phase is reached after successful entry
- **THEN** the modal SHALL display a green checkmark and success message, auto-close after 2 seconds, and trigger a BannerNotification with "Te has inscrito correctamente en el sorteo"

#### Scenario: No password displayed anywhere
- **WHEN** any phase of the modal is displayed
- **THEN** no password, access code, or `bid_password` SHALL be shown or referenced

#### Scenario: No localStorage session recovery
- **WHEN** the modal opens and a previous localStorage session exists for this draw
- **THEN** the modal SHALL NOT skip to the CONFIRM phase — it SHALL always start from TERMS

---

### Requirement: Draw entry confirmation email
The system SHALL send a confirmation email to the participant after successful draw entry. The email SHALL include: the draw name, product name, product image, and the participant's name. The email SHALL NOT include any password or access code. The email template SHALL follow the same HTML structure and Spanish language as existing email templates.

#### Scenario: Email sent after successful entry
- **WHEN** a participant successfully enters a draw
- **THEN** the system SHALL send an email to the participant's registered email address with draw entry confirmation details

#### Scenario: Email does not include password
- **WHEN** the confirmation email is generated
- **THEN** the email body SHALL NOT contain any password, access code, or `bid_password` references

#### Scenario: Email includes product image
- **WHEN** the confirmation email is generated
- **THEN** the email body SHALL include the product image URL resolved from the product's basename and type

---

## REMOVED Requirements

### Requirement: Returning participant verification
**Reason:** Draws are one-time entries — there is no use case for a participant to "return" to a draw. The CHOOSE/VERIFY flow and `bid_password` system were inherited from auctions and do not apply.
**Migration:** Remove `POST /api/draws/:id/verify-buyer` endpoint, remove `verifyBuyer` controller and `verifyDrawBuyerPassword` service function, remove `verifyBuyerSchema` from validators. Frontend removes CHOOSE and VERIFY phases from modal.
