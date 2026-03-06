## Context

When a seller creates a product (art or other) via the publish page, the product is inserted into the database with a default non-approved state. An admin must review and approve it. Currently there is no automated notification—the admin must manually check the dashboard.

The email service (`api/services/emailService.js`) already has multiple admin notification functions (e.g., `sendWithdrawalNotificationEmail`, `sendStaleArrivedAlertEmail`) that send to `config.registrationEmail`. The controllers `artController.js` and `othersController.js` handle product creation and return a 201 response.

## Goals / Non-Goals

**Goals:**
- Notify the admin via email whenever a seller successfully creates a product.
- Email includes seller name, product name, and a prompt to review/approve.
- Follow existing email patterns (HTML template, logo, `getFormattedSender`, `escapeForEmail`).
- Fire-and-forget: email failure must not affect the product creation response.

**Non-Goals:**
- No link to admin dashboard in the email (keep it simple, matching minimalist approach).
- No changes to the frontend publish page.
- No database schema changes.
- No new env variables (reuses existing `REGISTRATION_EMAIL`).

## Decisions

1. **Single shared email function** — One `sendNewProductNotificationEmail({ sellerName, productName, productType })` function in `emailService.js` used by both art and others controllers. This avoids duplication and keeps the email template consistent.

2. **Fire-and-forget pattern** — The email call is made after the successful DB insert but without `await` blocking the response. Errors are caught and logged (matching the pattern used in other non-critical emails). The 201 response is sent regardless of email outcome.

3. **Use `config.registrationEmail`** — Consistent with `sendStaleArrivedAlertEmail` and `sendStaleSentAlertEmail` which access the admin email via `require('../config/env').registrationEmail`. If not configured, skip silently with a warning log.

4. **Product type label** — Pass `'art'` or `'other'` so the email can display the category in Spanish ("Arte" or "Otro producto").

## Risks / Trade-offs

- **[Missing REGISTRATION_EMAIL]** → Silently skipped with a logger.warn. No action needed from the developer; the feature is opt-in via env var configuration.
- **[SMTP failure]** → Caught and logged. Product creation still succeeds. No user-facing impact.
- **[Email volume]** → If many products are created simultaneously, many emails are sent. Acceptable for this marketplace's scale; rate limiting is not needed.
