// Load environment variables early (optional, lets you tweak sampling via env)
require('dotenv').config();

// Import with `import * as Sentry from "@sentry/node"` if using ESM
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

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

module.exports = Sentry;