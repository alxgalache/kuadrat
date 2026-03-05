## Why

The withdrawal modal has several UX and data-integrity issues: the IBAN input has no character limit, the checkbox styling is inconsistent with the rest of the app, and the "save details" checkbox doesn't correctly reflect or manage the persisted state of stored payment details.

## What Changes

- **IBAN input max length**: Limit the IBAN input to 24 alphanumeric characters (excluding the visual spaces inserted every 4 characters for readability).
- **Checkbox styling**: Change the "save details" checkbox to render black when checked, matching the existing pattern used in `seller/publish` and other pages (`text-black focus:ring-black` via Tailwind).
- **Checkbox initial state from stored data**: When a seller opens the withdrawal modal and their `withdrawal_recipient` and `withdrawal_iban` fields already have data in the `users` table, the "save details" checkbox must be pre-checked.
- **Clear stored data on uncheck**: When a seller unchecks the "save details" checkbox and submits the withdrawal, the `withdrawal_recipient` and `withdrawal_iban` columns in `users` must be cleared (set to NULL). Currently they are simply left unchanged.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `seller-withdrawals`: Adding IBAN max-length enforcement, checkbox state initialization from stored data, and clearing stored payment details when the seller unchecks the save checkbox during withdrawal.

## Impact

- **Frontend**: `client/app/orders/page.js` — IBAN input handler, checkbox styling, modal init logic.
- **Backend**: `api/routes/sellerRoutes.js` — POST `/api/seller/withdrawals` must clear `withdrawal_recipient`/`withdrawal_iban` when `saveDetails` is false and stored data existed.
- **Database**: No schema change (existing columns are already nullable TEXT).
