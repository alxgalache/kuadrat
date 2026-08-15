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
### Art shipping calculator

Admin-only. Quotes an artwork against the four Spanish shipping territories using its **package** measurements and turns the chosen options into `shipping_methods` + `shipping_zones` rows. The checkout is unchanged: it keeps reading zones through the legacy lookup, and this is only where the number in `shipping_zones.cost` comes from.

- **`GET /admin/art-shipping/products?title=&author=&page=&limit=`**
    - **Description:** Paginated list of art products with their packaging fields (`outside_dimensions`, `outside_weight`, `packaging_cost`), plus `calculated_at` and `generated_zones` summarising what the calculator has already written. `title` and `author` filter with SQL `LIKE`. Default `limit=20`, capped at 100.
    - **Auth:** Admin only (JWT + adminAuth).
    - **Response:** `200 OK` with `{ "success": true, "products": [...], "pagination": { page, pages, total, limit } }`.

- **`PATCH /admin/art-shipping/:artId/packaging`**
    - **Description:** Saves the packaging fields without quoting. The **only** writer of these three columns besides the quote endpoint — they are deliberately absent from the product creation and edit forms and from `GET /admin/products/:id/edit-data`.
    - **Auth:** Admin only.
    - **Body:** `{ "outside_dimensions"?: "70x70x8", "outside_weight"?: 5500, "packaging_cost"?: 5 }` — at least one field. `outside_dimensions` must match `/^\d+x\d+x\d+$/` (cm), `outside_weight` is an integer in grams `> 0`, `packaging_cost` is `>= 0`.
    - **Response:** `200 OK` with `{ "success": true, "product": { id, outside_dimensions, outside_weight, packaging_cost } }`.

- **`POST /admin/art-shipping/:artId/quote`**
    - **Description:** Persists the packaging fields **before** calling Sendcloud (so the values survive a provider failure), then issues four `POST /v3/shipping-options` calls in parallel — `28001` peninsula, `07001` Baleares, `35001` Canarias, `51001` Ceuta/Melilla. The artwork always travels insured for `art.price` (rounded, clamped to 2–5000 €); the artist's `insurance_type` is never consulted.
    - **Auth:** Admin only.
    - **Body:** `{ "outside_dimensions": "70x70x8", "outside_weight": 5500, "packaging_cost"?: 5 }`. Dimensions and weight are **mandatory**: there is no fallback to the artwork's own `dimensions`/`weight`, because the carrier bills the volumetric weight of the box.
    - **Response:** `200 OK` with `{ "success": true, "artwork": {...}, "groups": { "<zone>": { postalCode, options, noRateOptions, error } }, "saved": { "<zone>": [...] } }`. Each eligible option carries `baseCost`, `breakdown`, `vatAmount`, `packagingCost` and `finalPrice = round(baseCost × 1.21, 2) + packagingCost`. Options with `quotes: []` land in `noRateOptions` (shown but not selectable); options whose total parses to `<= 0` are discarded entirely.
    - **Failure modes:** `400` when the packaging fields are missing or malformed, or when the artist has no `user_sendcloud_configuration` row; `404` when the artwork does not exist. One zone failing does not fail the request — that group comes back with `error` set and the other three with their options.

- **`POST /admin/art-shipping/:artId/zones`**
    - **Description:** Replaces the generated zones of **one** zone group with the selection currently on screen. Set semantics, not incremental: the previous generated zones of that group are deleted and the new ones written in a single batch. The delete is bounded by `(product_id, product_type, zone_group, source = 'sendcloud_calculator')`, so zones created by hand and the other three groups are never touched. An empty `selections` array clears that territory.
    - **Auth:** Admin only.
    - **Body:** `{ "zone_group": "peninsula" | "baleares" | "canarias" | "ceuta_melilla", "selections": [{ "option_code": "correos:standard", "name"?: "Correos Estandar", "carrier_code"?: "correos", "base_cost": 6.38, "estimated_days"?: 2 }] }`. The priced option travels in the request rather than being re-quoted server-side, so the zone holds exactly the price the admin was looking at.
    - **Response:** `200 OK` with `{ "success": true, "artId", "zoneGroup", "provinces": [...], "removedMethods": [...], "zones": [{ optionCode, shippingMethodId, baseCost, packagingCost, cost }] }`.
    - **Method cleanup:** a `shipping_methods` row left without a single `shipping_zones` row anywhere — across every artwork and every zone group — is deleted along with them, and its option code is listed in `removedMethods`. Only rows carrying a `sendcloud_option_code` are ever swept (a hand-made method with no zones is one being configured), and only the codes this save could have orphaned. Selecting the option again recreates the row.
