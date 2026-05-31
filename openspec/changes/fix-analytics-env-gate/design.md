## Context

`client/app/layout.js` gates the Plausible Analytics `<Script>` tags on `process.env.NODE_ENV === 'production'`. In Next.js, `NODE_ENV` is reserved: `next build` always sets it to `production` and the compiler statically inlines `process.env.NODE_ENV` references into the output bundle. Both the preprod and prod images are produced via `next build`, so the comparison is hard-coded to `true` in both. The runtime `NODE_ENV: staging` (docker-compose `environment:` and `Dockerfile.staging` `ENV`) has no effect because the conditional was already resolved at build time.

The deployment uses build-time `NEXT_PUBLIC_*` args wired through Dockerfiles and docker-compose `build.args` (documented in CLAUDE.md). The fix must live in the same build-time channel because the analytics gate is rendered in the layout and must be embedded in the bundle.

## Goals / Non-Goals

**Goals:**
- Distinguish preproduction from production at build time using a variable Next.js does not control.
- Stop Plausible from loading in preproduction; keep it loading in production unchanged.
- Provide a single reusable signal (`IS_PROD`) for future prod-only concerns (Sentry env, robots, etc.).
- Fail safe: an unset variable behaves as production (current behavior preserved).

**Non-Goals:**
- Per-feature flags (e.g., a separate `NEXT_PUBLIC_ANALYTICS_ENABLED`). Explicitly deferred — adds wiring cost per feature with no current need.
- Runtime (non-build-time) environment switching. Rejected per requirement to keep this build-time.
- Any backend, DB, or API change. Backend already has its own `NODE_ENV` handling and is out of scope.

## Decisions

**Decision: Use a dedicated `NEXT_PUBLIC_APP_ENV` identity variable, not `NODE_ENV`.**
`NODE_ENV` is owned by Next.js and cannot represent a third environment. A custom `NEXT_PUBLIC_*` variable is inlined at build time exactly like the current `NODE_ENV` comparison, so it slots into the existing build-arg pipeline with no runtime-evaluation surprises. Alternative considered: reuse `NEXT_PUBLIC_SITE_URL` to infer environment — rejected as implicit and fragile.

**Decision: Identity variable over per-capability flags.**
A single `APP_ENV` (`preprod` | `production`) is wired once through the four required places and then governs all prod-only concerns. Per-feature flags were considered but rejected: each `NEXT_PUBLIC_*` flag repeats the four-place wiring cost (per CLAUDE.md) and risks being forgotten when a new environment is created. The only scenario favoring flags — enabling analytics in preprod without making it prod — is not a current need and can be added later as an override without reworking this design.

**Decision: Centralize derivation in `client/lib/env.js`.**
Expose `APP_ENV` (string) and `IS_PROD` (boolean) so call sites import a single source of truth instead of re-reading `process.env`. Mirrors the existing `client/lib/constants.js` pattern of extracting cross-cutting values.

**Decision: Default to `production` when unset.**
`const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || 'production'`. Fail-safe means a forgotten build arg keeps production behavior (analytics on) rather than silently disabling it in prod. Preprod must explicitly opt in with `NEXT_PUBLIC_APP_ENV=preprod`.

## Risks / Trade-offs

- **Forgetting one of the four wiring places ships an empty value** → With the `|| 'production'` default this degrades to "treated as production". For preprod that means analytics could leak back in. Mitigation: the tasks list enumerates all four places explicitly and CLAUDE.md is updated to include the new variable.
- **Existing preprod images are already built with the bug** → Mitigation: documented in the migration note — preprod must be rebuilt (`docker compose -f docker-compose.m1.yml up --build`) with `NEXT_PUBLIC_APP_ENV=preprod` set; a config change alone does nothing.
- **`docker-compose.m1.yml` is the staging file but CLAUDE.md references `docker-compose.pre2.yml`** → The variable is added to whichever staging compose file is actually in use (`docker-compose.m1.yml`, confirmed by the user) plus the prod file. Mitigation: tasks target the real files present in the repo.

## Migration Plan

1. Land code + config changes.
2. Set `NEXT_PUBLIC_APP_ENV=preprod` in the preprod host's root `.env`; leave production at `production`.
3. Rebuild the preprod client image (build-time variable — a restart without rebuild has no effect).
4. Verify the rendered preprod HTML no longer contains the `analytics.140d.art` script; verify production still loads it.

Rollback: revert the gate to its prior form or simply unset/clear `NEXT_PUBLIC_APP_ENV` (defaults back to production behavior).
