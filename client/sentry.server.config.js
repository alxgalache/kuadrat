// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from "./lib/sentryEnv";

Sentry.init({
  dsn: "https://053a88f0de66024cc2190230b04d7686@o4510473239330816.ingest.de.sentry.io/4510562852798544",

  // Off in development (transport only — the SDK stays initialized so
  // onRequestError keeps working the same way in every environment).
  // See client/lib/sentryEnv.js.
  enabled: SENTRY_ENABLED,

  // Define how likely traces are sampled. Override with
  // NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE; defaults to 0.1.
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
