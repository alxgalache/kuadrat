## Context

Sellers can currently manage their products and orders but have no way to view their own profile information or change their password. The admin has a detailed author profile page (`/admin/authors/[id]/page.js`) that serves as a design reference. Logout is client-side only (clears localStorage token/user). Banner notifications are available via `BannerNotificationContext` and rendered in the root layout.

Currently there is no password-change endpoint — only a one-time `setPassword` flow for initial account activation via setup tokens.

## Goals / Non-Goals

**Goals:**
- Allow sellers to view their profile details (name, email, contact email, location, bio, visibility)
- Allow sellers to change their password via a modal with current password verification
- Force re-authentication after password change for security
- Provide clear feedback via BannerNotification after redirect

**Non-Goals:**
- Editing profile fields (name, bio, location, etc.) — out of scope for this change
- Password change for admin or buyer roles
- Password reset/recovery flow (forgot password)
- Email notifications on password change

## Decisions

### 1. API endpoint placement: seller routes vs auth routes

**Decision:** Add endpoints to `api/routes/sellerRoutes.js` as `GET /api/seller/profile` and `PUT /api/seller/profile/password`.

**Rationale:** These are seller-specific operations. The seller router already applies `authenticate + requireSeller` middleware at the router level, so no additional auth wiring is needed. Placing it in auth routes would require adding seller role checks manually.

**Alternative considered:** Adding to `authRoutes.js` as a generic `PUT /api/auth/change-password`. Rejected because this change is scoped to sellers only, and seller routes already have the right middleware applied.

### 2. Profile data source

**Decision:** Query the `users` table directly in the seller profile controller to get the authenticated user's profile data (full_name, email, email_contact, location, bio, profile_img, visible).

**Rationale:** The user ID is already available from `req.user.id` via JWT. No need for a separate service — a single SELECT query suffices. This mirrors how the admin author detail page works but scoped to the authenticated user.

### 3. Password change flow

**Decision:** Single endpoint `PUT /api/seller/profile/password` that:
1. Receives `currentPassword`, `newPassword`, `confirmPassword`
2. Validates via Zod schema
3. Verifies `currentPassword` against stored `password_hash` using `bcrypt.compare()`
4. Validates new password meets requirements (reuse `validatePassword()` from `authController.js`)
5. Hashes new password with `bcrypt.hash(password, 10)`
6. Updates `password_hash` in the database
7. Returns success response

**Rationale:** Follows existing patterns. The `validatePassword` function is already defined in `authController.js` — extract it to a shared location or re-import.

### 4. Post-password-change notification

**Decision:** After successful password change API call, the client will:
1. Call `showBanner('Tu contraseña ha sido actualizada. Inicia sesión de nuevo.')` from `useBannerNotification()`
2. Call `logout()` from `useAuth()`
3. Call `router.push('/autores')` to redirect to login

The banner state lives in React context (in-memory), which survives client-side navigation since the root layout and providers persist across App Router navigations. This means calling `showBanner()` before `router.push()` will work — the banner will be visible on the `/autores` page.

**Alternative considered:** Using URL query params (`?passwordChanged=true`) and reading them on the target page. Rejected because the BannerNotificationContext already handles this cleanly without URL pollution.

### 5. Modal component

**Decision:** Create the password change modal inline in the profile page component (not a separate component file), using Headless UI `Dialog` — matching the existing modal patterns in the codebase (e.g., `ConfirmDialog`, `VariationEditModal`).

**Rationale:** The modal is only used in one place. Creating a separate component file would be over-engineering for a single-use modal.

### 6. Reusing `validatePassword` function

**Decision:** Export `validatePassword` from `authController.js` (it's currently a module-scoped function) and import it in the seller controller.

**Alternative considered:** Duplicating the function. Rejected to avoid drift between validation rules.

## Risks / Trade-offs

- **[Risk] Banner disappears on hard navigation** → Mitigation: App Router client-side navigation preserves context state. If the user does a full page reload, the banner is lost — acceptable since the password was already changed successfully.
- **[Risk] Race condition: logout before API returns** → Mitigation: The client waits for the API success response before calling logout and redirect. Errors are shown in the modal.
- **[Trade-off] No email notification on password change** → Accepted: out of scope. Can be added later as a security enhancement.
