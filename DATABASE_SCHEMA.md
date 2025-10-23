Here is the SQL schema for the Turso database (SQLite).

### `users` table
Stores user information and their roles.

| Column          | Type          | Constraints                        | Description                               |
|-----------------|---------------|------------------------------------|-------------------------------------------|
| `id`            | INTEGER       | PRIMARY KEY AUTOINCREMENT          | Unique identifier for the user.           |
| `email`         | TEXT          | NOT NULL, UNIQUE                   | User's email address for login.           |
| `password_hash` | TEXT          | NOT NULL                           | Hashed password.                          |
| `role`          | TEXT          | NOT NULL, CHECK(role IN ('buyer', 'seller')) | User role. Defaults to 'buyer'.           |
| `created_at`    | DATETIME      | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Timestamp of user creation.               |

### `products` table
Stores all the art pieces available for sale.

| Column        | Type    | Constraints                        | Description                               |
|---------------|---------|------------------------------------|-------------------------------------------|
| `id`          | INTEGER | PRIMARY KEY AUTOINCREMENT          | Unique identifier for the product.        |
| `seller_id`   | INTEGER | NOT NULL, FOREIGN KEY(users.id)    | The seller who owns this product.         |
| `name`        | TEXT    | NOT NULL                           | Name of the artwork.                      |
| `description` | TEXT    | NOT NULL                           | Detailed description of the artwork.      |
| `price`       | REAL    | NOT NULL                           | Price in a standard currency (e.g., EUR). |
| `type`        | TEXT    | NOT NULL                           | Medium/support of the art piece (e.g., "Óleo sobre lienzo", "Lámina ilustrada"). |
| `image_url`   | TEXT    | NOT NULL                           | URL to the single product image.          |
| `is_sold`     | INTEGER | NOT NULL, DEFAULT 0                | Boolean (0 or 1) if the product is sold.  |
| `stockable`   | INTEGER | NOT NULL, DEFAULT 0                | Boolean (0 or 1) if product has stock.    |
| `stock`       | INTEGER | NULL                               | Number of units available. NULL for art.  |
| `created_at`  | DATETIME| NOT NULL, DEFAULT CURRENT_TIMESTAMP | Timestamp of product creation.            |

### `orders` table
Stores information about a completed purchase.

| Column        | Type     | Constraints                        | Description                                |
|---------------|----------|------------------------------------|--------------------------------------------|
| `id`          | INTEGER  | PRIMARY KEY AUTOINCREMENT          | Unique identifier for the order.           |
| `buyer_id`    | INTEGER  | NOT NULL, FOREIGN KEY(users.id)    | The user who made the purchase.            |
| `total_price` | REAL     | NOT NULL                           | The total cost of the order.               |
| `status`      | TEXT     | NOT NULL, DEFAULT 'completed'      | Order status (e.g., completed, shipped).  |
| `created_at`  | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP| Timestamp of the order.                    |

### `order_items` table
A junction table linking products to an order.

| Column              | Type    | Constraints                        | Description                               |
|---------------------|---------|------------------------------------|-------------------------------------------|
| `id`                | INTEGER | PRIMARY KEY AUTOINCREMENT          | Unique identifier for the order item.     |
| `order_id`          | INTEGER | NOT NULL, FOREIGN KEY(orders.id)   | The order this item belongs to.           |
| `product_id`        | INTEGER | NOT NULL, FOREIGN KEY(products.id) | The product that was purchased.           |
| `price_at_purchase` | REAL    | NOT NULL                           | The price of the product when it was sold.|

---
### **Tables for Future Auction Functionality**

### `auctions` table
Stores auction event details.

| Column               | Type     | Constraints                         | Description                                  |
|----------------------|----------|-------------------------------------|----------------------------------------------|
| `id`                 | INTEGER  | PRIMARY KEY AUTOINCREMENT           | Unique identifier for the auction.           |
| `product_id`         | INTEGER  | NOT NULL, UNIQUE, FOREIGN KEY(products.id) | The single product being auctioned.        |
| `start_date`         | DATETIME | NOT NULL                            | When the auction begins.                     |
| `end_date`           | DATETIME | NOT NULL                            | When the auction ends.                       |
| `starting_bid`       | REAL     | NOT NULL                            | The minimum starting price.                  |
| `current_highest_bid`| REAL     | NULL                                | The current highest bid amount.              |
| `winning_user_id`    | INTEGER  | NULL, FOREIGN KEY(users.id)         | The user who won the auction.                |
| `status`             | TEXT     | NOT NULL, DEFAULT 'scheduled'       | Auction status (scheduled, active, finished).|

### `bids` table
Stores a log of all bids placed in an auction.

| Column        | Type     | Constraints                          | Description                                |
|---------------|----------|--------------------------------------|--------------------------------------------|
| `id`          | INTEGER  | PRIMARY KEY AUTOINCREMENT            | Unique identifier for the bid.             |
| `auction_id`  | INTEGER  | NOT NULL, FOREIGN KEY(auctions.id)   | The auction the bid was placed in.         |
| `user_id`     | INTEGER  | NOT NULL, FOREIGN KEY(users.id)      | The user who placed the bid.               |
| `amount`      | REAL     | NOT NULL                             | The amount of the bid.                     |
| `created_at`  | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP  | Timestamp when the bid was placed.         |