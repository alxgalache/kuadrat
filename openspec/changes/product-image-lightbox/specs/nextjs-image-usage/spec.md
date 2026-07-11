## ADDED Requirements

### Requirement: Image optimizer active in development
The Next.js image optimizer SHALL be enabled in all environments, including local development — `next.config.js` SHALL NOT set `images.unoptimized` for development. Because the optimizer fetches the source image from the Next server (which inside the dev Docker network cannot reach `http://localhost:3001`), API-served image URL helpers (`getArtImageUrl`, `getOthersImageUrl`, `getAuthorImageUrl` in `client/lib/api.js`) SHALL return same-origin relative paths under a dev-only proxy prefix (`/img-proxy/...`) when running in development without a configured CDN, and `next.config.js` SHALL define a development-only rewrite from that prefix to the internal API base URL (`INTERNAL_API_URL`, defaulting to `http://localhost:3001/api`). Every external hostname rendered through `next/image` (including the `ui-avatars.com` fallback avatars) SHALL be listed in `images.remotePatterns`. Production and staging behavior SHALL remain unchanged: helpers keep returning absolute CDN/API URLs covered by `remotePatterns`.

#### Scenario: Grid images optimized in local development
- **WHEN** a product grid renders in local development (Docker or `next dev` on the host)
- **THEN** product images are requested through `/_next/image` and served resized according to the `sizes` attribute, instead of downloading the full-resolution original

#### Scenario: Dev image proxy resolves through the internal API URL
- **WHEN** the Next dev server receives a request for `/img-proxy/art/images/<basename>` or `/img-proxy/others/images/<basename>`
- **THEN** the request is rewritten to the corresponding path under `INTERNAL_API_URL` (falling back to `http://localhost:3001/api` when unset) and the image bytes are returned

#### Scenario: Fallback avatar host allowed by the optimizer
- **WHEN** a page renders the `ui-avatars.com` fallback avatar through `next/image` (author has no profile image)
- **THEN** the optimizer serves it successfully instead of rejecting the hostname

#### Scenario: Production URLs unchanged
- **WHEN** the client is built for production or staging
- **THEN** `getArtImageUrl` / `getOthersImageUrl` return the same absolute CDN or API URLs as before, and no `/img-proxy` rewrite is applied
