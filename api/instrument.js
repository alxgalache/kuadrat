// Load environment variables early (optional, lets you tweak sampling via env)
require('dotenv').config();

// Import with `import * as Sentry from "@sentry/node"` if using ESM
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// This file reads process.env directly instead of requiring config/env.js, and
// that is deliberate. It is loaded on the FIRST line of app.js so the
// OpenTelemetry auto-instrumentation can patch `require` before Express, the
// libsql driver and everything else are pulled in. Requiring config/env.js here
// would load the entire env validation — including its process.exit paths —
// ahead of Sentry.init(), defeating that guarantee. config.sentry.enabled
// mirrors the criterion below for the rest of the app to read;
// api/tests/sentryGating.test.js asserts the two never drift apart.
const isTest = process.env.NODE_ENV === 'test';
// Matches config/env.js: an unset NODE_ENV counts as development.
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
// Escape hatch: opt back into reporting from a local machine when debugging the
// Sentry integration itself. Fail-safe — only the literal 'true' enables it.
const enableInDev = process.env.SENTRY_ENABLE_DEV === 'true';

// Sentry is skipped entirely under NODE_ENV=test. `enabled: false` is not
// enough: init() still installs the versioned global carrier
// (globalThis.__SENTRY__['<version>']) and the auto-instrumentation, and Jest
// re-protects that global for every suite. The protected setters then chain
// into each other and blow the stack ("RangeError: Maximum call stack size
// exceeded" at jest-util's originalSetter) once several suites load the app in
// the same process. Test failures are not production signal anyway.
// See openspec/changes/test-env-isolation.
//
// Development is a DIFFERENT gate and must not be folded into this one: there
// the SDK is initialized normally and only the transport is muted (`enabled`
// below), so setupExpressErrorHandler still binds to a live client and never
// warns "express is not instrumented". See openspec/changes/sentry-noise-cleanup.
if (!isTest) {
    Sentry.init({
        // Hardcoded DSN per your request
        dsn: 'https://0acd1125a036fcaade96e1119d7a2414@o4510473239330816.ingest.de.sentry.io/4510473301065808',

        // Wiring stays; only the transport is silenced in development. Every
        // development issue this project ever received was an artefact of the
        // edit-save-reload cycle (Fast Refresh transients, nodemon restarting
        // on a half-written file), never a real defect.
        enabled: !isDevelopment || enableInDev,

        // Send default PII
        sendDefaultPii: true,

        environment: process.env.NODE_ENV,

        // Tracing & profiling (configurable via env)
        // Example: SENTRY_TRACES_SAMPLE_RATE=0.1 SENTRY_PROFILES_SAMPLE_RATE=0.01
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
        profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || 0.0),

        // Node profiling integration
        integrations: (defaults) => [
            ...defaults,
            nodeProfilingIntegration(),
        ],
    });
}

module.exports = Sentry;
