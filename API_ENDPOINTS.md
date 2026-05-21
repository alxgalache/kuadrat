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

### Certificates of Authenticity (CoA — NTAG 424 DNA)
- **`GET /coa/verify?picc=<32hex>&cmac=<16hex>`**
    - **Description:** Verifies a SUN URL emitted by a NTAG 424 DNA sticker. Decrypts the PICC payload (UID + SDM counter), validates the truncated CMAC against the per-UID session key, applies anti-replay via `last_counter`, records every attempt in `verification_events`.
    - **Auth:** Public.
    - **Rate limit:** `coaVerifyLimiter` — 60 requests per minute per IP (configurable via `COA_VERIFY_RATE_LIMIT_*`).
    - **Cache:** `Cache-Control: no-store`.
    - **Response:** `200 OK` with `{ "success": true, "status": "ok" | "malformed" | "invalid_cmac" | "unknown_tag" | "revoked" | "replay", "counter"?: number, "art"?: { id, name, slug, description, basename, type, dimensions } }`.
    - **Failure modes:** none return non-2xx for successful crypto verifications; all results — including failures — are surfaced via `status`. Only Zod schema violations (missing/malformed params) return `400`.

- **`GET /admin/coa/tags?page=&limit=&status=&art_id=`**
    - **Description:** Paginated list of NFC tags joined with the bound artwork. Filters: `status` (`active|revoked|lost|damaged`), `art_id`. Default `limit=20`, capped at 100.
    - **Auth:** Admin only (JWT + adminAuth).
    - **Response:** `200 OK` with `{ "success": true, "tags": [...], "pagination": { page, pages, total, limit } }`.

- **`GET /admin/coa/tags/:uid?events_limit=`**
    - **Description:** Detail of one tag plus the most recent `events_limit` rows from `verification_events` (default 50, max 500).
    - **Auth:** Admin only.
    - **Response:** `200 OK` with `{ "success": true, "tag": {...}, "events": [...] }`.

- **`PATCH /admin/coa/tags/:uid/status`**
    - **Description:** Updates the tag status. Idempotent: setting the same status without notes is a no-op. When `notes` is provided, the value is appended (not replaced) to the existing notes with a UTC timestamp prefix.
    - **Auth:** Admin only.
    - **Body:** `{ "status": "active" | "revoked" | "lost" | "damaged", "notes"?: "string (max 500)" }`.
    - **Response:** `200 OK` with `{ "success": true, "tag": {...updated row} }`.
    - **Notes:** does NOT allow modifying `uid`, `art_id`, `last_counter`, `is_permanently_locked`, or other cryptographically relevant fields. Status changes are logged with `adminId`, `fromStatus`, `toStatus`, `reason`.