## Event List Page Layout changes

I want to implement a change in the layout and styles of the events page (route "/events" and file @client/app/eventos/page.js ).
Here are the new specs and requirements:

1. We will get rid of the event cards elements. We will keep showing the calendar view in the left side, but we will not show card elements.
Instead, we will show a layout similar to the one we have for the products (art and others) details page (image, title, author and price for each element). Since they are auctions, we will have starting price and current price for each element. We will show both prices, indicating which is each.
Some auction in the grid could have more than one products attached, so we should think how to show the images of the products, since the elements for the product list in "galeria" and "tienda" only show one image per product.
One idea would be showing a 2x2 grid inside the dedicated space in the element for the image; and follow this logic if there are more than 1 product:
2 products: images in two top elements in the 2x2 grid. Third and fourth spaces will be grey/empty
3 products: fourth space in the 2x2 grid will be grey/empty
4 products: all images in the 2x2 grid
5 or more products: first 3 in the first 2x2 grid spaces, then the fourth space in the 2x2 grid will be grey and will show a "+x" rounded (completely) label, indicating the number of products that are not shown in the grid.
2. In case auction have one product: elements for author, title and price will be very similar to the ones for the general product grid page.
3. In case auction have more than one product: author will be displayed like "Miguel García y \[x\] más. 
4. In case auction have more than one product: price information will not be shown in the grid. Instead, we should show the number of products (e.g. "3 items")
5. We will have to show a badge with the name "Subasta" in the upper left corner of grid element image/s space. The styles of that baddge must be something like this:
<div class="pill_UiPill__MWKSW"><span class="icon_UiPulsingDot__xcj4Y"><span aria-hidden="true" class="block w-5 h-5"><svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8" fill="currentColor"></path></svg></span><span aria-hidden="true" class="block w-5 h-5 icon_UiPulsingDot__animate__k4EJH"><svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8" fill="currentColor"></path></svg></span></span><span class="pill_UiPill__label__k6ScP">Draw</span></div>
(Review the code and perform the modifications needed in order to have a rounded corners badge with a pulsing-animated red dot)