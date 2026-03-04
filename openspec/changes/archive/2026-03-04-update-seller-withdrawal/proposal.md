## Why

The current withdrawal experience for seller users has styling inconsistencies and lacks convenience features like formatting and saving payment details for future use. Additionally, the "Total retirado" statistic card on the orders dashboard is currently not functioning correctly and represents a complex calculation. Changing it to "Total sin comisión" provides immediate, reliable value to sellers by reflecting the subtotal of their sales.

## What Changes

- **Withdrawal Form UI/UX:** Update input styling (border, padding) in the withdrawal modal to match the rest of the application (e.g., `publish` page).
- **IBAN Formatting:** Auto-format the IBAN input field with a space every 4 digits for better readability.
- **Recipient Details:** Add a "Full name" input field above the IBAN field.
- **Save Payment Details:** Add a checkbox below the IBAN field to save the beneficiary name and account number for future withdrawals.
- **Database Schema:** Add `withdrawal_recipient` and `withdrawal_iban` columns to the `users` table to store saved payment details.
- **Dashboard Stats:** Change the "Total retirado" card title to "Total sin comisión" on the seller orders dashboard.
- **Dashboard Stats Logic:** Update the value of the "Total sin comisión" card to calculate the sum of the "Subtotal" column from the filtered orders list.

## Capabilities

### New Capabilities

*(No entirely new capabilities, modifying existing ones)*

### Modified Capabilities

- `seller-withdrawals`: Update withdrawal form fields (styling, IBAN formatting, recipient name) and add capability to save/retrieve payment details. Update user schema to support saving these details.
- `orders-dashboard-stats`: Update the logic and title for the withdrawal statistic card to reflect the subtotal without commission based on the current list filters.

## Impact

- **Frontend:**
  - `@client/app/orders/page.js`: Withdrawal modal form UI, state management, and dashboard statistics cards logic.
- **Backend:**
  - `@api/config/database.js`: `users` table schema update.
  - Withdrawal APIs (`@api/controllers/productsController.js` or related withdrawal endpoint) will need to handle saving user preferences if the checkbox is checked, and pre-filling if data exists.
  - `@api/validators/withdrawalSchemas.js` or equivalent might need to validate the new fields if sent to the backend.