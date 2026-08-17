## ADDED Requirements

### Requirement: Admin-initiated password reset for a single artist

The system SHALL provide `POST /api/admin/authors/:id/send-password-reset`, restricted to `role = 'admin'`, which issues a single-use reset link and emails it to the address currently stored in `users.email` for that artist.

The endpoint SHALL:
1. Reject any user that is not `role = 'seller'` with 404.
2. Reject any artist whose `password_hash` is empty with 400 — that account has never been activated and belongs to the invitation flow instead.
3. Generate a 32-byte random token (`crypto.randomBytes(32).toString('hex')`).
4. Store **only** `sha256(token)` in `users.password_reset_token_hash`, together with an expiry 24 hours ahead in `users.password_reset_token_expires`, overwriting any previous value.
5. Send the plaintext token exclusively inside the email body, never in the API response nor in any log line.

#### Scenario: Admin sends a reset link to an activated artist
- **WHEN** an admin sends `POST /api/admin/authors/:id/send-password-reset` for an artist with a non-empty `password_hash`
- **THEN** the API SHALL return 200
- **AND** `users.password_reset_token_hash` SHALL hold the SHA-256 of a freshly generated token
- **AND** `users.password_reset_token_expires` SHALL be 24 hours in the future
- **AND** an email SHALL be sent to `users.email` containing `${CLIENT_URL}/restablecer-password/<token>`
- **AND** the response body SHALL NOT contain the token

#### Scenario: Reset requested for an artist who never activated
- **WHEN** an admin requests a reset for an artist whose `password_hash` is empty
- **THEN** the API SHALL return 400 with a message directing the admin to the invitation resend action
- **AND** no token SHALL be written

#### Scenario: A second request invalidates the first link
- **WHEN** an admin requests a reset twice for the same artist
- **THEN** only the token from the second request SHALL be accepted afterwards
- **AND** the link from the first request SHALL be rejected as invalid

#### Scenario: Non-admin attempts to send a reset
- **WHEN** an authenticated seller sends `POST /api/admin/authors/:id/send-password-reset`
- **THEN** the API SHALL return 401
- **AND** no token SHALL be written

#### Scenario: Reset link is independent of the activation link
- **WHEN** a reset token is issued for an artist
- **THEN** `users.password_setup_token` and `users.password_setup_token_expires` SHALL remain unchanged
- **AND** `GET /api/auth/validate-setup-token/:token` SHALL still reject the artist's account as already configured

### Requirement: Bulk password reset for all activated artists

The system SHALL provide `POST /api/admin/authors/send-password-reset-all`, restricted to `role = 'admin'`, which issues a reset link to every `role = 'seller'` user whose `password_hash` is non-empty.

Emails SHALL be sent sequentially, never concurrently. A failure on one artist SHALL NOT abort the remaining ones. The response SHALL report `{ sent, failed, total }` plus the list of email addresses that failed, so the admin can retry individually.

#### Scenario: Bulk send to a mixed roster
- **WHEN** an admin sends `POST /api/admin/authors/send-password-reset-all` with 10 activated artists and 2 pending ones
- **THEN** exactly 10 reset tokens SHALL be issued and 10 emails sent
- **AND** the 2 pending artists SHALL NOT receive an email and SHALL NOT get a token
- **AND** the response SHALL report `total: 10`

#### Scenario: One recipient fails
- **WHEN** the email provider rejects the message for one artist during a bulk send
- **THEN** the remaining artists SHALL still be processed
- **AND** the response SHALL report that artist in the failed list with its email address
- **AND** the API SHALL return 200, not 500

#### Scenario: Bulk send invalidates outstanding links
- **WHEN** an admin runs the bulk send while artists still hold links from a previous run
- **THEN** every previously issued link SHALL become invalid

### Requirement: Reset token validation endpoint

The system SHALL provide `GET /api/auth/validate-reset-token/:token`, public and rate-limited with `sensitiveLimiter`, which reports whether a reset link can still be used.

