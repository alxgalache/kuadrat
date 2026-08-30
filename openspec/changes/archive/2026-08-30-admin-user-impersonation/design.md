## Context

The current answer to "el artista no sabe hacerlo, hazlo tú" is that the artist sends their password. That single act undoes three mechanisms the codebase already paid for: `password_changed_at` (which exists so that a changed password ends every session opened with the old one), the admin-initiated reset flow (built precisely so an admin never needs to know a password), and the ability to say afterwards whether a change to an artwork was the artist's or the gallery's.

Three properties of the existing code decide the shape of the fix:

* **The browser holds no session state beyond two `localStorage` keys.** `client/lib/api.js` reads `token` for the `Authorization` header; `AuthContext` reads `user` once on mount and every screen derives from it (`AuthGuard`'s `requireRole`, the navbar's `isAdmin`/`isSeller`, `orders/page.js`'s `isSeller`). There is no server session, no cookie, no per-user cache. Swap those two keys and the entire frontend is, in every observable respect, the other user.
* **`api/config/passport.js` rebuilds `req.user` from `jwtPayload.id` on every request.** Nothing in the API trusts the token's `role` claim; the row is re-read each time. A JWT signed for the target therefore produces the target's `req.user` in all ~40 places that read it, with no change to any of them.
* **There is a precedent for exactly this kind of "real row, not a bypass" decision.** `event_attendees.is_staff` (admin access to Live events) chose to create a genuine attendee row rather than special-case the admin inside `getViewerToken`, because the identity is re-derived in seven places that would all have to agree. Impersonation is the same problem at the scale of the whole API, and it takes the same answer.

## Goals / Non-Goals

**Goals:**

* An admin can act as a non-admin user with an experience indistinguishable from that user's own login, without any password being read, written or transmitted.
* Zero modification to existing authorization logic. `requireSeller`, `adminAuth`, every `req.user.id` filter and every `AuthGuard requireRole` keep working untouched, and a token without the new claim behaves byte-for-byte as today.
* Who acted as whom, and when, is answerable months later from the database.
* Leaving impersonation is always one click away, from any screen.

**Non-Goals:**

* Impersonating another admin, or nesting impersonations.
* Returning automatically to the admin session when the token expires.
* Restoring or isolating browser-local state (cart, dismissed banners, guest auction/event sessions).
* Notifying the artist, or giving them a "who impersonated me" screen.
* Read-only or partially restricted impersonation. The point is to *do the task*; the only blocked action is the password change, for the reasons in Decision 5.

## Decisions

### 1. Token exchange, not a proxy header or a server session

**Chosen:** the backend mints a second JWT whose subject is the target user, and the client swaps it into `localStorage`.

Two alternatives were considered and rejected:

* **An `X-Impersonate-User: <id>` header on the admin's own token, resolved in the JWT strategy.** It keeps a single credential and needs no exchange endpoint — but it inverts the security default. Every request from an admin browser would then be one header away from being someone else's, and any code path that reads a user id *before* the strategy runs, or that talks to the API without going through `client/lib/api.js` (`getProtectedEventVideoUrl`, the Agora socket join, which passes the raw JWT), would silently keep acting as the admin. The failure mode is a screen that is *half* impersonated, which is worse than one that is not.
* **A server-side impersonation session keyed by the admin's token.** It centralizes revocation, but the project has no session store — adding one for this is a new stateful dependency in a stack that is deliberately stateless, and it would have to be consulted on every request.

The token exchange is what makes the "no existing check changes" guarantee real: downstream of `passport.js`, an impersonated request is not distinguishable from a real one, because it *is* one.

### 2. The `act` claim (RFC 8693) rather than a parallel record

The impersonation token carries `act: { id, email, iat, sid }` — the actor claim of the OAuth 2.0 Token Exchange RFC, used for exactly this. Two consequences follow, and both matter:

* **The impersonation state is inside the signed token**, so a user who edits `localStorage` to claim they are impersonating gains nothing: the client-side marker only drives the UI, and the server reads the claim.
* **The return path needs no stored state.** `POST /api/auth/impersonation/stop` reads `act.id`, re-loads that user, checks they are still an admin, and mints a fresh admin token.

`act.iat` carries the admin's original session `iat` so the stop endpoint can apply `isJwtIssuedBeforePasswordChange()` against the admin's current `password_changed_at`. Without it, resetting an admin's password would sign out their sessions everywhere *except* the impersonation they happened to be inside, which is precisely the hole `password_changed_at` was added to close.

### 3. The admin's own token is not kept in the browser

The obvious implementation stashes the admin token under a second key (`admin_token`) and restores it on exit. It is rejected.

During an impersonation the admin is, by definition, looking at artist-controlled content: bios, artwork titles and descriptions, uploaded filenames, order notes. That is the highest-risk window for an XSS in the whole application, and stashing the admin credential is what would turn such an XSS from "steal a seller session" into "steal an admin session". The exchange endpoint costs one request and removes the credential from reach entirely.

**The accepted cost is explicit:** there is no automatic return. If the 60 minutes elapse, or the stop request fails, the admin logs in again. That is a worse minute, and a much better failure mode.

### 4. 60 minutes, as a constant of the controller — not `JWT_EXPIRES_IN`

Reading `JWT_EXPIRES_IN` would give impersonation the 7-day lifetime of a login, and a 7-day impersonation is a second account, not an intervention. The number lives beside the code that mints the token, in the same spirit as the local 21 % VAT constant in `artShippingCalculator.js`: it is decoupled from the login lifetime deliberately, because the two answer different questions and should not move together.

Expiry is handled by the *existing* 401 path in `client/lib/api.js` (clear storage, go home) with one addition — clearing the impersonation marker too, so the UI can never claim a session that is gone.

### 5. Exactly one blocked action, and it is blocked for two independent reasons

`PUT /api/seller/profile/password` is refused while impersonating, via a `blockWhileImpersonating` guard applied to that single route. Either reason alone would justify it:

* It would set a password the artist does not know, handing the admin permanent, unaudited access — the exact thing this feature exists to avoid.
* It writes `password_changed_at`, which the JWT strategy compares against the token's `iat`. The impersonation token would be invalidated by its own request, and the admin's next call would 401 into a logout. Even as a "feature" it would be a confusing one.

Everything else stays open, including `POST /api/seller/withdrawals` and Stripe Connect onboarding. Those move real money and create legal identity, and the decision to allow them is deliberate: they are among the tasks artists most often cannot complete alone, the money moves to the artist's own registered IBAN and not to a destination the admin chooses, and the audit table records who ordered it. The guard exists as a named, exported middleware rather than an `if` inside the route so that adding a second blocked endpoint later is one line, not a copied condition.

### 6. A table, not just log lines

`impersonation_sessions` is a new table in `api/config/database.js`. Pino writes to Docker's log driver, which rotates; the question "who edited this artwork in March" has to survive that. The project already reaches for a table whenever an action is sensitive and needs to be answerable later — `verification_events`, `stripe_connect_events`, `marketing_sends` — and this is the same category.

The IP is stored as an HMAC-SHA256 using the existing `IP_HASH_SALT`, matching `verification_events`. Rows are never deleted or overwritten: an abandoned session simply keeps `ended_at` NULL, and `expires_at` says when it stopped being usable. A background job to mark abandoned sessions `'expired'` is deliberately not added — it would be a scheduler earning its keep by writing a value that `expires_at` already implies.

### 7. Landing on `/galeria`, and why the navbar is the only exit

Starting an impersonation navigates to `/galeria` — where a real login lands, so the parity is literal. It also sidesteps a trap: the admin starts from `/admin/autores`, which `AuthGuard requireRole="admin"` closes the instant the role changes. Staying put would produce a redirect to `/` that reads like a bug.

That same fact is why the exit control has to live in the navbar rather than on any admin screen: while impersonating, **every** admin screen is unreachable, including the one the session was started from. The navbar is the only component rendered on every route in `app/layout.js`.

### 8. Device-local state is left alone, on purpose

The cart, `event_attendee_*`, `auction_buyer_*`, dismissed banners and the Agora background preference all live in `localStorage` and survive the swap. This is a decision, not an oversight: **impersonation swaps the account, not the browser.** The artist's cart lives in the artist's browser and is not knowable here; clearing the admin's would destroy real state to simulate something unattainable. The cart is guest-oriented anyway — `ShoppingCartDrawer` reads `user` only to prefill name, email and phone, which under impersonation prefills the artist's, which is the correct behavior.

## Risks / Trade-offs

* **`api/config/passport.js` is shared infrastructure and every authenticated request in the application goes through it.** → The change is additive and guarded: `req.impersonator` is populated only when `jwtPayload.act` exists, and the existing return shape is untouched. A test asserting that a token with no `act` claim produces `req.impersonator === undefined` and an unchanged `req.user` is what keeps it honest.
* **`AuthContext` is shared infrastructure too, and it is read by the navbar, `AuthGuard` and several pages.** → `impersonation` is a new value defaulting to `null`; no existing consumer's shape changes. Note the constraint recorded in `CLAUDE.md`: every context in `app/layout.js` must read `localStorage` from an effect, never from a `useState` initializer, or the server render and the client disagree. The impersonation marker must follow the same rule.
* **An admin forgets they are impersonating and takes an action believing it is their own.** → The navbar makes the impersonated identity visible at all times, not just an exit icon, and the 60-minute ceiling bounds the window.
* **An admin can act as an artist with full write access, money included.** This is the feature, accepted knowingly. → The audit table names the actor on every session, and every log line produced under impersonation carries both ids.
* **A stolen impersonation token is a seller session for up to 60 minutes and cannot be revoked short of resetting the target's password** (which sets `password_changed_at` and kills it). → Same exposure profile as any login token, with a lifetime 168 times shorter.
* **`/api/auth/impersonation/stop` sits on the public auth router**, which is the correct place — it is reached with a seller token — but it means an endpoint that mints an *admin* token is not behind `adminAuth`. → Its entire authority comes from a signed `act` claim it cannot forge, and it re-validates the actor's current role and `password_changed_at` in the database before minting anything. It must have a test for each refusal path.
* **The global 401 handler did not actually run, and this feature is the first thing to depend on it.** Found while verifying the expiry path: `apiRequest` in `client/lib/api.js` did `const data = await response.json()` before testing `response.ok`, and passport answers an invalid or expired JWT with a bare-text `Unauthorized`. The parse threw first, so the handler that clears the session and returns home was dead code on exactly the responses it existed for — a lapsed session simply stayed in `localStorage` and every page failed to load until someone reloaded by hand. Tolerable before; not tolerable now, because a lapsed impersonation would leave the navbar claiming "Actuando como …" over a dead session with an exit button that cannot work. → The body is parsed defensively (the pattern `apiDownloadRequest` in the same file already used), and a 2xx with an unparseable body still throws exactly as before. **This is a fix to shared client infrastructure that every authenticated screen goes through**, so it is called out here rather than buried in the task list.
* **Client and API deploy together.** The client cannot start an impersonation against an API that lacks the endpoints, and an impersonation token issued by a new API reaching an old client would render an artist session with no exit control. Same coupling `sendcloud-art-shipping-calculator` already documented for `deliveryAddress`.

## Migration Plan

Schema-additive only: `initializeDatabase()` creates `impersonation_sessions` with `IF NOT EXISTS` on the next start, and no existing table is touched. There is no data migration and no backfill.

Deploy API and client together (`./deploy/deploy.sh`). Rollback is reverting both: no old token gains meaning under the new code, and no new token survives a rollback — an impersonation token reaching the old API is simply a seller token that expires within the hour, which the old code handles correctly on its own.

## Open Questions

None blocking. Two deferred by decision: notifying the artist that their account was entered, and a seller-facing view of their own impersonation history. Both build cleanly on `impersonation_sessions` if they are ever wanted.
