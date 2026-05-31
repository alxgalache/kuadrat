# environment-aware-analytics

## Purpose

Gate the loading of Plausible Analytics on a dedicated build-time environment identity (`NEXT_PUBLIC_APP_ENV`) rather than `NODE_ENV`, so that analytics load only in production builds and are suppressed in preproduction, with a fail-safe default to production when the variable is unset.

## Requirements

### Requirement: Build-time environment identity

The frontend SHALL determine its deployment environment from a dedicated build-time variable `NEXT_PUBLIC_APP_ENV`, independent of `NODE_ENV`. The frontend SHALL expose a single derived helper (`client/lib/env.js`) providing `APP_ENV` and a boolean `IS_PROD`. When `NEXT_PUBLIC_APP_ENV` is unset or empty, the system SHALL default to `production`.

#### Scenario: Preproduction build

- **WHEN** the client is built with `NEXT_PUBLIC_APP_ENV=preprod`
- **THEN** `APP_ENV` resolves to `preprod` and `IS_PROD` resolves to `false`

#### Scenario: Production build

- **WHEN** the client is built with `NEXT_PUBLIC_APP_ENV=production`
- **THEN** `APP_ENV` resolves to `production` and `IS_PROD` resolves to `true`

#### Scenario: Variable unset (fail-safe)

- **WHEN** the client is built with `NEXT_PUBLIC_APP_ENV` unset or empty
- **THEN** `APP_ENV` resolves to `production` and `IS_PROD` resolves to `true`

### Requirement: Analytics gated on production identity

The frontend SHALL load Plausible Analytics scripts only when `IS_PROD` is `true`. The gate SHALL NOT rely on `process.env.NODE_ENV`.

#### Scenario: Analytics suppressed in preproduction

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=preprod`
- **THEN** the HTML SHALL NOT include the Plausible init script nor the `https://analytics.140d.art/js/...` script tag

#### Scenario: Analytics loaded in production

- **WHEN** the rendered page is served from a build where `NEXT_PUBLIC_APP_ENV=production` (or unset)
- **THEN** the HTML SHALL include both the Plausible init script and the `https://analytics.140d.art/js/...` script tag

### Requirement: Build-time variable wiring

`NEXT_PUBLIC_APP_ENV` SHALL be propagated through every place required for a `NEXT_PUBLIC_*` build-time variable so the value is embedded during `npm run build`: the root `.env.example`, `client/.env.example`, the staging and production client Dockerfiles (`ARG` + `ENV` before the build step), and the staging and production docker-compose `build.args` blocks.

#### Scenario: Compose passes the variable as a build arg

- **WHEN** the client image is built via the staging or production docker-compose file
- **THEN** `NEXT_PUBLIC_APP_ENV` is supplied as a `build.args` entry and set as an `ENV` in the Dockerfile before `npm run build`

#### Scenario: Reference env files document the variable

- **WHEN** a developer consults `.env.example` (root) or `client/.env.example`
- **THEN** `NEXT_PUBLIC_APP_ENV` is listed with its accepted values (`preprod` | `production`)
