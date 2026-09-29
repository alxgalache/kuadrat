## MODIFIED Requirements

### Requirement: Email OTP verification
The system SHALL verify participant email addresses by sending a 6-digit numeric OTP code via email. The OTP flow SHALL be triggered by `POST /api/draws/:id/send-verification` (which also validates DNI) and confirmed by `POST /api/draws/:id/verify-email`. Emails SHALL be normalised (trimmed, lower-cased) on the server in both endpoints. The code SHALL be generated with a CSPRNG and compared in constant time. A successful verification SHALL return a `verificationToken`: 32 random bytes, of which only the SHA-256 is stored, in `draw_email_verifications.token_hash`, alongside `verified_at`. That token is the only proof `register-buyer` accepts, and it is valid for 60 minutes from `verified_at`.

#### Scenario: OTP sent successfully
- **WHEN** `POST /api/draws/:id/send-verification` is called with a valid, unique DNI and email
- **THEN** the system SHALL generate a 6-digit numeric code, store it in `draw_email_verifications` with a 10-minute expiry, and send it to the provided email address

#### Scenario: OTP email content
- **WHEN** the OTP email is sent
- **THEN** the email SHALL contain the subject "Código de verificación - Kuadrat" and the body SHALL include the 6-digit code with the text "Tu código de verificación es:" in Spanish

#### Scenario: OTP verified successfully
- **WHEN** `POST /api/draws/:id/verify-email` is called with the correct code within the expiry window
- **THEN** the system SHALL mark the verification as complete, store the token hash and `verified_at`, and return `{ success: true, verificationToken }`

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
- **WHEN** `POST /api/draws/:id/send-verification` is called again for the same email and draw, at least 30 seconds after the previous send
- **THEN** the system SHALL invalidate any previous OTP and verification token for that email+draw combination and generate a new code

#### Scenario: Resend within the cooldown
- **WHEN** `POST /api/draws/:id/send-verification` is called again for the same email and draw less than 30 seconds after the previous send
- **THEN** the system SHALL answer 400 `OTP_RESEND_TOO_SOON` and send nothing
