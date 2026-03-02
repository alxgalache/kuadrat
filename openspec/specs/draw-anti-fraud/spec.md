## ADDED Requirements

### Requirement: DNI field and format validation
The system SHALL require a `dni` field when registering as a draw participant. The DNI SHALL be validated using the Spanish NIF algorithm: 8 digits followed by a checksum letter, where the letter equals `"TRWAGMYFPDXBNJZSQVHLCKE"[number % 23]`. NIE format (prefix X, Y, or Z replaced by 0, 1, or 2 before calculation) SHALL also be accepted. Validation SHALL occur both client-side (before form submission) and server-side (in the send-verification endpoint).

#### Scenario: Valid DNI accepted
- **WHEN** a user submits a DNI with correct format and valid checksum letter (e.g., "12345678Z")
- **THEN** the system SHALL accept the DNI and proceed with registration

#### Scenario: Invalid DNI checksum rejected
- **WHEN** a user submits a DNI where the letter does not match the checksum (e.g., "12345678A")
- **THEN** the system SHALL reject the submission with error "El DNI/NIE introducido no es válido"

#### Scenario: NIE format accepted
- **WHEN** a user submits a NIE with valid format (e.g., "X1234567L")
- **THEN** the system SHALL replace the prefix (X→0, Y→1, Z→2), validate the checksum, and accept if valid

#### Scenario: Client-side validation before submission
- **WHEN** the user types a DNI in the PERSONAL step input field
- **THEN** the frontend SHALL validate the format and checksum in real-time and show an inline error if invalid

---

### Requirement: DNI uniqueness per draw
The system SHALL enforce that each DNI can only be used once per draw. The `draw_buyers` table SHALL have a UNIQUE index on `(dni, draw_id)`. When `POST /api/draws/:id/send-verification` is called, the server SHALL check for an existing `draw_buyers` record with the same DNI for the same draw before proceeding.

#### Scenario: Duplicate DNI blocked
- **WHEN** a user attempts to register with a DNI that already has a `draw_buyers` record for the same draw
- **THEN** the system SHALL return a 409 error with message "Este DNI ya está registrado en este sorteo"

#### Scenario: Same DNI allowed in different draws
- **WHEN** a user registers with a DNI that was used in a different draw
- **THEN** the system SHALL allow the registration (uniqueness is scoped per draw)

#### Scenario: Race condition handled by database constraint
- **WHEN** two concurrent requests attempt to register the same DNI for the same draw
- **THEN** the UNIQUE index on `(dni, draw_id)` SHALL cause one request to fail with a constraint violation, which the service SHALL catch and return as a 409

---

### Requirement: Email OTP verification
The system SHALL verify participant email addresses by sending a 6-digit numeric OTP code via email. The OTP flow SHALL be triggered by `POST /api/draws/:id/send-verification` (which also validates DNI) and confirmed by `POST /api/draws/:id/verify-email`.

#### Scenario: OTP sent successfully
- **WHEN** `POST /api/draws/:id/send-verification` is called with a valid, unique DNI and email
- **THEN** the system SHALL generate a 6-digit numeric code, store it in `draw_email_verifications` with a 10-minute expiry, and send it to the provided email address

#### Scenario: OTP email content
- **WHEN** the OTP email is sent
- **THEN** the email SHALL contain the subject "Código de verificación - Kuadrat" and the body SHALL include the 6-digit code with the text "Tu código de verificación es:" in Spanish

#### Scenario: OTP verified successfully
- **WHEN** `POST /api/draws/:id/verify-email` is called with the correct code within the expiry window
- **THEN** the system SHALL mark the verification as complete and return success

#### Scenario: OTP expired
- **WHEN** `POST /api/draws/:id/verify-email` is called with a code that has expired (older than 10 minutes)
- **THEN** the system SHALL return a 400 error with message "El código ha expirado. Solicita uno nuevo"

#### Scenario: OTP max attempts exceeded
- **WHEN** `POST /api/draws/:id/verify-email` is called and the verification record has 3 or more failed attempts
- **THEN** the system SHALL return a 400 error with message "Demasiados intentos. Solicita un nuevo código"

