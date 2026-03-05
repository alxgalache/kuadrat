## Context

The withdrawal modal in `client/app/orders/page.js` allows sellers to request fund transfers. It currently has three issues: no IBAN length limit, inconsistent checkbox styling, and incorrect state management for the "save details" checkbox and its interaction with stored payment data.

All fixes are localized to two files (frontend page + backend route) with no schema changes.

## Goals / Non-Goals

**Goals:**
- Enforce a 24-character alphanumeric limit on the IBAN input (excluding formatting spaces)
- Make the checkbox visually consistent with the rest of the app (black when checked)
- Pre-check the "save details" checkbox when stored payment details exist
- Clear stored payment details from the database when the seller unchecks the box and submits

**Non-Goals:**
- Full IBAN format validation (country code, check digits, etc.) — out of scope
- Changing the withdrawal flow or adding new steps
- Modifying the admin withdrawal management

## Decisions

### 1. IBAN length enforcement in the onChange handler
**Decision**: Cap the raw (space-stripped) value at 24 characters before re-applying the 4-char spacing format.
**Rationale**: The formatting logic already strips non-alphanumeric characters and adds spaces every 4 chars. Adding a `.slice(0, 24)` before the formatting step is the minimal change. This keeps the existing regex approach intact.

### 2. Checkbox styling via Tailwind `accent-black`
**Decision**: Use the `accent-black` Tailwind utility class on the checkbox input, matching the pattern already used in `client/app/seller/publish/page.js` (`text-black focus:ring-black`).
**Rationale**: The existing checkbox in the withdrawal modal uses `text-black focus:ring-black` already, but if the browser default accent color still shows blue, adding `accent-black` ensures the checkmark itself renders black. The seller/publish page and ShoppingCartDrawer already use similar patterns.

### 3. Derive initial checkbox state from stored data
**Decision**: In `openWithdrawalModal()`, set `saveDetails` to `true` when `savedPaymentDetails.recipientName` or `savedPaymentDetails.iban` are non-empty.
**Rationale**: This directly reflects the stored state — if data exists, the user previously opted to save, so the checkbox should reflect that.

### 4. Clear stored data on the backend when saveDetails is false
**Decision**: In the `POST /api/seller/withdrawals` handler, when `saveDetails` is `false`, set `withdrawal_recipient = NULL` and `withdrawal_iban = NULL` in the `UPDATE users` query (instead of leaving them untouched).
**Rationale**: This ensures the user's intent to stop saving details is respected. The existing `else` branch already runs an UPDATE on `users`; we just extend it to null out the two columns. On the frontend, also clear `savedPaymentDetails` state when `saveDetails` is false after successful submission.

## Risks / Trade-offs

- **[Risk] Existing stored data cleared unintentionally** → Mitigated by pre-checking the checkbox when data exists; the user must actively uncheck to clear.
- **[Risk] Browser inconsistency with `accent-black`** → Tailwind's `accent-*` utilities are well-supported in modern browsers; combined with `text-black`, coverage is comprehensive.
