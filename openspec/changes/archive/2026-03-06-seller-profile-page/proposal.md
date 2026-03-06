## Why

Sellers currently have no way to view their profile information or change their password. They need a dedicated profile page to review their account details and a secure password change flow that forces re-authentication after updating credentials.

## What Changes

- Add a **"Perfil"** link in the seller dropdown menu (Navbar), positioned above "Artículos"
- Create a new **seller profile page** (`/seller/profile`) displaying the seller's profile information (name, email, location, bio, visibility) — same layout as the admin author detail page but without the "Volver a autores" link and the products table
- Replace the "Editar" button with a **"Cambiar contraseña"** button that opens a modal
- The **password change modal** collects current password, new password, and confirmation; includes a warning that saving will close the session
- Create a new **API endpoint** (`PUT /api/seller/profile/password`) to verify the current password and update to the new one using bcrypt
- After successful password change: logout, redirect to login (`/autores`), and show a **BannerNotification** confirming the password was changed and the user must log in again
- Add an **API endpoint** (`GET /api/seller/profile`) to fetch the seller's own profile data (reusing existing user/author data)

## Capabilities

### New Capabilities
- `seller-profile`: Seller profile page with account details display and password change functionality

### Modified Capabilities
_(none)_

## Impact

- **Frontend**: New page at `client/app/seller/profile/page.js`, new modal component, Navbar update for seller menu
- **Backend**: New endpoints in `api/routes/sellerRoutes.js` and controller logic for profile retrieval and password change
- **API client**: New methods in `client/lib/api.js` for seller profile and password change
- **Auth flow**: Password change triggers forced logout and redirect with banner notification
