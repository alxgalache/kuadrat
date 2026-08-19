## Context

Plausible was integrated in `aaad6a4`, its CSP wired in `ebb4b91`, its environment gate fixed in `121611c` / `c3e36e1` (change `fix-analytics-env-gate`), and then removed in `e2516b3` — a commit whose message describes an unrelated account-activation refactor. The removal touched exactly three places: two `<Script>` tags in `client/app/layout.js`, two CSP entries in `client/next.config.js`, and one word in a comment in `client/lib/env.js`. Nothing else in the codebase ever knew about analytics.

What survived is the whole gating apparatus: `client/lib/env.js` still exports `APP_ENV`/`IS_PROD`, `NEXT_PUBLIC_APP_ENV` is still wired through all four build-time places, and `openspec/specs/environment-aware-analytics/spec.md` still sits in the main specs describing a behavior that no longer exists. This change re-satisfies that spec against a different backend.

The instance runs on the Mac mini M1 under OrbStack, alongside the Kuadrat staging containers and the Nginx Proxy Manager that fronts them, exposed through ASUS DynDNS. `docker-compose.m1.yml` already declares `proxy-network` as an external network, so Plausible joins the same network and NPM reaches it by container name — no host port, no `host.docker.internal`.

## Goals / Non-Goals

**Goals:**
- Bring the repository back into compliance with a spec it currently violates.
- Measure production traffic with data that never leaves infrastructure we control.
- Make the two silent failure modes (missing `connect-src`, consent gating) explicit in the spec rather than discovered in production.
- Change nothing about how preproduction is suppressed.

**Non-Goals:**
- Server-side event tracking from `api/`.
- Proxying the tracker first-party through `deploy/nginx/`.
- Any change to the consent banner, its categories, or the pre-paint bootstrap script.
- Reachability monitoring of the instance.

## Decisions

**Decision: self-hosted CE v3.2.1 on the existing M1, not Cloud and not a VPS.**
Cloud is what was removed. A VPS would solve the availability and IP-exposure concerns cleanly but adds a recurring cost and contradicts the stated requirement that the instance live on the user's own machine. The M1 already runs NPM with a shared `proxy-network`, so the marginal infrastructure is three containers. Verified before committing to it: `ghcr.io/plausible/community-edition:v3.2.1`, `postgres:16-alpine` and `clickhouse/clickhouse-server:24.12-alpine` all publish native `linux/arm64` manifests — nothing is emulated.

**Decision: the removed snippet is restored verbatim, only the id changes.**
The removed tag was `https://analytics.140d.art/js/pa-wBK9e93pedt0sh-_3hOYT.js` with a `plausible.init()` stub and no `data-domain` attribute — the shape of Plausible's **v2 tracker**, which Cloud serves under a per-site random filename. It was not obvious that CE serves the same thing. `lib/plausible_web/plugs/tracker_plug.ex` at tag `v3.2.1` routes `"/js/pa-" <> path` to `request_tracker_script/2`, alongside the legacy `/js/script.js` variants. So CE v3.2.1 serves the identical shape, the init stub keeps working, and no `data-domain` is needed because the site is bound to the id. **This change is a revert of `e2516b3` with one string substituted**, which is why its risk profile is far lower than a first integration.

**Decision: the tracker URL stays a literal, with no `NEXT_PUBLIC_*` variable.**
`fix-analytics-env-gate` rejected per-capability flags on the grounds that each one repeats the four-place wiring cost and gets forgotten when a new environment appears. That argument still holds, and here a second one settles it: **a `NEXT_PUBLIC_*` value is embedded at build time, so changing it requires exactly the same client rebuild as changing a literal.** The variable would buy no operational flexibility whatsoever — only four more places to keep in sync. The environment axis is already carried by `IS_PROD`, which is the only axis that varies.

**Decision: `script-src` and `connect-src` are both mandatory, and the spec says so.**
The browser fetches the tracker script from the analytics origin (`script-src`) and then `POST`s each pageview to `/api/event` on that same origin (`connect-src`). Omitting the second produces a page that loads perfectly, a script that runs perfectly, and **zero recorded events**, with the only evidence in the visitor's browser console. This is the same failure the Meta Pixel comment already documents a few lines above in the same array (`connect.facebook.net` for the script, `www.facebook.com` for the events). Making it a spec requirement rather than a comment is what stops it recurring.

**Decision: analytics loads independently of cookie consent; the policy discloses it.**
Plausible's tracker sets no cookie and writes no persistent identifier to the terminal equipment, so art. 22.2 LSSI does not apply and no prior consent is required. Gating it behind `adsAllowed` would have discarded every visitor choosing "Solo las necesarias" — which is most of the reason to run a cookieless analytics at all. Transparency is still obligatory, hence the disclosure requirement on `cookie-policy-page`. `CookieConsentContext`, `CookieBanner` and `CONSENT_BOOTSTRAP_SCRIPT` are untouched; the distinction between "no consent needed" and "no disclosure needed" is the whole point.

**Decision (revised during verification): `analytics.140d.art` is terminated on the production EC2 and reverse-proxied to the Mac mini.**

