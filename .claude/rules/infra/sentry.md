---
paths:
  - "api/instrument.js"
  - "api/app.js"
  - "api/config/env.js"
  - "api/routes/storiesRoutes.js"
  - "api/tests/sentryGating.test.js"
  - "client/instrumentation*.js"
  - "client/sentry.*.config.js"
  - "client/lib/{sentryEnv,sentryNoise,sentryReplay}.js"
  - "client/next.config.js"
  - "client/app/global-error.jsx"
---

## Sentry Error Reporting (gated by environment)

Reporting is **off in development and absent in test**; staging and production report normally. Every issue this project ever received from `environment: development` was an artefact of the edit-save-reload cycle (Fast Refresh serving a half-applied module, nodemon restarting on a half-written file), never a reproducible defect — plus session replays of `localhost`. See `openspec/changes/archive/2026-08-15-sentry-noise-cleanup`.

**Two independent gates that must NOT be collapsed into one:**

* `NODE_ENV=test` → Sentry is **never imported**. Structural, not about noise: merely importing `@sentry/node` installs global require-hook instrumentation that survives Jest's per-file module registry and breaks unrelated suites. `enabled: false` is *not* sufficient — `init()` still installs the versioned global carrier (`globalThis.__SENTRY__`). Enforced by the `if (!isTest)` around the `require`/`init` in `api/instrument.js` and around `setupExpressErrorHandler` in `api/app.js`.
* `NODE_ENV=development` → imported and initialized, **transport muted** via `enabled: false`. The wiring (`setupExpressErrorHandler`, `onRequestError`, `onRouterTransitionStart`, the replay integration) stays identical across environments, so a broken wiring still surfaces locally and no "express is not instrumented" warning appears. `SENTRY_ENABLE_DEV=true` / `NEXT_PUBLIC_SENTRY_ENABLE_DEV=true` opts back in (fail-safe: only the literal `true`).

**Four init points, two criteria sources.** `api/instrument.js` (Express) and the three Next.js runtimes (`client/instrumentation-client.js`, `client/sentry.server.config.js`, `client/sentry.edge.config.js`, all reading `client/lib/sentryEnv.js`).

`instrument.js` reads `process.env` **directly** and does not require `config/env.js` — it loads on the first line of `app.js` so OpenTelemetry can patch `require` before anything else, and importing the env module would run the whole validation (including its `process.exit` paths) ahead of `Sentry.init()`. `config.sentry.enabled` mirrors the criterion for the rest of the app to read; the duplication is deliberate and `api/tests/sentryGating.test.js` asserts the two agree across the full environment matrix (it probes `instrument.js` in a **child process**, since requiring it inside a Jest worker is the exact thing the test gate prevents).

`NEXT_PUBLIC_SENTRY_ENABLE_DEV` is the one `NEXT_PUBLIC_*` var that deliberately **skips the four-place ritual** (in the root `CLAUDE.md`): it only takes effect under `next dev`, where there is no build step and env vars are read at runtime, so wiring it into the production images would be dead code.

**Story videos in preproduction:** `GET /api/stories/videos` returns `200 {"videos":[]}` when `AWS_S3_BUCKET` is unset, instead of a 500. Staging is self-hosted with no AWS credentials **by decision**, the homepage video is decorative, and the client already falls back to an empty list — the 500 was 1414 Sentry events for a non-event. The guard is on `config.useS3` in `api/routes/storiesRoutes.js`, never a `try/catch` (which would collapse "not configured" back into "broken") and never in `s3Service.getClient()`, whose throw must stay loud for image uploads and database backups. A configured-but-unreachable bucket still returns 500 and still reports.

**In-app browser noise (Instagram/Facebook on Android):** `instrumentation-client.js` drops `Error invoking postMessage: …` (`ignoreErrors`) and anything whose stack lands in an injected `app://<name>` script (`denyUrls`). Meta injects its own telemetry (`navigation_performance_logger_android`) into every page opened from its in-app browser and talks to the native app over the WebView's JS↔Java bridge; when that bridge dies mid-page (`Java object is gone`) or its method throws, **their** script throws inside a listener we never registered, and Sentry attributes it to whatever page hosted it. Nothing of ours is on the failing stack and nothing user-visible breaks. **The `(?!\/)` in the `denyUrls` regex is load-bearing:** the Sentry Next.js SDK rewrites our own frames to `app:///_next/…` (three slashes) while the injected scripts live at `app://<name>` (two) — without the lookahead the pattern would discard every event the application produces.

**Agora `play()` aborted on iOS camera switch:** `beforeSend` drops an unhandled `AbortError: The operation was aborted.` on `/live/…` pages (predicate in `client/lib/sentryNoise.js`). It is born inside `agora-rtc-sdk-ng` 4.24.6, and nothing of ours is on its path:
* The SDK's video player listens for the end of an iOS audio interruption (`SM.on(IOS_INTERRUPTION_END, autoResumeAfterInterruption)`) and resumes the `<video>` with a `play()` it never awaits.
* Switching camera with `setDevice` interrupts and resumes the capture, then replaces the player's track. Reassigning `srcObject` aborts that pending `play()`, and WebKit rejects it.
* The SDK's next `play()` is caught and keeps the video running, so nothing user-visible breaks.

It surfaced once, from an iPad running Chrome, while verifying `agora-interview-cohost` (140D-CLIENT-1Y). **All three conditions are load-bearing, and it is deliberately not an `ignoreErrors` entry:**
* **The exact WebKit message:** it is also the default reason of ANY `AbortSignal` aborted without a reason, so matching it alone would hide real aborts.
* **The unhandled-rejection mechanism** (`auto.browser.global_handlers.onunhandledrejection` in `@sentry/browser` 10.x): an abort our code catches and reports is not touched.
* **The `/live/` path:** the only pages that load the Agora SDK.

Ruled out: `checkVideoTrackIsActive`, which also holds an unawaited `play()`, is a public API the SDK never calls internally.
