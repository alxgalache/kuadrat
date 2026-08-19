## 0. Prerequisites (self-hosted instance — outside this repository)

These block every task below. None of the frontend work can be verified until they hold.

- [x] 0.1 Plausible CE v3.2.1 running on the M1; `curl --head http://localhost:8000` answers from `server: Cowboy` (a `302` to `/register` on a fresh instance is the healthy response; the wiki's `200` is a post-setup instance)
- [x] 0.2 `https://analytics.140d.art` reachable from outside the LAN, with a valid certificate and a working dashboard (confirms NPM's **Websockets Support** is on — the dashboard is Phoenix LiveView)
- [x] 0.3 Site `140d.art` registered in the instance; **id captured: `pa-JOgfdmGauUrT5eiOHnIDj`** from its installation screen — this string is the input to task 1.2
- [x] 0.4 **HIGH-RISK / silent failure — depends on block 6.** An event sent **from a public IP with no injected header** resolves to a real country. Established during verification: OrbStack's published-port path on macOS replaces the source address with the Docker gateway (`192.168.97.1`), so this cannot pass until `analytics.140d.art` is terminated on the EC2. An empty Location means visitors are deduplicated by User-Agent alone and geolocation is dead — numbers that look believable and are not. **Blocks 5.4 (deploy), nothing else.**

## 1. Frontend: tracker

- [x] 1.1 In `client/app/layout.js`, re-add `import Script from 'next/script'` and `import { IS_PROD } from '@/lib/env'`
- [x] 1.2 In `client/app/layout.js`, inside `<body>` after the provider tree (the position `e2516b3` removed it from), re-add the `IS_PROD`-gated fragment: the `beforeInteractive` init stub (`window.plausible=...;plausible.init()`) and the `afterInteractive` `<Script src="https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js" />` using the id from task 0.3. No `data-domain` attribute — the id binds the site
- [x] 1.3 Verify the gate reads `IS_PROD` alone: no `useCookieConsent`, no `adsAllowed`, no `CookieConsentContext` reference in the analytics fragment

## 2. Frontend: Content Security Policy

**HIGH-RISK — shared infrastructure.** `client/next.config.js` governs every third-party origin the site may contact; a malformed directive breaks Stripe, Agora or the whiteboard, not just analytics.

- [x] 2.1 Add `'https://analytics.140d.art'` to the `cspConnectSrc` array in `client/next.config.js`, with a comment stating that without it the tracker loads and records nothing
- [x] 2.2 Append `https://analytics.140d.art` to the `script-src` directive string in `client/next.config.js`
- [x] 2.3 Confirm both are present: `grep -c "analytics.140d.art" client/next.config.js` returns `2`

## 3. Frontend: comment and legal copy

- [x] 3.1 In `client/lib/env.js`, restore `analytics` to the list of prod-only concerns in the header comment (currently reads "future Sentry env, robots, etc.")
- [x] 3.2 In `client/app/legal/politica-de-cookies/page.js`, add the Plausible disclosure in es-ES covering the three points of the `cookie-policy-page` delta: self-hosted, no cookies or persistent identifiers, therefore outside art. 22.2 LSSI and requiring no prior consent
- [x] 3.3 Confirm the Meta Pixel paragraphs in sections 2 and 4 of that page are unchanged and that Plausible is clearly differentiated from them

## 4. Documentation

- [x] 4.1 Add a "Plausible Analytics (autoalojado)" section to `CLAUDE.md` covering: instance location and topology (M1 + OrbStack + NPM on `proxy-network`), why the tracker URL is a literal and not a `NEXT_PUBLIC_*`, why both CSP directives are mandatory, why it loads without consent, and the two blind spots (silent data loss with no Sentry event; `X-Forwarded-For` collapsing all visitors into one)
- [x] 4.2 Note in the same section that the id `pa-JOgfdmGauUrT5eiOHnIDj` is instance-specific: rebuilding the instance from scratch mints a new id and silently 404s the current literal
- [x] 4.3 Write `docs/plausible-analytics.md`: the complete from-scratch installation (OrbStack, Plausible, NPM, DNS, EC2 proxy, certificate), the verification that cannot be skipped, day-to-day operation (backups, upgrades, memory ceilings), a symptom→cause table of every failure hit during the original install, and disaster recovery for losing either machine

## 5. Verification

- [x] 5.1 Confirm the M1's root `.env` has `NEXT_PUBLIC_APP_ENV=preprod`. It is build-time: if it is wrong, the leak happens on the next **rebuild**, not on a restart
- [x] 5.2 Build the client with `NEXT_PUBLIC_APP_ENV=preprod` and confirm the output contains no `analytics.140d.art` reference
- [x] 5.3 Build with `NEXT_PUBLIC_APP_ENV=production` (or unset) and confirm both the init stub and the script tag are present. Use `NODE_ENV=production` — the local containers set `development` and `next build` fails under it (see CLAUDE.md)
- [x] 5.4 Deploy production with `./deploy/deploy.sh`; the nginx page-cache purge is mandatory and already part of the script
- [x] 5.5 Load `https://140d.art` in production: the script tag is present in the HTML, and the browser console shows **no CSP violation**
- [x] 5.6 Confirm the visit appears in the dashboard within a minute, with a real country in Location
- [x] 5.7 Load `https://pre.140d.art` and confirm the HTML contains no `analytics.140d.art`

## 6. Production nginx: analytics reverse proxy (EC2)

**HIGH-RISK — shared infrastructure.** `deploy/nginx/140d.art.conf` serves the whole site and the API. A malformed block is site-wide, not analytics-wide. `deploy.sh` validates with `nginx -t` and restores the previous file on failure; do not bypass it.

- [x] 6.1 Add the analytics server block (sixth) to `deploy/nginx/140d.art.conf`: `$remote_addr` into `X-Forwarded-For` (never `$proxy_add_x_forwarded_for`), `resolver` + variable in `proxy_pass` so the DDNS name is re-resolved, `proxy_ssl_verify on`, and timeouts split 5 s for `/api/event` vs 3600 s for `/live/websocket`
- [x] 6.2 Add the port-80 companion block for `analytics.140d.art` in certbot's own style, so HTTP-01 can issue and renew the SAN
- [x] 6.3 Renumber the port-80 section (4 → 5) and update the file header: six blocks, four names on one multi-SAN certificate
- [x] 6.4 Validate with `nginx -t` on 1.24 (the instance's version) and 1.27, using stub certificates and the real `00-kuadrat-shared.conf`
- [x] 6.5 Document in `deploy/nginx/README.md`: why the hop exists (OrbStack replaces the source IP), why one hostname serves both dashboard and ingestion, the ordered one-off procedure (Route53 A record → config → `certbot --expand`), and the end-to-end verification
- [x] 6.6 **MANUAL:** replace `CAMBIAR-POR-TU-HOST.asuscomm.com` in `deploy/nginx/140d.art.conf` with the router's real DDNS hostname
- [x] 6.7 **MANUAL:** Route53 — `analytics.140d.art` from `CNAME → <ddns>` to `A → <EC2 elastic IP>`; wait for propagation
- [x] 6.8 **MANUAL:** install the config on the instance and reload (`nginx -t` first). A certificate-name warning at this point is expected and lasts until 6.9
- [x] 6.9 **MANUAL:** `certbot certonly --nginx --cert-name 140d.art --expand -d 140d.art -d www.140d.art -d api.140d.art -d analytics.140d.art`, then reload
- [x] 6.10 **MANUAL:** confirm the dashboard loads at `https://analytics.140d.art` and **holds** its WebSocket (a reconnect loop means NPM's Websockets Support is off)
