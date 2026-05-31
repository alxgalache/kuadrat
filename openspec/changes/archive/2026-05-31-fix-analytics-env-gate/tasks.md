## 1. Frontend helper + analytics gate

- [x] 1.1 Create `client/lib/env.js` exposing `APP_ENV` (`process.env.NEXT_PUBLIC_APP_ENV || 'production'`) and `IS_PROD` (`APP_ENV === 'production'`)
- [x] 1.2 In `client/app/layout.js`, import `IS_PROD` from `@/lib/env` and replace the `process.env.NODE_ENV === 'production'` Plausible gate with `IS_PROD`

## 2. Build-time variable wiring (NEXT_PUBLIC_*, four places)

- [x] 2.1 Add `NEXT_PUBLIC_APP_ENV` to root `.env.example` with accepted values (`preprod` | `production`)
- [x] 2.2 Add `NEXT_PUBLIC_APP_ENV` to `client/.env.example`
- [x] 2.3 Add `ARG NEXT_PUBLIC_APP_ENV` + `ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV` (before `RUN npm run build`) in `client/Dockerfile.staging`
- [x] 2.4 Add the same `ARG` + `ENV` lines in `client/Dockerfile.prod`
- [x] 2.5 Add `- NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}` to the client `build.args` block in `docker-compose.m1.yml` (staging, in use)
- [x] 2.6 Add the same `build.args` entry to `docker-compose.pre2.yml` (staging, CLAUDE.md reference) and `docker-compose.prod.yml` (production)

## 3. Documentation

- [x] 3.1 Add `NEXT_PUBLIC_APP_ENV` to the CLAUDE.md environment-variables section (Application group), noting it is the build-time preprod/prod identity that replaces `NODE_ENV` for frontend env gating

## 4. Verification

- [x] 4.1 Confirm `grep -rn "NODE_ENV === 'production'" client/app/layout.js` returns nothing (gate fully migrated)
- [x] 4.2 Run `npm run build` in `client/` (or a docker build) with `NEXT_PUBLIC_APP_ENV=preprod` and confirm the output contains no `analytics.140d.art` reference; repeat with `production`/unset and confirm it is present
