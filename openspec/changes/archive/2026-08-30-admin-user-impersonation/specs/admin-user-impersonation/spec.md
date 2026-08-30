## ADDED Requirements

### Requirement: Starting an impersonation session

The system SHALL provide `POST /api/admin/impersonation/:userId/start`, mounted under `api/routes/admin/index.js` so that `authenticate` + `adminAuth` already apply, which returns a session for the target user without reading, writing or transmitting any password.

The endpoint SHALL:
1. Load the target from `users` by `id` and return 404 when it does not exist.
2. Refuse a target whose `role` is `'admin'` with 403 and the machine code `IMPERSONATION_TARGET_FORBIDDEN` in `title` — including the caller themselves.
3. Refuse a target whose `password_hash` is empty with 400 and the code `IMPERSONATION_TARGET_NOT_ACTIVATED`: that account has never been activated, so there is no session to reproduce.
4. Mint a JWT whose payload carries `id`, `email` and `role` of the **target** — the same three fields `authController.login` signs — plus an `act` claim holding `{ id, email, iat }` of the **admin**, expiring 60 minutes from issue.
5. Open a row in `impersonation_sessions` and return its id inside the `act` claim as `sid`.
6. Return `{ token, user, impersonation: { adminName, expiresAt } }`, where `user` has the same shape `POST /api/auth/login` returns.

The 60-minute lifetime SHALL be a constant of the impersonation controller and SHALL NOT read `JWT_EXPIRES_IN`: an impersonation is an intervention, not a session, and inheriting the 7-day login lifetime would silently make it one.

The response SHALL NOT contain the target's `password_hash`, `password_setup_token` or `password_reset_token_hash`.

#### Scenario: Admin starts impersonating an activated artist
- **WHEN** an admin sends `POST /api/admin/impersonation/:userId/start` for a `role = 'seller'` user with a non-empty `password_hash`
- **THEN** the API SHALL return 200 with a JWT whose `id` is the target's
- **AND** the token SHALL carry an `act` claim naming the admin
- **AND** the token SHALL expire 60 minutes after issue
- **AND** a row SHALL be inserted in `impersonation_sessions` with `ended_at` NULL
- **AND** no column of the target's `users` row SHALL be modified

#### Scenario: Admin targets another admin
- **WHEN** an admin sends a start request for a user whose `role` is `'admin'`
- **THEN** the API SHALL return 403 with `title` `IMPERSONATION_TARGET_FORBIDDEN`
- **AND** no token SHALL be issued and no audit row SHALL be written

#### Scenario: Admin targets their own account
- **WHEN** an admin sends a start request naming themselves
- **THEN** the API SHALL return 403 with `title` `IMPERSONATION_TARGET_FORBIDDEN`

#### Scenario: Target never activated
- **WHEN** an admin sends a start request for a user whose `password_hash` is empty
- **THEN** the API SHALL return 400 with `title` `IMPERSONATION_TARGET_NOT_ACTIVATED`
- **AND** no token SHALL be issued

#### Scenario: Non-admin attempts to start an impersonation
- **WHEN** an authenticated seller or buyer sends a start request
- **THEN** the API SHALL return 401 from the existing `adminAuth` middleware
- **AND** no token SHALL be issued and no audit row SHALL be written

#### Scenario: Unauthenticated request
- **WHEN** a request with no `Authorization` header reaches the start endpoint
- **THEN** the API SHALL return 401

### Requirement: An impersonation token is an ordinary user token

The JWT strategy in `api/config/passport.js` SHALL resolve an impersonation token exactly as it resolves a login token: by loading `users` where `id = jwtPayload.id` and populating `req.user` from that row. No existing `req.user.id` or `req.user.role` check anywhere in the API SHALL need modification.

When the payload carries an `act` claim, the strategy SHALL additionally expose `req.impersonator = { id, email, sessionId }`. When it does not, `req.impersonator` SHALL be `undefined` and behavior SHALL be byte-for-byte what it is today.

The `password_changed_at` rejection SHALL continue to apply against the **target**, unchanged: a token is rejected when its `iat` predates the target's `password_changed_at`.

