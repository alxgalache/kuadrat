# session-invalidation-on-password-change (MODIFIED)

## MODIFIED Requirements

### Requirement: JWT strategy rejects tokens issued before the last password change

`api/config/passport.js` SHALL compare the JWT's `iat` claim against **both** `users.password_changed_at` and `users.sessions_invalidated_at`, and reject the token when it was issued strictly earlier than either.

`sessions_invalidated_at DATETIME DEFAULT NULL` is the general-purpose session cut-off: it is written whenever the platform must end a user's open sessions for a reason other than a password change. Its first writer is the admin changing a seller's `seller_kind`, which alters the sections that account may reach. Writing `password_changed_at` for that purpose instead would be a lie in a column whose name asserts a password change, and would corrupt the audit of the reset flow.

The comparison SHALL be performed in whole seconds, since `iat` is expressed in seconds. Each stored timestamp SHALL be normalised to UTC before conversion — SQLite writes `CURRENT_TIMESTAMP` without a zone marker and Node's `Date` constructor would otherwise read it as local time.

The comparison SHALL be strict (`iat < cutoff`) for both columns, so a sign-in occurring within the same second as the cut-off is not rejected.

A NULL in either column SHALL invalidate nothing on account of that column. Both NULL SHALL accept every otherwise-valid token, which is what lets the second column deploy without signing anybody out.

No additional database query SHALL be introduced: the strategy already loads the full user row.

#### Scenario: Token predating the change is rejected
- **WHEN** a request arrives with a JWT whose `iat` is earlier than the user's `password_changed_at`
- **THEN** the JWT strategy SHALL fail authentication
- **AND** the request SHALL be answered 401

#### Scenario: Token predating a session invalidation is rejected
- **WHEN** a request arrives with a JWT whose `iat` is earlier than the user's `sessions_invalidated_at`
- **THEN** the JWT strategy SHALL fail authentication
- **AND** the request SHALL be answered 401

#### Scenario: Token issued after the change is accepted
- **WHEN** a request arrives with a JWT issued after the user's `password_changed_at`
- **THEN** authentication SHALL succeed normally

#### Scenario: Token issued after both cut-offs is accepted
- **WHEN** a request arrives with a JWT issued after both `password_changed_at` and `sessions_invalidated_at`
- **THEN** authentication SHALL succeed normally

#### Scenario: The later of the two cut-offs wins
- **GIVEN** a user whose `password_changed_at` is older than their `sessions_invalidated_at`
- **WHEN** a JWT arrives with an `iat` between the two
- **THEN** authentication SHALL fail

#### Scenario: Token issued in the same second as the change is accepted
- **WHEN** a JWT's `iat` in seconds equals the user's `password_changed_at` in seconds
- **THEN** authentication SHALL succeed

#### Scenario: Token issued in the same second as a session invalidation is accepted
- **WHEN** a JWT's `iat` in seconds equals the user's `sessions_invalidated_at` in seconds
- **THEN** authentication SHALL succeed

#### Scenario: Null timestamp accepts everything
- **WHEN** both a user's `password_changed_at` and `sessions_invalidated_at` are NULL
- **THEN** every otherwise-valid JWT for that user SHALL authenticate

#### Scenario: Deploying the second column signs nobody out
- **WHEN** the capability is deployed against a database where no session has been invalidated
- **THEN** every `users.sessions_invalidated_at` SHALL be NULL
- **AND** every JWT valid before the deploy SHALL continue to authenticate

#### Scenario: Non-UTC container timezone
- **WHEN** the API process runs with `TZ` set to a zone other than UTC
- **THEN** the comparison SHALL produce the same verdict as under `TZ=UTC`, for both columns

#### Scenario: No extra query is issued
- **WHEN** an authenticated request is processed
- **THEN** the JWT strategy SHALL execute exactly the one `SELECT` on `users` it executed before this capability
