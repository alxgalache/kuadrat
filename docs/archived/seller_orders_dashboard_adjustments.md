## Adjustments for seller orders dashboard page

I want to add some changes and new implementations in the page where the seller sees and manages their orders.
The frontend route is "/orders" and the page file in @client/app/orders/page.js .
As you can see, I have added a new section in the page called "Monedero". I want you to implement the following changes in that section:
- Currently, a hardcoded value is vbeing displayed for both the "15%" percentage of comission in the text under "Monedero" title and the amount available for withdrawal.
I want to display the correct information for both values. For comission percentage, it should be taken from a new client environment variable called "DEALER_COMMISSION".
Its value will be 15 by default. For the amount available for withdrawal, I want to implement the following logic:
Since we are currently not storing the sum of all the amounts with the commission, applies for each seller, we will need a new field or column in database 'users' table. This new column will be called "available_withdrawal", and will store the summation of the money the seller has available for withdrawal. This value must be edited when an order (or product for that seller inside an order with products from multiple sellers) change to status "confirmed". In that case, the amount of the product or products, ONCE THE COMMISSION HAS BEEN APLIED, must me added to that amount. You must put a lot of attention and effort when analyzing and documenting the exact point where this value must be updated, in order to avoid any errors (for example, adding the order amount twice, or not substracting the amount on money withdrawal)
In the same way, when a seller user makes a withdrawal using the button in "Monedero" section, the amount of the withdrawal must be subtracted from the "available_withdrawal" column.
In order to have control and a history of the withdrawals, it could be useful to add a new table in database called "withdrawals" where we could stores this information. Please analyze if it would be useful to add this new table.
This new amount/data is what it will be displayed in the page above the "Realizar transferencia" button in "Monedero" section.
Obviously, that amount will not change depending on the filters applied in the "Gestión de pedidos" section. This value will be the value that is stored in the "available_withdrawal" column in the "users" table.
Then, for the "Gestión de pedidos" section, I would like to implement the following changes:
- We will no longer display the first card in stats (title "Disponible para retirar"), since we are now showing this information in the "Monedero" section.
Instead, we will display a card with the title "Número de pedidos", and we will show the number of orders in the database for the logged in seller (with the filter that is applied in that moment: "Esta semana", "Este mes", "Este año", etc).
Then, the workflow for the "Realizar transferencia" button in "Monedero" section is the following:
When the seller clicks in the button, a new modal window will be displayed. The modal window will have a title and a description for information, and a input field for the seller account IBAN.
The seller user will type in his IBAN number, will click on a "next" button, and a new step in the modal window will be displayed, in order for the seller user to confirm the IBAN number (this way he will be able to check if it is correct).
Of course, you must add a validation in the api end in order to check if the user is cheating modifying the request from the frontend in order to receive an amount greater than the available withdrawal.
By now, it will generate a new registry in the table I mentioned before about withdrwals history, and will send an email to the admin user in order to notify him about the new withdrawal.
We will not perform the bank transfer automatically by now, but you will have to take it into account for future development.
- Finally, I want to include information icons besides every card title in the "stats" card group. When the user will have a tooltip with the information and explanation of each amount, and it will be displayed when the user clicks on the information icon.
Please start the opsx flow for all these implementations and changes. If there are some specifications you find incomplete or not clear, you must indicate it in the proposal or design files, in order to make them visible to me when reviewing that files so that I can complete the information.