#### Scenario: Seller endpoint reached with an impersonation token
- **WHEN** `GET /api/seller/products` is called with an impersonation token for artist X
- **THEN** the API SHALL return exactly the products it returns for artist X's own session
- **AND** `req.user.id` SHALL be X's id

#### Scenario: Admin endpoint reached with an impersonation token
- **WHEN** any `/api/admin/*` endpoint is called with an impersonation token for a seller
- **THEN** `adminAuth` SHALL return 401, because `req.user.role` is `'seller'`
- **AND** starting a second, nested impersonation SHALL therefore be impossible

#### Scenario: Ordinary login token is unaffected
- **WHEN** a token minted by `POST /api/auth/login` reaches any authenticated endpoint
- **THEN** `req.impersonator` SHALL be `undefined`
- **AND** the request SHALL be handled identically to before this change

#### Scenario: Target's password changes mid-impersonation
- **WHEN** the target's `password_changed_at` is set to a moment after the impersonation token was issued
- **THEN** the impersonation token SHALL be rejected with 401 like any other stale token

### Requirement: Ending an impersonation session

The system SHALL provide `POST /api/auth/impersonation/stop`, declared in `api/routes/authRoutes.js` and protected by `authenticate` only. It cannot live under `api/routes/admin/` because it is reached carrying a **non-admin** token, which `adminAuth` would reject.

The endpoint SHALL:
1. Return 400 with `title` `IMPERSONATION_NOT_ACTIVE` when the presented token carries no `act` claim.
2. Load the admin named in `act.id` and refuse with 403 `IMPERSONATION_ACTOR_INVALID` when that user no longer exists or is no longer `role = 'admin'`.
3. Refuse with 403 `IMPERSONATION_ACTOR_INVALID` when `act.iat` predates the admin's current `password_changed_at`, reusing `isJwtIssuedBeforePasswordChange()` from `api/utils/passwordSecurity.js` — an admin whose password was reset while they were impersonating SHALL NOT be able to return to an admin session.
4. Mint a fresh admin token with the standard `JWT_EXPIRES_IN` lifetime and no `act` claim.
5. Close the `impersonation_sessions` row named by `act.sid` with `ended_reason = 'manual'`.

#### Scenario: Admin ends an impersonation
- **WHEN** an admin sends `POST /api/auth/impersonation/stop` with a valid impersonation token
- **THEN** the API SHALL return 200 with a JWT whose `id` is the admin's and which carries no `act` claim
- **AND** the corresponding `impersonation_sessions` row SHALL have `ended_at` set and `ended_reason = 'manual'`

#### Scenario: Stop called with an ordinary token
- **WHEN** a normally logged-in seller calls the stop endpoint
- **THEN** the API SHALL return 400 with `title` `IMPERSONATION_NOT_ACTIVE`
- **AND** no token SHALL be issued

#### Scenario: The actor is no longer an admin
- **WHEN** the stop endpoint is called and the user named in `act.id` has been demoted or deleted
- **THEN** the API SHALL return 403 with `title` `IMPERSONATION_ACTOR_INVALID`
- **AND** no admin token SHALL be issued

#### Scenario: The actor's password changed during the impersonation
- **WHEN** the admin's `password_changed_at` is later than `act.iat`
- **THEN** the API SHALL return 403 with `title` `IMPERSONATION_ACTOR_INVALID`

#### Scenario: Expired impersonation token
- **WHEN** the stop endpoint is called more than 60 minutes after the session started
- **THEN** the request SHALL be rejected with 401 by the JWT strategy before reaching the handler
- **AND** no admin token SHALL be issued

### Requirement: Password change is refused while impersonating

`api/middleware/authorization.js` SHALL export `blockWhileImpersonating`, which rejects any request whose `req.impersonator` is set with 403 and `title` `IMPERSONATION_ACTION_BLOCKED`. It SHALL be applied to `PUT /api/seller/profile/password` in `api/routes/sellerRoutes.js`.

Two independent reasons make this non-optional: it would hand the admin permanent access to the artist's account under a password the artist does not know, and writing `password_changed_at` would invalidate the in-flight impersonation token, so the admin's next request would 401 into a full logout.

