# admin-user-impersonation (MODIFIED)

## MODIFIED Requirements

### Requirement: Client session swap

`client/contexts/AuthContext.js` SHALL expose `startImpersonation(userId)` and `stopImpersonation()`, and SHALL expose an `impersonation` value that is `null` outside an impersonation and `{ targetName, adminName, expiresAt }` during one.

The swap SHALL go through the context rather than through `client/lib/api.js` alone: `authAPI` writes `localStorage` directly and `AuthProvider` reads it only on mount, so a client-side navigation after a direct write would leave `user` stale — the same reason `completeAccountSetup` exists.

`startImpersonation` SHALL replace `localStorage.token` and `localStorage.user` with the impersonation session, write the impersonation marker, and navigate to `/galeria` — where a real login lands. `stopImpersonation` SHALL replace them with the admin session returned by the stop endpoint, clear the marker, and navigate to `/admin/autores`.

The user object written on both halves of the swap SHALL carry `seller_kind` alongside `id`, `email`, `role` and `full_name`. The navbar and `AuthGuard` compose the seller's sections from that field, so an impersonation that omitted it would render an artist's menu over a speaker's account — offering the admin sections the server will then refuse — or the reverse, hiding from the admin exactly what they impersonated the artist to look at.

The admin's own token SHALL NOT be written to `localStorage`, `sessionStorage`, a cookie or any other browser storage while an impersonation is active. Stashing it would place an admin credential within reach of any XSS occurring on artist-controlled content, which is exactly the content the admin is there to look at. The consequence — that an expired impersonation means logging in again — is accepted.

The global 401 handler in `client/lib/api.js` SHALL clear the impersonation marker alongside `token` and `user`, so an expired impersonation cannot leave the UI claiming a session that no longer exists. This is also the path an impersonation takes when the admin changes that seller's `seller_kind` from another tab: the cut-off in `sessions_invalidated_at` predates the impersonation token, the next request answers 401, and the session is cleared rather than left claiming capabilities it no longer has.

#### Scenario: Admin starts an impersonation from the authors screen
- **WHEN** the admin confirms the impersonation dialog for artist X
- **THEN** `localStorage.user` SHALL hold artist X's user object
- **AND** the browser SHALL navigate to `/galeria`
- **AND** the navbar SHALL render the seller menu, not the admin menu

#### Scenario: Impersonating a speaker renders the speaker's menu
- **WHEN** the admin impersonates a seller with `seller_kind = 'speaker'`
- **THEN** `localStorage.user` SHALL carry `seller_kind: 'speaker'`
- **AND** the navbar SHALL show «Perfil» and «Monedero» only
- **AND** «Artículos», «Mis envíos» and «Pedidos» SHALL NOT be offered

#### Scenario: Impersonating an artist renders the artist's menu
- **WHEN** the admin impersonates a seller with `seller_kind = 'artist'`
- **THEN** the navbar SHALL show the full artist menu

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

#### Scenario: The impersonated seller's kind changes mid-session
- **GIVEN** an active impersonation of seller X
- **WHEN** the admin changes X's `seller_kind` from another session
- **THEN** the impersonation token SHALL stop authenticating
- **AND** the marker, token and user SHALL be cleared by the 401 handler

#### Scenario: Device-local state survives the swap
- **WHEN** an impersonation starts or ends
- **THEN** the shopping cart and any dismissed-banner flags SHALL be left untouched
