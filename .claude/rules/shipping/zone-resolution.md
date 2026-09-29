---
paths:
  - "api/services/shipping/{zoneResolver,legacyProvider,shippingProviderFactory}.js"
  - "api/controllers/{shippingController,shippingOptionsController,stripePaymentsController,paymentsController}.js"
  - "api/utils/paymentHelpers.js"
  - "api/validators/paymentSchemas.js"
  - "api/services/drawService.js"
  - "api/tests/shippingCostVerification.test.js"
  - "client/components/ShoppingCartDrawer.js"
---

## Shipping Zone Resolution (one resolver, two entry points)

`api/services/shipping/zoneResolver.js` is the **only** place that answers "which legacy shipping zone applies to this product, shipped to this address". The buyer's quote (`getAvailableShipping`), the server-side cost check at payment (`verifyShippingCosts`) and the legacy provider all enter through it.

* **A tariff needs three coordinates, and dropping any one reintroduces the outage of 16/08/2026.** `method_id` picks the *column* (which modality the buyer chose), the postal code picks the *row* (which zone group the destination falls in), and `product_id` picks the *table* (each artwork has its own packaging and its own rate). The old verification used only `shipping_method_id + seller_id + LIMIT 1`; once the calculator started sharing one `shipping_methods` row across every artwork and every zone group, that predicate matched 24 rows with 6 different costs and returned an arbitrary one. **Every art checkout returned 400.**
* **`verifyShippingCosts` does not query the database.** It calls the resolver and looks the chosen method up in the result, so the price shown and the price validated are the same number rather than two numbers that have to agree. The parity test in `api/tests/shippingCostVerification.test.js` asserts exactly that, and is what stops a fourth parallel query appearing — same role as `sentryGating.test.js`.
* **Three vocabularies, none optional.** `shipping_methods.article_type` is `'art' | 'others' | 'all'`; `shipping_zones.product_type` is `'art' | 'other'`; cart and payment items are `'art' | 'other'`. The resolver speaks the cart's and translates in one place (`PRODUCT_TYPES`). Comparing `'other'` against `article_type` matches nothing but `'all'`, so every dedicated store method vanishes — silently, and invisibly to the gallery, which uses `'art'` in both. It has its own test.
* **The destination is the order's delivery address, never `item.shipping.deliveryPostalCode`.** That field is captured at add-to-cart, is client-supplied, and trusting it lets a buyer pay a peninsular rate and ship to the Canaries (15,29 € vs 27,91 € on a real artwork). `create-intent` and `init-order` take `deliveryAddress: { country, postalCode }` and **reject a delivery item without it** (`SHIPPING_ADDRESS_REQUIRED`) — a fallback to the cart's postal code would *be* the bypass, since omitting the field is free. Pickup methods need no address: their zones are seller-wide. Consequence: **api and client must deploy together.**
* **`zoneId` travels out, never in.** It is returned for traceability and logged with each verified price; accepting one from the client would let the browser name the priced row.
* **Rejections carry a machine code in `title`** (`SHIPPING_ADDRESS_REQUIRED` | `SHIPPING_METHOD_UNAVAILABLE` | `SHIPPING_COST_OUTDATED`), same pattern as `CAPTCHA_UNAVAILABLE`; texts live in `SHIPPING_VERIFICATION_ERRORS` in `client/lib/constants.js`. The old single message said "Recarga la página", which fixes nothing — the cart is in `localStorage`. `SHIPPING_COST_OUTDATED` fires whenever an artwork is re-quoted in the calculator while buyers hold it in their carts.
* **Money is compared in integer cents.** `Math.abs(a - b) > 0.01` does not express "one cent of tolerance": 15,30 and 15,29 are `0.010000000000001563` apart in binary floating point, so the boundary the comparison claims to allow was rejected at random.
* **Sendcloud-quoted items never enter this path.** They reach payment with `shipping: null` (`setSendcloudShipping` writes to `shippingSelections`, a state parallel to the cart, never to `item.shipping`), and the `if (!item.shipping?.methodId) continue` guard on the first line of `verifyShippingCosts` is what keeps them out.
* **`drawService.js:694-744` still duplicates the matching predicate**, deliberately: it answers *deliverability* (a boolean), selects no `cost`, and so cannot produce a wrong charge.
* **That gap is closed.** Sendcloud shipping for `other` products really was never charged (`computeShippingTotal` sums `item.shipping.cost`, which is `null` for them) and simultaneously double-recorded (the selection was copied onto every expanded unit row). See `.claude/rules/shipping/store-shipping.md`.
