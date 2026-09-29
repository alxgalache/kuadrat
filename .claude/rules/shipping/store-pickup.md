---
paths:
  - "api/controllers/{shippingOptionsController,sendcloudConfigController}.js"
  - "client/components/shipping/SellerShippingGroup.js"
  - "client/components/admin/SendcloudConfigSection.js"
  - "api/tests/storePickupFlag.test.js"
---

## Store Pickup ("Recogida en persona")

Whether the cart offers pickup for **store (`other`) products** is decided by one column and nothing else: `user_sendcloud_configuration.allow_store_pickup` (INTEGER, `NOT NULL DEFAULT 0`), surfaced as the «Permitir recogida para productos de la tienda» checkbox beside «Empaqueta él mismo» in the admin author edit screen.

* **It replaced an inference, which is the whole point.** `shippingOptionsController` used to offer pickup whenever `users.pickup_address` and `users.pickup_city` were both non-empty — an address captured for other reasons silently doubling as consent to receive buyers at the door. Now the flag grants and the address only decorates: it is read for display, an empty one does **not** hide the option, and a complete one does **not** produce it. `SellerShippingGroup` joins the parts that exist so an enabled seller with no address renders no line rather than a bare `", "`.
* **Deployed `DEFAULT 0` with no backfill, deliberately.** Every existing seller starts with pickup off and is switched on one at a time from the panel. Safe here only because a single seller had store products at the time; on any other dataset this is a silent removal of a buyer-visible option.
* **A seller with no `user_sendcloud_configuration` row has no flag.** The `LEFT JOIN` yields `NULL`, which must read as an explicit `0` rather than as "unknown".
* **Art is out of scope and must stay out.** Art shipments are arranged by hand from the Sendcloud web interface, so an art-only seller group is never offered pickup here even when the flag is on; a mixed group gets it on account of its store items. Art pickup, where it exists, is a different mechanism entirely — a `shipping_methods` row with `type = 'pickup'` resolved by `zoneResolver.loadPickupZones`, untouched by this flag.
* **The column lives on the Sendcloud configuration, not on `users`,** because pickup is the buyer-facing alternative to a Sendcloud-quoted shipment and only exists for the product type Sendcloud quotes. Consequence: the checkbox disappears with the rest of the section when `SENDCLOUD_ENABLED` is off.
* `api/tests/storePickupFlag.test.js` covers all six cases. It drives the controller directly and touches no network — `.env.test` disables Sendcloud for both product types, so the legacy provider answers from the local database.