Expiry SHALL be evaluated inside SQL (`password_reset_token_expires > CURRENT_TIMESTAMP`), not by parsing the stored value in JavaScript.

The response SHALL expose only `full_name`. It SHALL NOT expose the artist's email address, id, or role.

#### Scenario: Valid, unexpired token
- **WHEN** a request is made with a token whose SHA-256 matches a stored `password_reset_token_hash` that has not expired
- **THEN** the API SHALL return 200 with `{ success: true, user: { full_name } }`

#### Scenario: Unknown or already-used token
- **WHEN** a request is made with a token that matches no stored hash
- **THEN** the API SHALL return 404 with `title: 'RESET_TOKEN_INVALID'`

#### Scenario: Expired token
- **WHEN** a request is made with a token whose hash is stored but whose `password_reset_token_expires` is in the past
- **THEN** the API SHALL return 410 with `title: 'RESET_TOKEN_EXPIRED'`

#### Scenario: Response withholds the email address
- **WHEN** any successful validation response is returned
- **THEN** the payload SHALL NOT contain the artist's email address

### Requirement: Password reset consumption endpoint

The system SHALL provide `POST /api/auth/reset-password`, public and rate-limited with `sensitiveLimiter`, accepting `{ token, password, confirmPassword }` and setting the artist's new password.

The endpoint SHALL apply the same password rules as the rest of the platform: minimum 8 characters, at least one uppercase letter, one lowercase letter and one digit, validated through the shared `validatePassword` helper in `api/controllers/authController.js`.

The write SHALL be a single conditional statement that sets `password_hash` and `password_changed_at` and clears both reset columns, guarded by the token hash, so that two concurrent requests carrying the same link cannot both succeed.

The endpoint SHALL NOT return a JWT and SHALL NOT establish a session.

#### Scenario: Successful reset
- **WHEN** a valid, unexpired token is submitted with a matching pair of compliant passwords
- **THEN** `users.password_hash` SHALL hold the bcrypt hash of the new password
- **AND** `users.password_changed_at` SHALL be set to the current UTC timestamp
- **AND** `users.password_reset_token_hash` and `users.password_reset_token_expires` SHALL both be NULL
- **AND** the response SHALL return 200 without a `token` field

#### Scenario: The same link is used twice
- **WHEN** a token is submitted a second time after a successful reset
- **THEN** the API SHALL return 404 with `title: 'RESET_TOKEN_INVALID'`
- **AND** the password set by the first request SHALL remain unchanged

#### Scenario: Two concurrent requests carry the same link
- **WHEN** two requests with the same valid token are processed concurrently
- **THEN** exactly one SHALL succeed
- **AND** the other SHALL return 404 rather than a 500

#### Scenario: Passwords do not match
- **WHEN** `password` and `confirmPassword` differ
- **THEN** the API SHALL return 400
- **AND** the token SHALL remain valid for a further attempt

#### Scenario: Password too weak
- **WHEN** the submitted password fails any of the four rules
- **THEN** the API SHALL return 400 with `title: 'RESET_PASSWORD_WEAK'` and the failing rules listed
- **AND** the token SHALL remain valid for a further attempt

#### Scenario: Expired token
- **WHEN** a token older than 24 hours is submitted
- **THEN** the API SHALL return 410 with `title: 'RESET_TOKEN_EXPIRED'`
- **AND** `password_hash` SHALL remain unchanged

### Requirement: Password reset email

The system SHALL provide `sendPasswordResetEmail({ email, fullName, token, expiresIn })` in `api/services/emailService.js`, using the same HTML structure, inline styles, logo attachment, footer and es-ES tone as `sendPasswordSetupEmail`.

The email SHALL state that the request was initiated by the gallery administrator, that the link expires in 24 hours and can be used once, and SHALL include both a button and the plain URL for clients that strip buttons.

#### Scenario: Email content and shape
- **WHEN** a reset email is generated for an artist
- **THEN** it SHALL contain a button linking to `${CLIENT_URL}/restablecer-password/<token>`
- **AND** it SHALL contain the same URL as selectable plain text
- **AND** it SHALL state the 24-hour, single-use expiry
- **AND** it SHALL carry the 140d logo and the `© <year> 140d Galería de Arte` footer used by the other transactional emails

