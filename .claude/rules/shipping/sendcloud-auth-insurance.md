---
paths:
  - "api/services/shipping/{sendcloudAuth,sendcloudApiClient,sendcloudPricing,sendcloudProvider,parcelGrouper}.js"
  - "api/controllers/sendcloudConfigController.js"
  - "api/tests/sendcloudAuth.test.js"
---

## Sendcloud Authentication and Insurance

* **`SENDCLOUD_AUTH_MODE`** (`auto` | `oauth2` | `basic`, default `auto`, invalid value fails startup). `auto` tries OAuth2 `client_credentials` against `https://account.sendcloud.com/oauth2/token`, retries **once** with a fresh token on 401/403, and then resolves that request with Basic Auth, logs a `warn` and skips OAuth2 for 5 minutes. `oauth2` throws instead of degrading; `basic` never contacts the token endpoint. **429 and 5xx are not credential problems**: they never discard the token, never retry for auth reasons and never trigger the fallback. A token-endpoint failure also degrades in `auto` mode — the API never returns a 401 in that case, so the request-level fallback would never fire.
* Token cache lives in a module variable of `api/services/shipping/sendcloudAuth.js`, renewed 60 s before `expires_in`, with a single in-flight promise so N concurrent calls make one token request. There is no `refresh_token`; refreshing means asking for a new token.
* **Nothing ever logs the `Authorization` header, the secret or the token** — `api/tests/sendcloudAuth.test.js` asserts it. The client used to emit a ready-to-paste cURL with the credential at `logger.info`, on every request, in production.
* **Every shipment travels insured for the value of its goods, in both flows, with no way to disable it.** `art` insures `art.price`; `other` insures `parcel.totalValue` from `parcelGrouper.js`. `user_sendcloud_configuration.insurance_type` and `insurance_fixed_amount` are **not read by anything** (the columns stay; no form ever wrote them, so branching on them was branching on a constant). This raised the price of every store shipment.
* **The same field has a different shape in each endpoint** — copying one to the other breaks silently or with a 400: `POST /v3/shipping-options` wants a bare **integer** (`350`); `POST /v3/shipments` wants an **object** (`{ value, currency }`). Both derive from `insuredValueFor()` in `api/services/shipping/sendcloudPricing.js`, the single point that rounds and clamps to `[2, 5000]`.
* **`createShipments()` declares the insured value it quoted with.** Without it the buyer pays a premium and the parcel is announced uninsured — a failure that is invisible, because the shipment goes out fine.
* **`hasUsableRate()`** (same module) is the shared filter: a quote total that is absent, non-numeric or `<= 0` is not an option. The comparison is on the **parsed** number — Sendcloud returns the total as a string and `sendcloud:letter` quotes `"0"`, which is truthy in JavaScript and used to be the only surviving option on a large parcel.
