## ADDED Requirements

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

## MODIFIED Requirements

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
