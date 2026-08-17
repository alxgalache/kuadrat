## MODIFIED Requirements

### Requirement: Password change API endpoint
The system SHALL provide a `PUT /api/seller/profile/password` endpoint that changes the seller's password. The endpoint SHALL require seller authentication.

The request body SHALL contain: `currentPassword`, `newPassword`, `confirmPassword`.

The endpoint SHALL:
1. Verify `currentPassword` against the stored `password_hash` using `bcrypt.compare()`
2. Validate that `newPassword` matches `confirmPassword`
3. Validate `newPassword` meets password requirements (min 8 chars, uppercase, lowercase, number)
4. Hash the new password with `bcrypt.hash(password, 10)`
5. Update `password_hash` **and** `password_changed_at` in the same SQL statement, which invalidates every JWT issued before this moment
6. Send the password-change notification email without blocking the response
7. Return success response

Step 5 is what turns the client's existing "Inicia sesión de nuevo" message into the server's actual behaviour: before this change the seller's own session — and any other session opened with the old password — stayed valid until the JWT expired.

#### Scenario: Successful password change
- **WHEN** an authenticated seller sends a valid password change request
- **THEN** the API SHALL update the password hash and return 200 with success message

#### Scenario: Incorrect current password
- **WHEN** the seller sends a request with wrong `currentPassword`
- **THEN** the API SHALL return 401 with "La contraseña actual es incorrecta"

#### Scenario: New password does not meet requirements
- **WHEN** the seller sends a request with a weak `newPassword`
- **THEN** the API SHALL return 400 with specific requirement errors

#### Scenario: Sessions opened with the old password stop working
- **WHEN** a seller changes their password successfully
- **AND** a request arrives carrying a JWT issued before the change
- **THEN** the API SHALL answer 401

#### Scenario: Seller is notified of the change
- **WHEN** a seller changes their password successfully
- **THEN** a notification email SHALL be sent to their address
- **AND** a failure sending it SHALL NOT turn the successful change into an error response
