// Load environment variables early (optional, lets you tweak sampling via env)
require('dotenv').config();

// Import with `import * as Sentry from "@sentry/node"` if using ESM
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// Sentry is skipped entirely under NODE_ENV=test. `enabled: false` is not
// enough: init() still installs the versioned global carrier
// (globalThis.__SENTRY__['<version>']) and the auto-instrumentation, and Jest
// re-protects that global for every suite. The protected setters then chain
// into each other and blow the stack ("RangeError: Maximum call stack size
// exceeded" at jest-util's originalSetter) once several suites load the app in
// the same process. Test failures are not production signal anyway.
// See openspec/changes/test-env-isolation.
if (process.env.NODE_ENV !== 'test') {
    Sentry.init({
        // Hardcoded DSN per your request
        dsn: 'https://0acd1125a036fcaade96e1119d7a2414@o4510473239330816.ingest.de.sentry.io/4510473301065808',

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