#### Scenario: Email failure does not break the request
- **WHEN** the email provider rejects the message
- **THEN** `sendPasswordResetEmail` SHALL return `{ success: false }` rather than throwing
- **AND** the calling endpoint SHALL report the failure to the admin

### Requirement: Password change notification email

The system SHALL provide `sendPasswordChangedEmail({ email, fullName })` and SHALL send it, without blocking the response, whenever an artist's password is changed through the reset flow or through `PUT /api/seller/profile/password`.

The email SHALL tell the artist that their password has just changed and SHALL instruct them to contact the gallery if they did not make the change.

#### Scenario: Notification after a reset
- **WHEN** an artist successfully completes a password reset
- **THEN** a notification email SHALL be sent to `users.email`
- **AND** a failure sending it SHALL be logged as a warning and SHALL NOT turn the successful reset into an error response

#### Scenario: Notification after a self-service change
- **WHEN** an artist changes their password from their own profile page
- **THEN** the same notification email SHALL be sent

### Requirement: Public password reset page

The client SHALL provide `/restablecer-password/[token]`, mirroring `/user-activation/[token]` in layout, strength meter and requirement checklist, but **without** a "current password" field.

On mount it SHALL call `GET /api/auth/validate-reset-token/:token` and render one of: the form, an "invalid link" state, or an "expired link" state. Error copy SHALL be resolved from `client/lib/constants.js` keyed by the `title` code returned by the API, never by matching Spanish text.

On success it SHALL NOT log the artist in; it SHALL show a confirmation and direct them to sign in with the new password.

#### Scenario: Artist opens a valid link
- **WHEN** the artist opens `/restablecer-password/<valid-token>`
- **THEN** the page SHALL greet them by `full_name`
- **AND** SHALL display "Nueva contraseña" and "Confirmar contraseña" fields with the live strength meter and the four-rule checklist
- **AND** SHALL NOT display any "contraseña actual" field

#### Scenario: Artist opens an expired link
- **WHEN** the API answers `RESET_TOKEN_EXPIRED`
- **THEN** the page SHALL show the expired-link message telling the artist to ask the administrator for a new one
- **AND** SHALL NOT render the form

#### Scenario: Artist opens an already-used link
- **WHEN** the API answers `RESET_TOKEN_INVALID`
- **THEN** the page SHALL show the invalid-link message
- **AND** SHALL NOT render the form

#### Scenario: Artist completes the reset
- **WHEN** the artist submits a compliant, matching password pair
- **THEN** the page SHALL show a success state
- **AND** SHALL NOT store a JWT in `localStorage`
- **AND** SHALL direct the artist to sign in

### Requirement: Admin UI entry points

The authors admin screen SHALL expose the reset action for activated artists only, alongside the existing "Reenviar" action that already covers pending ones.

`/admin/autores` SHALL additionally offer a bulk "Enviar a todos" action guarded by a confirmation dialog that states explicitly that any links previously sent will stop working.

#### Scenario: Activated artist card
- **WHEN** the admin views an artist whose `is_activated` is true
- **THEN** the card SHALL offer a "Restablecer contraseña" action
- **AND** SHALL NOT offer "Reenviar"

#### Scenario: Pending artist card
- **WHEN** the admin views an artist whose `is_activated` is false
- **THEN** the card SHALL offer "Reenviar" exactly as today
- **AND** SHALL NOT offer "Restablecer contraseña"

#### Scenario: Bulk action confirmation
- **WHEN** the admin clicks "Enviar a todos"
- **THEN** a confirmation dialog SHALL appear stating that every previously sent reset link will stop working
- **AND** no request SHALL be issued until the admin confirms

#### Scenario: Bulk action result
- **WHEN** a bulk send completes
- **THEN** the admin SHALL see a notification reporting how many emails were sent and how many failed
- **AND** the failed addresses SHALL be listed
