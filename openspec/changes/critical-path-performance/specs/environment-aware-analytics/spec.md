## MODIFIED Requirements

### Requirement: Analytics gated on production identity

The frontend SHALL load the Plausible Analytics tracker only when `IS_PROD` (from `client/lib/env.js`) is `true`. The gate SHALL NOT rely on `process.env.NODE_ENV`.

The tracker SHALL be served by the project's **self-hosted Plausible Community Edition instance** at `https://analytics.140d.art`, not by Plausible Cloud. The loader SHALL reference the v2 tracker path `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js` — the id issued by that instance for the site `140d.art`. Recreating the instance from scratch mints a different id and silently 404s this literal. Because the site identity is bound to the id, the injected script SHALL NOT carry a `data-domain` attribute.

The tracker URL SHALL be a literal in `client/app/layout.js` and SHALL NOT be introduced as a `NEXT_PUBLIC_*` variable: the value is embedded at build time, so changing it requires the same client rebuild either way and the variable would add wiring without adding flexibility.

The tracker SHALL be injected after hydration by an inline `next/script` loader (`strategy="afterInteractive"`) that creates an `async` `<script>` element with that URL. It SHALL NOT be declared as `<Script src>`: in the App Router that emits a high-priority `<link rel="preload">` to a third-party origin in the `<head>`, which competes with the stylesheet and the LCP resources before the first paint while the script only executes after hydration anyway. The `beforeInteractive` init stub SHALL remain, so events queued before the tracker loads are not lost.

#### Scenario: Analytics suppressed in preproduction

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=preprod`
- **THEN** the HTML SHALL NOT include the Plausible init script, the loader, nor any reference to `https://analytics.140d.art/js/...`

#### Scenario: Analytics loaded in production

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=production` (or unset)
- **THEN** the HTML SHALL include the Plausible init script and the loader containing the `https://analytics.140d.art/js/pa-JOgfdmGauUrT5eiOHnIDj.js` literal
- **AND** the HTML SHALL NOT include a `<link rel="preload">` nor a `<script src>` pointing to `analytics.140d.art`
- **AND** after hydration the browser SHALL request the tracker and send the pageview to `https://analytics.140d.art/api/event`

#### Scenario: Tracker served by the self-hosted instance

- **WHEN** a production visitor's browser requests the tracker URL
- **THEN** the response SHALL come from the self-hosted Community Edition instance at `analytics.140d.art`, and no request SHALL be made to `plausible.io` or any Plausible Cloud origin

#### Scenario: Custom event fired before the tracker loads

- **WHEN** application code calls `window.plausible('EventName')` after hydration but before the tracker script has finished downloading
- **THEN** the call SHALL be queued by the init stub and delivered once the tracker loads