The original decision was a direct browser → home path, with proxying deferred. Verification killed it. Every request reaching Nginx Proxy Manager — including ones issued from the EC2's public IP — arrived as `192.168.97.1`, which turned out to be the gateway of the Docker `proxy-network`. On macOS, OrbStack's published-port path (like Docker Desktop's) runs through a userspace proxy that **replaces the source address**; it is architectural, `network_mode: host` does not avoid it (orbstack/orbstack#1727), and no NPM setting can recover an address that never arrives.

That is not a cosmetic loss. Plausible identifies unique visitors as `hash(daily_salt, IP, User-Agent, domain)`. With the IP constant, visitors would be deduplicated **by User-Agent alone** and geolocation would always be empty — false data, not imprecise data.

The constraint chain leaves exactly one place to fix it:

1. The script posts to `BASE_URL/api/event`, baked into the generated file (`PlausibleWeb.Tracker.tracker_ingestion_endpoint/0`).
2. `BASE_URL` also governs the dashboard's URL and the WebSocket CSWSH check, so it cannot be split.
3. Whatever terminates that hostname must see the real IP.
4. Nothing inside OrbStack can.

So the hostname is terminated on the EC2, which runs ordinary Linux and does see it. It writes `X-Forwarded-For`, and because `PlausibleWeb.RemoteIP.get/1` takes the **leftmost** value, the address OrbStack appends afterwards is harmless. The property that made the header spoofable is the same one that makes this fix work.

**`$remote_addr`, never `$proxy_add_x_forwarded_for`.** The latter prepends whatever the client sent; combined with leftmost-wins and no trusted-proxy logic, any visitor could declare their own country. Confirmed experimentally before the fix: a request carrying `X-Forwarded-For: 1.1.1.1` was recorded as Australia. Overwriting at the EC2 closes it.

**Timeouts are split by route, and that split is load-bearing.** `/api/event` gets 5 s — the beacon is fire-and-forget for the visitor, but a hung connection consumes resources on the instance that also renders the gallery. `/live/websocket` gets 3600 s: under the beacon's 5 s the dashboard's LiveView socket would die every five seconds and reconnect forever.

Rejected alternatives: a native macOS proxy in front of NPM (would see the real IP, but has to own TLS outside NPM or speak PROXY protocol, which NPM does not expose — more moving parts on the machine that produced two surprises already); and moving Plausible to a small VPS (solves this, the residential-availability risk and the IP exposure at once, but contradicts the stated requirement that it live on the user's own machine).

Validated with `nginx -t` against 1.24-alpine (the instance's version, clean) and 1.27-alpine (clean, with the documented `listen ... http2` deprecation warnings), using stub certificates and the real `00-kuadrat-shared.conf`.

## Risks / Trade-offs

- **A production site's analytics endpoint on a residential connection.** If the M1 is off, the ISP rotates the IP, or DynDNS has not propagated, the script simply fails to load. Nothing visitor-facing breaks — it is `afterInteractive` and asynchronous. But **the loss is silent and Sentry will not see it**: CLAUDE.md already records that dropped connections and third-party script failures are not exceptions in application code and produce no events. This is the same shape as the documented backup blind spot (a container down at 04:00 produces no copy *and no alert*). Mitigation: none in this change; named for the monitoring work.
- ~~**The residential IP becomes public.**~~ Resolved as a side effect of the EC2 proxy: visitors resolve `analytics.140d.art` to the instance, and the home connection is reachable only from it. The router's 443 forward can optionally be narrowed to the EC2's elastic IP.
- **The EC2 is now on the analytics path.** No new single point of failure — it already serves the site — but a malformed server block would be a site-wide problem, which is why `deploy.sh` validates with `nginx -t` and restores the previous file on failure. Traffic added is one ~200-byte POST per pageview, negligible against the measured 25 req/s render ceiling.
- **Ad and tracker blockers are NOT addressed.** The hostname is still `analytics.140d.art`. True first-party would require moving `BASE_URL` onto the site's own origin, which moves the dashboard with it.
- **`X-Forwarded-For` is load-bearing and fails silently.** Plausible identifies unique visitors by hashing `IP + User-Agent + domain + daily salt`. If NPM does not forward the client IP, every request carries the proxy container's private address, **every visitor collapses into one**, and geolocation resolves to nothing. The numbers stay plausible-looking. Verification is part of the tasks: a single visit whose Location renders empty is the tell.
- **The tracker id is instance-specific.** Rebuilding the Plausible instance from scratch mints a new id and the literal in `layout.js` goes stale — script 404, no data, no error. Recorded here because the failure gives no signal.
- **Ad and tracker blockers.** A self-hosted custom subdomain evades rules targeting `plausible.io`, but `analytics.` hostnames and `/api/event` appear on some generic lists. Accepted; the first-party proxy is the answer if it proves material.
- **Preproduction contaminating production numbers.** Guarded by `NEXT_PUBLIC_APP_ENV=preprod`, which is build-time: if the M1's root `.env` is wrong, a **rebuild** — not a restart — is what would leak. Verified as a task.

## Migration Plan

1. Install and verify the instance (outside this repository); register site `140d.art`; capture the tracker id from its installation screen.
2. Move `analytics.140d.art` in Route53 from the router's DDNS CNAME to an A record at the EC2; deploy the nginx block; expand the multi-SAN certificate. Order and commands in `deploy/nginx/README.md`.
3. Confirm the header chain **from a public IP with no injected header**: the visit must resolve to a real country. An empty Location means the chain is still broken and the instance is not ready to receive the wiring.
4. Land the frontend change (layout, CSP, comment, cookie policy, CLAUDE.md).
5. Deploy production with `./deploy/deploy.sh` — the nginx page-cache purge is mandatory and already part of the script.
6. Verify in production: the script tag is present, no CSP violation in the console, a visit appears in the dashboard.
7. Verify in preproduction: the rendered HTML contains no `analytics.140d.art`.

Rollback: revert the frontend commit. The instance can keep running with no traffic; nothing else depends on it.
