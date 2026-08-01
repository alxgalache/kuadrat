// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from "./lib/sentryEnv";

Sentry.init({
  dsn: "https://053a88f0de66024cc2190230b04d7686@o4510473239330816.ingest.de.sentry.io/4510562852798544",

  // Off in development (transport only — the SDK stays initialized so
  // onRouterTransitionStart and the replay integration keep working the same
  // way in every environment). See client/lib/sentryEnv.js.
  enabled: SENTRY_ENABLED,

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Override with
  // NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE; defaults to 0.1.
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
