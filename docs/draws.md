## Draws functionality

We want to implement a change related to the events we will have in the "Eventos" section of the application.
Currently, we have an entity called "auctions" that are displayed in that "Eventos" section in the application frontenf/client.

There will be a different type of event in addition to auctions: "Draws".
They will be shown in the very same grid inside the "Eventos" page, so we will need to add some kind of badge or label in order to let the user know if the event is an auction or a draw.
The badge element will be the same as the one we have in the auction element, but with a non-pulsing black dot.

Database tables/models will also be similar to the auctions tables/models.
Here are the differences between draws and auctions:
1. Each draw will only have one product related (the one that is being drawn). Final solution must be thinked, but it could be a polymorphic relation in draws table, since related product could be form 'arts' table ot 'others' table
2. Draws will have a "units" field. This will represent the number of units of that same product that will be drawn.
3. Draws will have a "max_participations" field. This will represent the maximum number of (unique) people that can participate in the draw. The uniqueness of the participation is important, and will be validated by user email and ip address (more on that to be defined and implemented in the backend).
4. There will be a 'draw_participations' table, where we will store the participations of each user in a draw. Structure and columns will be similar to current 'auction_bids' table, but data will be different (will have to think which data to keep and which data to remove)
5. Tables like "auction_authorised_payment_data" or "auction_buyers" will have its equivalent tables for draws functionality ('draw_authorised_payment_data', 'draw_buyers', etc)

Some of the changes in the behaviour and functionality of the application will be:

- We will need a different page for the draw details information. We will not have bids, just participations. So we will not need the "Historial de pujas" section at the right. The page layout will be very similar to the product (art or others) details page. It will include the product units for that draw, the current number of participants, and the button for "Add to cart" will be replaced by a "Inscribirse en el sorteo". This will open a modal window with different steps, similarly to the auction page modal window.
- Draws will be shown in the "Eventos" page in the same way as auctions. Draws will have a badge similar to the auction one, but will not have the pulsing red dot. Instead, we will display a black dot.

About the modal window to be shown when a user tries to participate in a draw:
- It will be very similar, and will show similar steps as the auction modal window.
- The payment authorizatrion will be the same, since the user will have to enter his card details for authorization. As in auctions, no amount will be paid in this step. The authorization will be 0EUR.
- The final step for draws will change subtly. Instead of showing the user the final price and a button to confirm the bid, we will show the confiramtion in a different way. Maybe showing the price, image, and a confirm button.
- The email sent to the user when he enters the draw will also be different. We will need to create a new email template based on the auction email template; and make the changes needed.

Regarding the appearance of the draw element in the grid for the "Eventos" page:
- Draw will only contain one product, so we will show the image, author name, title and price.
- I do not have the information or knowledge about how the grid is built currently. But I think you will have to adapt it in order to show both auctions and draws, with its differences in layout, styling and logic.

Regarding the draw details page:
- It will have the same layout as the prodcuts (art or others) details page.
- You must show ALL the information added in the draws tables (such as units available, max participations, etc) in the details page (above the button for opting in, if possible).

(You must check and analyze any other impacts of these changes in the application and add to the suitable openspec files)