No other endpoint SHALL carry this guard. Everything else the artist can do — publishing, editing, shipping configuration, withdrawal requests, Stripe Connect onboarding — the admin SHALL be able to do while impersonating, since replacing the artist at those tasks is the reason the feature exists.

#### Scenario: Password change attempted while impersonating
- **WHEN** `PUT /api/seller/profile/password` is called with an impersonation token
- **THEN** the API SHALL return 403 with `title` `IMPERSONATION_ACTION_BLOCKED`
- **AND** `users.password_hash` and `users.password_changed_at` SHALL be unchanged

#### Scenario: Artist changes their own password normally
- **WHEN** the artist calls the same endpoint with their own login token
- **THEN** the request SHALL succeed exactly as before this change

#### Scenario: Withdrawal requested while impersonating
- **WHEN** `POST /api/seller/withdrawals` is called with an impersonation token
- **THEN** the request SHALL be processed exactly as it would for the artist's own session
- **AND** the audit trail SHALL record that the request was made under impersonation

### Requirement: Persistent audit trail

`api/config/database.js` SHALL define `impersonation_sessions` with, at minimum: `id`, `admin_user_id` (FK `users`), `target_user_id` (FK `users`), `started_at` defaulting to `CURRENT_TIMESTAMP`, `expires_at`, `ended_at` (nullable), `ended_reason` (nullable, `CHECK IN ('manual', 'expired')`), and `ip_address` stored as an HMAC-SHA256 using `IP_HASH_SALT`, matching the treatment `verification_events` already gives IPs.

The table SHALL be indexed on `admin_user_id` and on `target_user_id`.

Rows SHALL never be deleted or overwritten by the application. A session that is abandoned rather than stopped SHALL simply keep `ended_at` NULL; `expires_at` is what tells a reader when it stopped being usable.

Both endpoints SHALL additionally emit a structured `logger.info` line naming the admin id, the target id and the session id.

#### Scenario: Session recorded end to end
- **WHEN** an admin starts and then stops an impersonation
- **THEN** exactly one `impersonation_sessions` row SHALL exist for it
- **AND** it SHALL name both users, its start, its expiry and its end
- **AND** `ended_reason` SHALL be `'manual'`

#### Scenario: Session abandoned without stopping
- **WHEN** an admin starts an impersonation and never calls the stop endpoint
- **THEN** the row SHALL remain with `ended_at` NULL
- **AND** `expires_at` SHALL record when the token stopped being usable

#### Scenario: IP is not stored in clear
- **WHEN** any session row is written
- **THEN** `ip_address` SHALL hold an HMAC-SHA256 digest, never a readable address

### Requirement: Requests made under impersonation name their real actor in the logs

The Pino request serializer in `api/app.js` SHALL include the impersonator's user id on every request whose token carries an `act` claim, so that a log line produced while impersonating can be attributed to the human who made it rather than only to the account it was made under.

Requests carrying an ordinary token SHALL log exactly what they log today.

#### Scenario: Logged request under impersonation
- **WHEN** any authenticated request is served with an impersonation token
- **THEN** its log entry SHALL carry both the acting admin's id and the impersonated user's id

#### Scenario: Logged ordinary request
- **WHEN** any authenticated request is served with a login token
- **THEN** its log entry SHALL be unchanged from before this change

### Requirement: Client session swap

`client/contexts/AuthContext.js` SHALL expose `startImpersonation(userId)` and `stopImpersonation()`, and SHALL expose an `impersonation` value that is `null` outside an impersonation and `{ targetName, adminName, expiresAt }` during one.

The swap SHALL go through the context rather than through `client/lib/api.js` alone: `authAPI` writes `localStorage` directly and `AuthProvider` reads it only on mount, so a client-side navigation after a direct write would leave `user` stale — the same reason `completeAccountSetup` exists.

`startImpersonation` SHALL replace `localStorage.token` and `localStorage.user` with the impersonation session, write the impersonation marker, and navigate to `/galeria` — where a real login lands. `stopImpersonation` SHALL replace them with the admin session returned by the stop endpoint, clear the marker, and navigate to `/admin/autores`.

