## Context

Currently, the seller withdrawal process in Kuadrat requires users to manually input their IBAN for each withdrawal, without any helpful formatting or the ability to save the information for future use. The UI for the IBAN input does not match the styled inputs found elsewhere in the application, such as the `publish` page. Furthermore, the statistics displayed to the seller on the orders dashboard (`@client/app/orders/page.js`) show a "Total retirado" which is difficult to accurately compute based on arbitrary list filters, leading to confusion. Changing this to "Total sin comisión" provides a more direct and understandable metric.

## Goals / Non-Goals

**Goals:**
- Unify the UI styling of the withdrawal modal inputs to match the rest of the application.
- Improve user experience by auto-formatting the IBAN input (space every 4 digits) and adding a "Full name" field.
- Allow users to opt-in to saving their withdrawal details (Name and IBAN) for future use.
- Update the `users` database schema to persist these details.
- Simplify and correct the dashboard statistics by replacing "Total retirado" with "Total sin comisión", summing the "Subtotal" column from the filtered table.

**Non-Goals:**
- Completely redesigning the orders dashboard or the withdrawal process.
- Supporting multiple saved bank accounts per user; only one default will be saved.
- Changing how the actual withdrawal transaction or Stripe/Revolut integration works under the hood.

## Decisions

- **Schema Update:** The `users` table will be updated in `@api/config/database.js` to include `withdrawal_recipient` (TEXT) and `withdrawal_iban` (TEXT). The `CREATE TABLE` statement will be updated directly to remain idempotent.
- **IBAN Formatting:** A simple string replacement logic using regex (e.g., `value.replace(/[^\w]/g, '').replace(/(.{4})/g, '$1 ').trim()`) will be applied on the frontend during the `onChange` event of the IBAN input to provide immediate formatting feedback.
- **Frontend State:** The withdrawal modal will need state for `recipientName`, `iban`, and `saveDetails`. We'll populate `recipientName` and `iban` from the user context if available.
- **Backend API:** The withdrawal endpoint will be updated to accept the `saveDetails`, `recipientName`, and `iban` flags. If `saveDetails` is true, the `users` table will be updated with the provided details during the withdrawal process.
- **Stats Card Logic:** The "Total sin comisión" card will dynamically compute its value on the frontend by iterating over the filtered/displayed orders list and summing their `subtotal` property.

## Risks / Trade-offs

- **Risk:** Existing users won't have the new `withdrawal_recipient` and `withdrawal_iban` columns populated.
  - **Mitigation:** The application will handle null/undefined values gracefully by leaving the input fields empty until the user fills them and checks the save option.
- **Risk:** Calculating "Total sin comisión" on the frontend based on the current list might be slightly inaccurate if pagination is involved, as it would only sum the current page.
  - **Mitigation:** If the table uses server-side pagination, the total must be calculated on the server and returned alongside the list data, or we accept it as "Total for current view". Assuming it's meant to reflect the current filtered view, a frontend calculation is simplest, but we must verify if the user expects the total across all pages. (Assuming standard dashboard behavior, the API should ideally return the aggregate). For this change, we'll try to derive it from the frontend data or request it from the backend if a stats endpoint exists.