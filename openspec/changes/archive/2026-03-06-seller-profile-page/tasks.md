## 1. Backend — Validation & Shared Utilities

- [x] 1.1 Export `validatePassword` function from `api/controllers/authController.js` so it can be reused by the seller password change controller
- [x] 1.2 Create Zod schema for password change request in `api/validators/sellerSchemas.js` (or add to existing file): require `currentPassword`, `newPassword`, `confirmPassword` as non-empty strings

## 2. Backend — Seller Profile Controller

- [x] 2.1 Add `getProfile` controller function in `api/controllers/sellerController.js` (or appropriate controller): query `users` table for the authenticated user's `id`, `full_name`, `email`, `email_contact`, `location`, `bio`, `profile_img`, `visible`; return with `sendSuccess()`
- [x] 2.2 Add `changePassword` controller function in the same controller: verify `currentPassword` with `bcrypt.compare()`, validate new password with `validatePassword()`, hash with `bcrypt.hash(password, 10)`, update `password_hash` in DB, return success with `sendSuccess()`

## 3. Backend — Seller Routes

- [x] 3.1 Add `GET /profile` route to `api/routes/sellerRoutes.js` mapping to `getProfile` controller
- [x] 3.2 Add `PUT /profile/password` route to `api/routes/sellerRoutes.js` with `validate()` middleware using the Zod schema, mapping to `changePassword` controller

## 4. Frontend — API Client

- [x] 4.1 Add `sellerAPI.getProfile()` method in `client/lib/api.js`: `GET /api/seller/profile`
- [x] 4.2 Add `sellerAPI.changePassword(currentPassword, newPassword, confirmPassword)` method in `client/lib/api.js`: `PUT /api/seller/profile/password`

## 5. Frontend — Seller Profile Page

- [x] 5.1 Create `client/app/seller/profile/page.js`: wrap in `AuthGuard requireRole="seller"`, fetch profile data on mount via `sellerAPI.getProfile()`, display profile info (avatar, name, email, contact email, location, bio with `SafeAuthorBio`, visibility) matching the layout of `/admin/authors/[id]` but without back link and products table
- [x] 5.2 Add "Cambiar contraseña" button in the header area (same position as "Editar" on admin author page)
- [x] 5.3 Implement password change modal inline using Headless UI `Dialog`: three password fields (current, new, confirm), warning message about session closure, "Guardar"/"Cancelar" buttons, client-side validation for matching passwords
- [x] 5.4 On successful password change: call `showBanner()` from `useBannerNotification()` with "Tu contraseña ha sido actualizada. Inicia sesión de nuevo.", then call `logout()`, then `router.push('/autores')`

## 6. Frontend — Navbar Update

- [x] 6.1 Update seller dropdown menu in `client/components/Navbar.js`: add "Perfil" link to `/seller/profile` above the "Artículos" link (desktop popover menu)
- [x] 6.2 Update seller mobile menu in `client/components/Navbar.js`: add "Perfil" link to `/seller/profile` above the "Artículos" link (mobile dialog menu)
