---
paths:
  - "api/utils/sellerCapabilities.js"
  - "client/lib/sellerCapabilities.js"
  - "api/services/sellerKindService.js"
  - "api/middleware/authorization.js"
  - "api/config/passport.js"
  - "api/routes/{artRoutes,othersRoutes,productsRoutes,sellerRoutes}.js"
  - "api/routes/admin/authorRoutes.js"
  - "api/controllers/{stripeConnectController,stripeConnectPayoutsController,marketingController,usersController,sendcloudConfigController}.js"
  - "api/scheduler/eventCreditScheduler.js"
  - "api/tests/sellerKind.test.js"
  - "client/components/Navbar.js"
  - "client/components/seller/**"
  - "client/app/{seller,orders}/**"
  - "client/app/admin/{authors,envios-seller,marketing}/**"
---

## Seller kinds: Artista and Ponente (`users.seller_kind`)

`role = 'seller'` used to be one indivisible permission — publish art, publish store, configure Sendcloud, manage shipments, host events. `users.seller_kind TEXT NOT NULL DEFAULT 'artist' CHECK(seller_kind IN ('artist','speaker'))` is a **second axis** on top of it, so a guest who only does live streams, talks, video screenings, workshops or courses can be given the events half and nothing else. es-ES labels: «Artista» / «Ponente».

* **It is not a new `role`, and that is load-bearing.** A speaker IS a seller: they invoice, hold a wallet, appear in payouts, and `eventCreditScheduler` credits them exactly like anyone else (`dealer_commission_other`, `standard_vat`). A new role value would have thrown them out of the twenty `role = 'seller'` predicates in `stripeConnectController`, `stripeConnectPayoutsController`, `marketingController`, `usersController` and `authorRoutes`, only to have to readmit them one by one.
* **The CHECK lives in the `CREATE TABLE` and NOT in the `safeAlter`**, same split as `stripe_connect_status`: SQLite does not apply a constraint added by `ALTER TABLE` to the rows already written. The enum is really enforced by Zod on the only two routes that write it (`POST`/`PUT /api/admin/authors/:id`). `DEFAULT 'artist'` deployed with **no backfill** — every existing account keeps the behaviour it had.
* **One capability module per side, never an inline comparison.** `api/utils/sellerCapabilities.js` and `client/lib/sellerCapabilities.js`. `sellerKindOf()` normalises an absent value to `'artist'` in both, which matters most on the client: the `user` object lives in `localStorage` and a session opened before this shipped carries no `seller_kind` — reading that as a speaker would strip an artist of their own screens. This is the lesson `zoneResolver` and the three-copy `productCategory === 'others'` typo in `ProductForm` already paid for.
* **`requireArtistSeller` (`api/middleware/authorization.js`) is the authority, not the menu.** Applied to every product and shipment route in `artRoutes`, `othersRoutes`, `productsRoutes` and `sellerRoutes`. `/api/seller/{wallet,withdrawals,paid-events,profile,commission-rates,stripe-connect/*}` deliberately do **not** carry it — that is a speaker's entire livelihood. `req.user.seller_kind` comes from the row passport already loads, so the strategy still issues exactly one `SELECT`.

**Changing the kind is an operation with guards, not a label edit.**

* **Demotion is REFUSED, never dragged through** — 409 `SELLER_KIND_CHANGE_BLOCKED` with the list of reasons in es-ES (`api/services/sellerKindService.js`). Blockers: live `art`/`others` (`removed = 0`), an open auction, an open draw, an order item still `NULL`/`paid`/`sent`/`arrived`. The two alternatives were rejected on purpose: hiding the artwork (`visible = 0`) unpublishes goods that may sit in a cart, a running auction or a draw with authorised charges, silently; touching nothing leaves artwork on sale whose author has no panel to manage it, and no screen reveals that state. **The auction and draw checks are not redundant with the product check** — an artwork already `removed = 1` with its campaign still running is a real corner, and it has its own test.
* **A change in EITHER direction is refused while the seller hosts an event with `status = 'active'`.** Not about products: the cut-off below would kill the token renewal of someone mid-broadcast and eject them from their own room, in front of their audience. `scheduled` does not block.
* **`users.sessions_invalidated_at` is a SECOND session cut-off, deliberately not `password_changed_at`.** `api/config/passport.js` compares `iat` against both (`isJwtIssuedBeforeSessionCutoff` in `api/utils/passwordSecurity.js`, same whole-second, strict, UTC-normalised semantics). Reusing the password column would be a lie in a column whose name asserts a password change and would corrupt the reset audit. Written **in the same `UPDATE` as `seller_kind`**, and **only when the value actually changes** — otherwise the admin could not fix a typo in a bio without throwing the artist out. Without it the seller's menu would describe the old kind for up to `JWT_EXPIRES_IN` (7 days), since the client's `user` object is only refreshed at sign-in.

**The wallet had to move first.** `/orders` carried **two** `<h1>`s — «Monedero» and «Gestión de pedidos» — under a menu entry that named only the second, mixing the balance, the payout button and `StripeConnectBanner` with the sales stats and the order list. Hiding «Pedidos» from a speaker would therefore have left them unable to see their balance or ask to be paid. The block now lives in `client/components/seller/SellerWallet.js`, mounted **once**, at `/seller/monedero`, reachable by both kinds; `/orders` keeps stats and orders and is offered to artists only. Menus: artist = Perfil · Artículos · Mis envíos · Monedero · Pedidos; speaker = Perfil · Monedero. `Navbar.js` builds **one** `sellerMenuItems` list that the desktop popover and the mobile dialog both walk — they used to be two independent JSX copies, and a divergence between them is only ever visible at one screen size.

**Other surfaces the analysis turned up:** `/admin/envios-seller` lists artists only (a speaker there is a row that will never have a shipment); the marketing announce picker and `announce-author` are restricted to artists, because that broadcast's subject is literally «Nuevo artista en 140d» (announcing a speaker needs its own template and topic — out of scope); Sendcloud config **writes** are refused for a speaker (400) while **reads** stay open and the existing row is **never deleted** by a demotion, since it is the record of shipments that really happened; the event host picker still offers both kinds and shows which is which. Auctions, draws, CoA, the shipping calculator, checkout, zone resolution and invoicing needed no change — a speaker is outside those paths by having no product, not by an added condition.

**Known blind spot:** the admin edit screen's type selector, its confirmation dialog and the rendering of the 409 blocker list have **no automated test** — `client/` still has no test runner, so a regression there will only ever be caught by a person. The whole client half was verified by hand in the browser at ship time (both menus at both breakpoints, the three redirects, the wallet page, the cleaned `/orders`, the blocked demotion showing its reasons, and an impersonated speaker rendering the speaker menu). The API half is covered by `api/tests/sellerKind.test.js` (33 cases) plus the generalised cut-off cases in `api/tests/passwordChangeInvalidation.test.js`.