The admin's own token SHALL NOT be written to `localStorage`, `sessionStorage`, a cookie or any other browser storage while an impersonation is active. Stashing it would place an admin credential within reach of any XSS occurring on artist-controlled content, which is exactly the content the admin is there to look at. The consequence — that an expired impersonation means logging in again — is accepted.

The global 401 handler in `client/lib/api.js` SHALL clear the impersonation marker alongside `token` and `user`, so an expired impersonation cannot leave the UI claiming a session that no longer exists.

#### Scenario: Admin starts an impersonation from the authors screen
- **WHEN** the admin confirms the impersonation dialog for artist X
- **THEN** `localStorage.user` SHALL hold artist X's user object
- **AND** the browser SHALL navigate to `/galeria`
- **AND** the navbar SHALL render the seller menu, not the admin menu

#### Scenario: The admin token is never stored during impersonation
- **WHEN** an impersonation session is active
- **THEN** no browser storage SHALL contain a JWT whose role is `admin`

#### Scenario: Reloading the page mid-impersonation
- **WHEN** the admin reloads or reopens the tab while impersonating
- **THEN** the impersonated session SHALL still be active
- **AND** the exit control SHALL still be visible

#### Scenario: Impersonation token expires
- **WHEN** any request returns 401 because the 60 minutes elapsed
- **THEN** the token, the user and the impersonation marker SHALL all be cleared
- **AND** the browser SHALL land on the home page in a logged-out state

#### Scenario: Device-local state survives the swap
- **WHEN** an impersonation starts or ends
- **THEN** the shopping cart and any dismissed-banner flags SHALL be left untouched

### Requirement: Navbar exit control

`client/components/Navbar.js` SHALL render, only while `impersonation` is non-null, a control immediately to the right of the shopping cart that ends the impersonation. It SHALL be present in both the desktop bar and the mobile menu.

The control is the only always-reachable exit: while impersonating, the active role is not `admin`, so every admin screen — including the one the impersonation was started from — is closed by `AuthGuard`.

The navbar SHALL also make the impersonated identity visible, so the admin can never mistake whose account they are acting in.

#### Scenario: Exit control visible during impersonation
- **WHEN** an impersonation is active
- **THEN** the navbar SHALL show the exit control to the right of the cart icon
- **AND** it SHALL identify the impersonated artist

#### Scenario: Exit control absent otherwise
- **WHEN** no impersonation is active, whether logged in as admin, as seller or logged out
- **THEN** the navbar SHALL render exactly as it does today

#### Scenario: Admin ends the impersonation from the navbar
- **WHEN** the admin activates the exit control
- **THEN** the admin session SHALL be restored
- **AND** the browser SHALL navigate to `/admin/autores`
- **AND** the admin menu SHALL be available again

#### Scenario: Exit fails because the actor is no longer valid
- **WHEN** the stop request is refused with `IMPERSONATION_ACTOR_INVALID`
- **THEN** the client SHALL clear the session entirely and send the user to the login screen
- **AND** SHALL NOT leave the impersonated session active

### Requirement: Impersonation entry point on the authors screen

`/admin/autores` SHALL offer an "Impersonar" action for every activated artist, inside the actions dropdown, guarded by a confirmation dialog that states whose account is about to be entered and that the session lasts 60 minutes.

The action SHALL be absent for artists whose `is_activated` is false, matching the endpoint's refusal for accounts with no password.

#### Scenario: Activated artist card
- **WHEN** the admin opens the actions dropdown for an activated artist
- **THEN** it SHALL offer "Impersonar"

#### Scenario: Pending artist card
- **WHEN** the admin opens the actions dropdown for an artist who has never set a password
- **THEN** "Impersonar" SHALL NOT be offered

#### Scenario: Confirmation before entering
- **WHEN** the admin activates "Impersonar"
- **THEN** a confirmation dialog SHALL name the artist and state the 60-minute limit
- **AND** no request SHALL be issued until the admin confirms
