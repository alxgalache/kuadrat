## ADDED Requirements

### Requirement: Seller profile navigation link
The Navbar SHALL display a "Perfil" link in the seller dropdown menu, positioned above the "Artículos" link. The link SHALL navigate to `/seller/profile`.

#### Scenario: Seller sees profile link in desktop dropdown
- **WHEN** an authenticated seller opens the user dropdown menu on desktop
- **THEN** the menu SHALL show "Perfil" as the first item, above "Artículos"

#### Scenario: Seller sees profile link in mobile menu
- **WHEN** an authenticated seller opens the mobile menu
- **THEN** the menu SHALL show "Perfil" as the first seller-specific item, above "Artículos"

### Requirement: Seller profile page displays user information
The system SHALL provide a page at `/seller/profile` that displays the authenticated seller's profile information. The page SHALL be protected by `AuthGuard` with `requireRole="seller"`. The layout SHALL match the admin author detail page (`/admin/authors/[id]`) but WITHOUT the "Volver a autores" back link and WITHOUT the products table section.

The page SHALL display:
- Profile image (or avatar fallback using ui-avatars.com)
- Full name (or email as fallback)
- Role label ("Artista")
- Biography (rendered as sanitized HTML via `SafeAuthorBio`)
- Location (if available)
- Email
- Contact email (if available)
- Visibility status (Sí/No)

#### Scenario: Seller views their profile
- **WHEN** an authenticated seller navigates to `/seller/profile`
- **THEN** the page SHALL display their profile information as described above

#### Scenario: Unauthenticated user accesses profile page
- **WHEN** an unauthenticated user navigates to `/seller/profile`
- **THEN** the system SHALL redirect them to `/autores` (login page)

### Requirement: Seller profile API endpoint
The system SHALL provide a `GET /api/seller/profile` endpoint that returns the authenticated seller's profile data. The endpoint SHALL require seller authentication (JWT + seller role).

The response SHALL include: `id`, `full_name`, `email`, `email_contact`, `location`, `bio`, `profile_img`, `visible`.

#### Scenario: Seller fetches their profile
- **WHEN** an authenticated seller sends `GET /api/seller/profile`
- **THEN** the API SHALL return their profile data with status 200

#### Scenario: Non-seller accesses seller profile endpoint
- **WHEN** a non-seller authenticated user sends `GET /api/seller/profile`
- **THEN** the API SHALL return 403 Forbidden

### Requirement: Password change button replaces edit button
The profile page SHALL display a "Cambiar contraseña" button in the same position where the admin author page shows the "Editar" button (top-right area of the profile header). Clicking this button SHALL open the password change modal.

#### Scenario: Seller clicks change password button
- **WHEN** the seller clicks the "Cambiar contraseña" button
- **THEN** a modal dialog SHALL open with the password change form

### Requirement: Password change modal
The password change modal SHALL contain:
- A form with three password fields: "Contraseña actual", "Nueva contraseña", "Confirmar nueva contraseña"
- A warning message: "Al guardar, se cerrará tu sesión y deberás iniciar sesión de nuevo."
- A "Guardar" submit button and a "Cancelar" button
- Validation feedback for password requirements (min 8 chars, uppercase, lowercase, number)

#### Scenario: Seller submits valid password change
- **WHEN** the seller fills all three fields correctly and submits the form
- **THEN** the system SHALL call `PUT /api/seller/profile/password` with the passwords
- **AND** on success, SHALL show a BannerNotification with "Tu contraseña ha sido actualizada. Inicia sesión de nuevo."
- **AND** SHALL call logout
- **AND** SHALL redirect to `/autores`

#### Scenario: Seller submits mismatched passwords
- **WHEN** the seller submits with new password and confirmation not matching
- **THEN** the modal SHALL show an error message "Las contraseñas no coinciden"
- **AND** SHALL NOT call the API

#### Scenario: Seller submits weak password
- **WHEN** the seller submits a new password that does not meet requirements
- **THEN** the API SHALL return 400 with specific validation error messages

#### Scenario: Seller submits wrong current password
- **WHEN** the seller submits an incorrect current password
- **THEN** the API SHALL return 401 with message "La contraseña actual es incorrecta"
- **AND** the modal SHALL display this error

#### Scenario: Seller cancels password change
- **WHEN** the seller clicks "Cancelar" or closes the modal
- **THEN** the modal SHALL close and no changes SHALL be made

### Requirement: Password change API endpoint
The system SHALL provide a `PUT /api/seller/profile/password` endpoint that changes the seller's password. The endpoint SHALL require seller authentication.

The request body SHALL contain: `currentPassword`, `newPassword`, `confirmPassword`.

The endpoint SHALL:
1. Verify `currentPassword` against the stored `password_hash` using `bcrypt.compare()`
2. Validate that `newPassword` matches `confirmPassword`
3. Validate `newPassword` meets password requirements (min 8 chars, uppercase, lowercase, number)
4. Hash the new password with `bcrypt.hash(password, 10)`
5. Update `password_hash` in the database
6. Return success response

#### Scenario: Successful password change
- **WHEN** an authenticated seller sends a valid password change request
- **THEN** the API SHALL update the password hash and return 200 with success message

#### Scenario: Incorrect current password
- **WHEN** the seller sends a request with wrong `currentPassword`
- **THEN** the API SHALL return 401 with "La contraseña actual es incorrecta"

#### Scenario: New password does not meet requirements
- **WHEN** the seller sends a request with a weak `newPassword`
- **THEN** the API SHALL return 400 with specific requirement errors

#### Scenario: Passwords do not match
- **WHEN** `newPassword` does not equal `confirmPassword`
- **THEN** the API SHALL return 400 with "Las contraseñas no coinciden"

### Requirement: Request validation with Zod
The `PUT /api/seller/profile/password` endpoint SHALL validate the request body using a Zod schema applied via the `validate()` middleware. The schema SHALL require `currentPassword`, `newPassword`, and `confirmPassword` as non-empty strings.

#### Scenario: Missing required fields
- **WHEN** the seller sends a request with any missing field
- **THEN** the API SHALL return 400 with validation errors

### Requirement: Post-password-change notification
After a successful password change, the system SHALL display a BannerNotification (bottom-of-screen black bar) on the redirect target page (`/autores`) confirming the password was changed and that the user must log in again.

#### Scenario: Banner shown after redirect
- **WHEN** the password change succeeds and the user is redirected to `/autores`
- **THEN** a BannerNotification SHALL appear with the message "Tu contraseña ha sido actualizada. Inicia sesión de nuevo."
- **AND** the banner SHALL auto-dismiss after 5 seconds