#### Scenario: Wrong OTP code
- **WHEN** `POST /api/draws/:id/verify-email` is called with an incorrect code
- **THEN** the system SHALL increment the attempts counter and return a 400 error with message "Código incorrecto"

#### Scenario: Resend OTP
- **WHEN** `POST /api/draws/:id/send-verification` is called again for the same email and draw
- **THEN** the system SHALL invalidate any previous OTP for that email+draw combination and generate a new one

---

### Requirement: Email uniqueness per draw
The system SHALL enforce that each email address can only be used once per draw. When `POST /api/draws/:id/send-verification` is called, the server SHALL check for an existing `draw_buyers` record with the same email for the same draw before proceeding. A UNIQUE index SHALL exist on `(email, draw_id)` in the `draw_buyers` table for database-level enforcement.

#### Scenario: Duplicate email blocked at send-verification
- **WHEN** a user attempts to send a verification code with an email that already has a `draw_buyers` record for the same draw (regardless of DNI)
- **THEN** the system SHALL return a 409 error with message "Este email ya está registrado en este sorteo"

#### Scenario: Same email allowed in different draws
- **WHEN** a user registers with an email that was used in a different draw
- **THEN** the system SHALL allow the registration (uniqueness is scoped per draw)

#### Scenario: DNI check still applies alongside email check
- **WHEN** `POST /api/draws/:id/send-verification` is called
- **THEN** the system SHALL check both email uniqueness AND DNI uniqueness before sending the verification code

---

### Requirement: Stripe payment method fingerprint deduplication
The system SHALL prevent the same physical card from being used for multiple entries in the same draw. When `POST /api/draws/:id/confirm-payment` processes a Stripe SetupIntent, the system SHALL retrieve the PaymentMethod, extract `card.fingerprint`, and check for duplicates within the same draw before saving.

#### Scenario: Duplicate card fingerprint blocked
- **WHEN** a buyer confirms payment with a card whose fingerprint already exists in `draw_authorised_payment_data` for another buyer in the same draw
- **THEN** the system SHALL return a 409 error with message "Este método de pago ya está asociado a otra inscripción en este sorteo"

#### Scenario: Same card allowed in different draws
- **WHEN** a buyer confirms payment with a card that was used in a different draw
- **THEN** the system SHALL allow the payment method to be saved

#### Scenario: Fingerprint not available
- **WHEN** the Stripe PaymentMethod does not expose a card fingerprint (e.g., wallet payment method)
- **THEN** the system SHALL log a warning and allow the payment method to be saved without fingerprint deduplication

#### Scenario: Fingerprint stored in payment data
- **WHEN** payment is confirmed and the fingerprint is available
- **THEN** the system SHALL store the fingerprint in `draw_authorised_payment_data.stripe_fingerprint`

---

### Requirement: IP address logging
The system SHALL capture and store the client IP address at the earliest interaction point: the `send-verification` endpoint. The IP SHALL be stored in `draw_email_verifications.ip_address` for immediate logging, and subsequently copied to `draw_buyers.ip_address` when the buyer record is created during `register-buyer`. The IP is for admin review purposes only — no automated blocking based on IP.

#### Scenario: IP captured at send-verification
- **WHEN** `POST /api/draws/:id/send-verification` is called
- **THEN** the system SHALL capture the client IP (from `x-forwarded-for` header or `req.ip`) and store it in the `draw_email_verifications.ip_address` column

#### Scenario: IP copied to buyer record at registration
- **WHEN** `POST /api/draws/:id/register-buyer` is called
- **THEN** the system SHALL also capture and store `req.ip` in `draw_buyers.ip_address` (preserving existing behavior)

#### Scenario: IP behind proxy captured via header
- **WHEN** the request includes an `x-forwarded-for` header
- **THEN** the system SHALL use the first IP from `x-forwarded-for` as the stored IP address

#### Scenario: No automated IP blocking
- **WHEN** multiple records exist with the same IP address for the same draw
- **THEN** the system SHALL NOT block any registrations based on IP — the data is informational only
