## ADDED Requirements

### Requirement: Every password write stamps `password_changed_at`

The `users` table SHALL carry a `password_changed_at DATETIME DEFAULT NULL` column. Every code path that writes `users.password_hash` SHALL set `password_changed_at` **in the same SQL statement**, using the same UTC format SQLite produces for `CURRENT_TIMESTAMP`.

There are exactly three such paths: the admin-initiated reset (`POST /api/auth/reset-password`), the artist's own change (`PUT /api/seller/profile/password`) and the account activation (`POST /api/auth/set-password`). The activation path stamps it for consistency even though no earlier session can exist.

A `NULL` value SHALL mean "invalidate nothing", so that deploying this capability does not sign anybody out.

#### Scenario: Reset stamps the column
- **WHEN** an artist completes an admin-initiated password reset
- **THEN** `users.password_changed_at` SHALL hold the moment of the change
- **AND** it SHALL have been written by the same statement that wrote `password_hash`

#### Scenario: Self-service change stamps the column
- **WHEN** an artist changes their password via `PUT /api/seller/profile/password`
- **THEN** `users.password_changed_at` SHALL be updated

#### Scenario: Activation stamps the column
- **WHEN** a new artist sets their first password via `POST /api/auth/set-password`
- **THEN** `users.password_changed_at` SHALL be set

#### Scenario: Existing accounts are unaffected on deploy
- **WHEN** the capability is deployed against a database where no password has been changed since
- **THEN** every `users.password_changed_at` SHALL be NULL
- **AND** every JWT issued before the deploy SHALL continue to authenticate

### Requirement: JWT strategy rejects tokens issued before the last password change

`api/config/passport.js` SHALL compare the JWT's `iat` claim against `users.password_changed_at` and reject the token when it was issued strictly earlier.

The comparison SHALL be performed in whole seconds, since `iat` is expressed in seconds. The stored timestamp SHALL be normalised to UTC before conversion — SQLite writes `CURRENT_TIMESTAMP` without a zone marker and Node's `Date` constructor would otherwise read it as local time.

The comparison SHALL be strict (`iat < changedAt`), so a sign-in occurring within the same second as the change is not rejected.

No additional database query SHALL be introduced: the strategy already loads the full user row.

#### Scenario: Token predating the change is rejected
- **WHEN** a request arrives with a JWT whose `iat` is earlier than the user's `password_changed_at`
- **THEN** the JWT strategy SHALL fail authentication
- **AND** the request SHALL be answered 401

#### Scenario: Token issued after the change is accepted
- **WHEN** a request arrives with a JWT issued after the user's `password_changed_at`
- **THEN** authentication SHALL succeed normally

#### Scenario: Token issued in the same second as the change is accepted
- **WHEN** a JWT's `iat` in seconds equals the user's `password_changed_at` in seconds
- **THEN** authentication SHALL succeed

#### Scenario: Null timestamp accepts everything
- **WHEN** a user's `password_changed_at` is NULL
- **THEN** every otherwise-valid JWT for that user SHALL authenticate

#### Scenario: Non-UTC container timezone
- **WHEN** the API process runs with `TZ` set to a zone other than UTC
- **THEN** the comparison SHALL produce the same verdict as under `TZ=UTC`

#### Scenario: No extra query is issued
- **WHEN** an authenticated request is processed
- **THEN** the JWT strategy SHALL execute exactly the one `SELECT` on `users` it executed before this capability

### Requirement: Regression guard on password writes

The test suite SHALL contain a regression test that scans `api/controllers/`, `api/routes/` and `api/services/` and fails when any statement that assigns `password_hash` does not also assign `password_changed_at`.

Without it, a future code path can set a password while leaving old sessions alive, and the failure is silent — the mechanism simply stops covering that route.

#### Scenario: A new unguarded password write is added
- **WHEN** a statement setting `password_hash` without `password_changed_at` is introduced anywhere under those three directories
- **THEN** the regression test SHALL fail and name the offending file

#### Scenario: All current writes pass
- **WHEN** the test runs against the three intended paths
- **THEN** it SHALL pass
