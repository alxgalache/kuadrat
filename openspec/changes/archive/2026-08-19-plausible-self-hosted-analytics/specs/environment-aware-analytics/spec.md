## MODIFIED Requirements

### Requirement: Analytics gated on production identity

The frontend SHALL load the Plausible Analytics tracker only when `IS_PROD` (from `client/lib/env.js`) is `true`. The gate SHALL NOT rely on `process.env.NODE_ENV`.

The tracker SHALL be served by the project's **self-hosted Plausible Community Edition instance** at `https://analytics.140d.art`, not by Plausible Cloud. The script tag SHALL reference the v2 tracker path `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js` — the id issued by that instance for the site `140d.art`. Recreating the instance from scratch mints a different id and silently 404s this literal. Because the site identity is bound to the id, the tag SHALL NOT carry a `data-domain` attribute.

The tracker URL SHALL be a literal in `client/app/layout.js` and SHALL NOT be introduced as a `NEXT_PUBLIC_*` variable: the value is embedded at build time, so changing it requires the same client rebuild either way and the variable would add wiring without adding flexibility.

#### Scenario: Analytics suppressed in preproduction

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=preprod`
- **THEN** the HTML SHALL NOT include the Plausible init script nor any `https://analytics.140d.art/js/...` script tag

#### Scenario: Analytics loaded in production

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=production` (or unset)
- **THEN** the HTML SHALL include both the Plausible init script and the `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js` script tag

#### Scenario: Tracker served by the self-hosted instance

- **WHEN** a production visitor's browser requests the tracker URL
- **THEN** the response SHALL come from the self-hosted Community Edition instance at `analytics.140d.art`, and no request SHALL be made to `plausible.io` or any Plausible Cloud origin

## ADDED Requirements

### Requirement: Content Security Policy for the analytics origin

The CSP assembled in `client/next.config.js` SHALL list `https://analytics.140d.art` in **both** the `script-src` directive and the `connect-src` list (`cspConnectSrc`). Both are required and neither is sufficient alone: `script-src` permits fetching the tracker, `connect-src` permits the `POST` of each event to `/api/event` on the same origin.

#### Scenario: Tracker script is allowed to load

- **WHEN** a production page is served and the browser requests `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js`
- **THEN** the request SHALL NOT be blocked by the `script-src` directive

#### Scenario: Events are allowed to be sent

- **WHEN** the loaded tracker sends a pageview to `https://analytics.140d.art/api/event`
- **THEN** the request SHALL NOT be blocked by the `connect-src` directive

#### Scenario: Omitting connect-src is a defect, not a degradation

- **WHEN** `https://analytics.140d.art` is present in `script-src` but absent from `connect-src`
- **THEN** the page and the tracker load without any visible error and **no event is recorded**, which SHALL be treated as a defect of this requirement rather than as partial functionality

### Requirement: Analytics is independent of cookie consent

The tracker SHALL load whenever `IS_PROD` is `true`, regardless of the visitor's cookie-consent decision. The gate SHALL NOT read `adsAllowed` or any other value from `CookieConsentContext`.

This is admissible because the tracker stores no cookie and no persistent identifier on the terminal equipment, placing it outside the scope of art. 22.2 LSSI. It does not exempt the site from disclosing the processing — see the `cookie-policy-page` capability.

#### Scenario: Visitor accepts only necessary cookies

- **WHEN** a production visitor chooses «Solo las necesarias» in the cookie banner
- **THEN** the Plausible tracker SHALL still load and SHALL still record the visit
- **AND** the Meta Pixel SHALL NOT load, its behavior being unchanged by this requirement

#### Scenario: Visitor has made no decision yet

- **WHEN** a production visitor is served a page while the cookie banner is still displayed
- **THEN** the Plausible tracker SHALL load and record the visit

#### Scenario: No consent state is read by the analytics gate

- **WHEN** `client/app/layout.js` is inspected
- **THEN** the Plausible scripts SHALL be gated on `IS_PROD` alone, with no reference to `useCookieConsent`, `adsAllowed` or `CookieConsentContext`
