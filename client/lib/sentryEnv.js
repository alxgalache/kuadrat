/**
 * Sentry environment gating, shared by the three Next.js runtimes.
 *
 * The Sentry scaffolding generates one init per runtime — browser
 * (`instrumentation-client.js`), node (`sentry.server.config.js`) and edge
 * (`sentry.edge.config.js`). This module holds the criterion once so the three
 * cannot drift apart.
 *
 * WHY development is muted: every issue this project ever received from
 * `environment: development` was an artefact of the edit-save-reload cycle —
 * Fast Refresh serving a half-applied module, nodemon restarting on a
 * half-written file — never a reproducible defect. In local development the
 * browser console and the Next.js error overlay are already a better error
 * surface than Sentry, and session replays of `localhost` are pure waste.
 *
 * NOTE this only silences the TRANSPORT. Every init keeps running, so
 * `captureRequestError`, `captureRouterTransitionStart` and the replay
 * integration stay wired identically across environments and a broken wiring
 * still surfaces locally. See openspec/changes/sentry-noise-cleanup.
 */

// `next dev` leaves NODE_ENV as 'development'; `next build` forces it to
// 'production' and statically inlines it. That is enough here: this module only
// needs to tell development apart from everything else, never preprod from
// prod (which is what NEXT_PUBLIC_APP_ENV in lib/env.js exists for).
const IS_DEV = process.env.NODE_ENV === 'development'

// Escape hatch for debugging the Sentry integration itself from a local
// machine. Fail-safe towards silence: only the literal 'true' enables it.
//
// Deliberately NOT added to client/Dockerfile.staging, client/Dockerfile.prod
// or the compose build args, unlike other NEXT_PUBLIC_* vars. That ritual
// exists because NEXT_PUBLIC_* values are inlined during `next build` — but
// this flag only has an effect when NODE_ENV=development, i.e. under
// `next dev`, where there is no build and env vars are read at runtime. Wiring
// it into the production images would be dead code that falsely suggests
// development reporting can be switched on in staging or production.
const ENABLE_IN_DEV = process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === 'true'

export const SENTRY_ENABLED = !IS_DEV || ENABLE_IN_DEV

// The scaffolding shipped `tracesSampleRate: 1`, which is a default and not a
// decision — sampling 100% of transactions burns quota fast. Aligned with the
// backend's SENTRY_TRACES_SAMPLE_RATE (same 0.1 default).
const parsedTracesRate = Number.parseFloat(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
)

export const SENTRY_TRACES_SAMPLE_RATE = Number.isFinite(parsedTracesRate)
  ? parsedTracesRate
  : 0.1
