## Draws functionality

We want to implement a change related to the events we will have in the "Eventos" section of the application.
Currently, we have an entity called "auctions" that are displayed in that "Eventos" section in the application frontenf or client.

There will be a different type of event in addition to auctions: "Draws".
They will be shown in the very same list inside the "Eventos" page, so we will need to add some kind of badge or label in order to let the user know if the event is an auction or a draw.
This ui element must be more visible than the currently existing badges/labels for author, status, etc; but not too big.

Database tables/models will also be similar to the auctions tables/models.
Here are the differences between draws and auctions:
1. Each draw will only have one product related (the one that is being drawn). Final solution must be thinked, but it could be a polymorphic relation in draws table, since related product could be form 'arts' table ot 'others' table
2. Draws will have a "units" field. This will represent the number of units of that same product that will be drawn.
3. Draws will have a "max_participations" field. This will represent the maximum number of (unique) people that can participate in the draw. The uniqueness of the participation is important, and will be validated by user email and ip address (more on that to be defined and implemented in the backend).
4. There will be a 'draw_participations' table, where we will store the participations of each user in a draw. Structure and columns will be similar to current 'auction_bids' table, but data will be different (will have to think which data to keep and which data to remove)
5. Tables like "auction_authorised_payment_data" or "auction_buyers" will have its equivalent tables for draws functionality ('draw_authorised_payment_data', 'draw_buyers', etc)

Some of the changes in the behaviour and functionality of the application will be:

- We will need a different page for the draw detail information. We will not have bids, just participations. So we will not need the "Historial de pujas" section at the right. The page layout will be very similar to the product (art or others) details page. It will include the units, the current number of participants, and the button for "Add to cart" will be replaced by a "Inscribirse en el sorteo". This will open a modal window with different steps, similarly to the auction page modal window.
- 

(You must check and analyze any other impacts of these changes in the application)

