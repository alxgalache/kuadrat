## Why

When a seller publishes a new product (art or other), an admin must review and approve it before it appears on the site. Currently there is no notification—the admin has to manually check the dashboard. Sending an email upon product creation ensures timely review and faster listing activation.

## What Changes

- Add a new email template function `sendNewProductNotificationEmail` in `api/services/emailService.js` that sends a notification to the admin email (`config.registrationEmail` / `REGISTRATION_EMAIL` env var).
- Call this email function from `createArtProduct` in `api/controllers/artController.js` and `createOthersProduct` in `api/controllers/othersController.js` after successful product insertion.
- The email contains the seller's name (`req.user.full_name`), the product name, and a message indicating the product needs validation/approval.
- Email sending is fire-and-forget (does not block the response or cause failure if email fails).

## Capabilities

### New Capabilities
- `admin-new-product-notification`: Email notification sent to admin when a seller creates a new product, containing seller name, product name, and a review prompt.

### Modified Capabilities

## Impact

- **Backend code**: `api/services/emailService.js` (new exported function), `api/controllers/artController.js` and `api/controllers/othersController.js` (add email call after product creation).
- **No frontend changes** required — the publish page already works; the email is triggered server-side.
- **No database changes** required.
- **No new dependencies** — uses existing Nodemailer transporter and email helpers.
