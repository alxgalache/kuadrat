## Why

Plausible Analytics is loading in the preproduction environment even though it should only run in production. The gate in `client/app/layout.js` uses `process.env.NODE_ENV === 'production'`, but `NODE_ENV` is reserved by Next.js: `next build` forces it to `production` and statically inlines the comparison into the bundle. The `NODE_ENV: staging` set in `docker-compose.m1.yml` and `Dockerfile.staging` arrives too late — the conditional is already baked as `true`. `NODE_ENV` cannot distinguish preprod from prod because both are production builds to Next.js.

## What Changes

- Introduce a dedicated build-time environment-identity variable `NEXT_PUBLIC_APP_ENV` (`preprod` | `production`) that is NOT controlled by Next.js.
- Add a small frontend helper `client/lib/env.js` exposing `APP_ENV` and `IS_PROD`, with a fail-safe default of `production` when the variable is unset.
- Replace the `process.env.NODE_ENV === 'production'` gate for Plausible in `client/app/layout.js` with `IS_PROD`.
- Wire `NEXT_PUBLIC_APP_ENV` through all four places required for a `NEXT_PUBLIC_*` build-time variable (per CLAUDE.md): root `.env.example`, `client/.env.example`, `client/Dockerfile.staging` + `client/Dockerfile.prod`, and the staging/prod docker-compose `build.args` blocks.

## Capabilities

### New Capabilities
- `environment-aware-analytics`: Defines how the frontend distinguishes preproduction from production at build time via a dedicated variable, and gates analytics (and future prod-only concerns) on it rather than on `NODE_ENV`.

### Modified Capabilities
<!-- None: no existing spec governs analytics environment gating. -->

## Impact

- **Frontend code:** `client/app/layout.js` (analytics gate), new `client/lib/env.js` helper.
- **Build/deploy config:** `client/Dockerfile.staging`, `client/Dockerfile.prod`, `docker-compose.m1.yml` (staging build.args), `docker-compose.prod.yml` (prod build.args), root `.env.example`, `client/.env.example`.
- **Docs:** CLAUDE.md environment-variable section gains `NEXT_PUBLIC_APP_ENV`.
- **No backend, DB, or API changes.** No breaking changes for end users; behavior in production is unchanged (analytics still loads), preproduction stops loading analytics once rebuilt with `NEXT_PUBLIC_APP_ENV=preprod`.
