---
paths:
  - "api/controllers/{ordersController,paymentsController,stripePaymentsController,drawAdminController,artController,adminProductEditController}.js"
  - "api/services/inventoryService.js"
  - "api/scheduler/{auctionScheduler,reservationScheduler}.js"
  - "api/tests/editionInventory.test.js"
---

## Art Limited Editions (`edition_size` / `editions_sold`)

An `art` row can represent a run of N copies (e.g. 15 prints of a digital collage), not just a unique physical work. Two columns on `art` model it: `edition_size` (fixed at creation, default 1, **immutable** — never written by any edit endpoint, same as `slug`/`status`) and `editions_sold` (copies reserved or sold).

**The load-bearing rule:** `is_sold` now means *"edition sold out"* and is **only ever written in the same SQL statement as `editions_sold`** — never on its own. That keeps every existing `is_sold` reader (gallery filter, sold badge, auction eligibility, seller dashboard) working untouched, and with `edition_size = 1` the behavior is bit-for-bit the pre-existing one. The two statements are:

```sql
-- Consume one copy (guarded increment; rowsAffected = 0 means sold out)
UPDATE art SET editions_sold = editions_sold + 1,
       is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
 WHERE id = ? AND editions_sold < edition_size
-- Release one copy (guarded decrement)
UPDATE art SET editions_sold = MAX(editions_sold - 1, 0), is_sold = 0
 WHERE id = ? AND editions_sold > 0
```

A regression test in `api/tests/editionInventory.test.js` greps `controllers/`, `services/` and `scheduler/` and fails if any `UPDATE art` touches `is_sold` without `editions_sold`.

**One consumption point per sales channel** — the counter is NOT idempotent, so a second write double-counts:
* **Checkout:** `ordersController.placeOrder` reserves. `verifyPayment` (both the Stripe path and `paymentsController`) deliberately does **not** re-mark art — the old `is_sold = 1` re-marking was only safe because a flag is idempotent.
* **Draws:** `drawAdminController.billParticipation` consumes *before* charging Stripe and releases on charge failure; `draws.units` caps how many winners can be billed.
* **Auctions:** `auctionScheduler.processAuctionEnd` consumes exactly one copy on adjudication; auction billing never touches inventory.
* **Release:** `inventoryService.releaseOrderInventory` is the single release path and claims `orders.inventory_released_at` conditionally first, so a double release (webhook + TTL cleanup) can never decrement twice.

Buyers see only "Edición limitada de N ejemplares" (never the remaining count); the cart still forbids the same artwork twice, but a buyer may purchase another copy in a later order. Texts live in `EDITION_COPY` in `client/lib/constants.js`.
