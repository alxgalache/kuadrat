All endpoints are prefixed with `/api`.

### Auth
- **`POST /auth/register`**
    - **Description:** Registers a new user.
    - **Body:** `{ "email": "user@example.com", "password": "password123", "role": "seller" }`
    - **Response:** `201 Created` with `{ "message": "User registered successfully" }`
- **`POST /auth/login`**
    - **Description:** Logs in a user.
    - **Body:** `{ "email": "user@example.com", "password": "password123" }`
    - **Response:** `200 OK` with `{ "token": "JWT_TOKEN", "user": { "id": 1, "email": "...", "role": "..." } }`

### Products
- **`GET /products`**
    - **Description:** Gets a list of all non-sold products.
    - **Auth:** Public.
    - **Response:** `200 OK` with `[ { product1 }, { product2 } ]`
- **`GET /products/:id`**
    - **Description:** Gets details for a single product.
    - **Auth:** Public.
    - **Response:** `200 OK` with `{ product_details }`
- **`POST /products`**
    - **Description:** Creates a new product listing.
    - **Auth:** Seller only.
    - **Body:** `{ "name": "Artwork", "description": "...", "price": 100.0, "type": "Óleo sobre lienzo", "image_url": "..." }`
    - **Response:** `201 Created` with `{ new_product }`
- **`DELETE /products/:id`**
    - **Description:** Deletes a product. A seller can only delete their own product.
    - **Auth:** Seller only (owner of the product).
    - **Response:** `204 No Content`
- **`GET /products/seller/me`**
    - **Description:** Gets all products listed by the currently logged-in seller.
    - **Auth:** Seller only.
    - **Response:** `200 OK` with `[ { product1 }, { product2 } ]`

### Orders
- **`POST /orders`**
    - **Description:** Creates a new order (simulates a purchase).
    - **Auth:** Buyer or Seller.
    - **Body:** `{ "productIds": [1, 2] }`
    - **Response:** `201 Created` with `{ new_order_details }`. Sends a confirmation email.
- **`GET /orders`**
    - **Description:** Gets the order history for the logged-in user.
    - **Auth:** Buyer or Seller.
    - **Response:** `200 OK` with `[ { order1 }, { order2 } ]`
- **`GET /orders/:id`**
    - **Description:** Gets the details of a single order. User must be the buyer of the order.
    - **Auth:** Buyer or Seller (owner of the order).
    - **Response:** `200 OK` with `{ order_details_with_items }`