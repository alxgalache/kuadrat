## Why

Artists regularly ask the gallery to do something inside their own account — publish a piece, fix a shipping configuration, read a screen that only exists for `role = 'seller'`. Today the only way to satisfy that request is for the artist to hand over their password, which puts a live credential in a chat message, defeats the whole point of `password_changed_at` and the admin-initiated reset flow, and leaves no way to tell afterwards whether an action was the artist's or the gallery's.

The application makes the alternative cheap: the browser holds no session state beyond `localStorage.token` + `localStorage.user`, and `api/config/passport.js` rebuilds `req.user` from `jwtPayload.id` on every request. A JWT minted for the artist by the backend therefore produces a session that is indistinguishable from a real login for every existing screen, guard and endpoint — without anyone learning a password.

## What Changes

- **New backend capability: admin impersonation by token exchange.** `POST /api/admin/impersonation/:userId/start` (admin only) mints a **60-minute** JWT whose `sub` is the target user and which carries an `act` claim naming the admin. `POST /api/auth/impersonation/stop` reads that claim, re-validates the admin against the database and mints a fresh admin token. No password is read, written or transmitted at any point.
- **Every existing `req.user` check keeps working untouched.** The impersonation token is an ordinary user token as far as the JWT strategy is concerned; the `act` claim is surfaced as `req.impersonator` and consumed only by the audit trail and the two guardrails below.
- **Guardrails, deliberately few.** The target must not be `role = 'admin'` (no lateral or upward moves). `PUT /api/seller/profile/password` is refused while impersonating — it would be a permanent account takeover, and writing `password_changed_at` would invalidate the impersonation token mid-request. Everything else the artist can do, the admin can do, money movements included.
- **New table `impersonation_sessions`** — who impersonated whom, when it started, when and how it ended, from which IP. Docker log rotation is not an audit trail for a capability that lets one person act as another with full write access.
- **Frontend session swap.** `AuthContext` gains `startImpersonation` / `stopImpersonation`; the token swap goes through the context because `authAPI` writes `localStorage` directly and the provider only reads it on mount (the same reason `completeAccountSetup` exists). The admin's own token is **never** kept in the browser during impersonation.
- **Navbar exit control.** A new icon to the right of the cart, visible only while impersonating, ends the session and returns the admin to their own. It is the only always-reachable exit, since every admin screen is unreachable while wearing the artist's role.
- **`/admin/autores` actions collapse into one dropdown.** "Ver", "Editar", "Contraseña" and the new "Impersonar" no longer fit on a card; a single "Acciones" button opens a Headless UI menu containing all of them.
- **"Contraseña" gains a confirmation modal.** Bundled here by request and unrelated to impersonation: today a single click sends the artist an email and silently invalidates any reset link they already hold. The bulk action already warns about exactly this; the per-artist one does not.

## Capabilities

### New Capabilities
- `admin-user-impersonation`: an admin acting as another user through a short-lived, audited, password-free token exchange — the start/stop endpoints, the token shape and its guardrails, the persistent audit record, the client session swap and the navbar exit control.

### Modified Capabilities
- `admin-password-reset`: the "Admin UI entry points" requirement changes shape — per-artist actions move into an "Acciones" dropdown, and the individual "Contraseña" action gains the confirmation dialog that until now only the bulk action had.

## Impact

**Backend**
- `api/config/database.js` — new `impersonation_sessions` table (+ two indexes). Schema-only addition, no existing table touched.
- `api/config/passport.js` — **high risk, shared infrastructure.** The JWT strategy learns to read the `act` claim and expose `req.impersonator`. Tokens without it behave exactly as today.
- `api/controllers/impersonationController.js` (new), `api/routes/admin/impersonationRoutes.js` (new), `api/routes/authRoutes.js` (stop endpoint — it is reached with a *seller* token, so it cannot live under `routes/admin/`).
- `api/middleware/authorization.js` — new `blockWhileImpersonating` guard, applied to exactly one route.
- `api/routes/sellerRoutes.js` — that guard on `PUT /profile/password`.
- `api/app.js` — the impersonator id joins the Pino request serializer so every logged request under impersonation names its real actor.

**Frontend**
- `client/contexts/AuthContext.js` — **high risk, shared infrastructure.** New `impersonation` state plus the two actions.
- `client/lib/api.js` — `authAPI.startImpersonation` / `stopImpersonation`; the global 401 handler learns to clear the impersonation marker alongside the token.
- `client/components/Navbar.js` — exit control, desktop and mobile.
- `client/app/admin/autores/page.js` — actions dropdown + the "Contraseña" confirmation dialog.
- `client/lib/constants.js` — es-ES copy for the impersonation banner, dropdown and dialogs; the `localStorage` key for the impersonation marker.

**Dependencies:** none. `jsonwebtoken`, `@headlessui/react` and `@heroicons/react` are already in use.

**Environment:** none. The 60-minute TTL is a constant of the impersonation controller, deliberately not `JWT_EXPIRES_IN`.

## Non-goals

- **Impersonating another admin.** Refused outright; there is no scenario in which it is the safest way to answer a question.
- **Nested impersonation.** Falls out for free — the active token's role is `seller`, so `adminAuth` already rejects a second start.
- **Automatic return to the admin session when the 60 minutes expire.** The admin's token is not stashed in the browser precisely so that an XSS on artist-controlled content (bios, product titles, uploaded filenames) cannot reach an admin credential. Expiry therefore means logging in again.
- **Restoring browser-local state.** The cart, dismissed banners and guest auction/event sessions live in `localStorage` and belong to the *device*, not the account. Impersonation swaps the account; the artist's own device state is not knowable and is deliberately left untouched.
- **Notifying the artist that they were impersonated.** Out of scope here; the audit table is what makes it answerable later.
- **A seller-side "who has impersonated me" screen.**
