/**
 * Centralized environment configuration with validation.
 * All environment variables are validated at startup and exported as a typed config object.
 * Import this module instead of reading process.env directly.
 */
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[ENV] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name, defaultValue) {
  return process.env[name] || defaultValue;
}

// Required only when `condition` is true; otherwise behaves like optional().
// Used for provider-specific credentials (e.g. RESEND_API_KEY is only required
// when EMAIL_PROVIDER=resend, SMTP_* only when EMAIL_PROVIDER=smtp).
function requiredIf(condition, name, defaultValue = '') {
  return condition ? required(name) : optional(name, defaultValue);
}

function optionalInt(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function optionalFloat(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? defaultValue : parsed;
}

function optionalBool(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return raw === 'true';
}

// Required env var that must be a hex string of exactly `byteLength` bytes
// (i.e. `byteLength * 2` hex characters). Used for AES keys and HMAC salts:
// fail fast and loud at startup rather than silently producing wrong-sized
// keys at runtime.
function requiredHex(name, byteLength) {
  const value = process.env[name];
  if (!value) {
    console.error(`[ENV] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  const expectedLength = byteLength * 2;
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length !== expectedLength) {
    console.error(
      `[ENV] Invalid format for ${name}: expected ${expectedLength} hex characters ` +
      `(${byteLength} bytes), got ${value.length} characters.`
    );
    process.exit(1);
  }
  return value;
}

// Like requiredHex but accepts a minimum length instead of an exact one
// (useful for salts where longer is fine).
function requiredHexAtLeast(name, minByteLength) {
  const value = process.env[name];
  if (!value) {
    console.error(`[ENV] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  const minLength = minByteLength * 2;
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length < minLength || value.length % 2 !== 0) {
    console.error(
      `[ENV] Invalid format for ${name}: expected at least ${minLength} hex characters ` +
      `(${minByteLength} bytes), got ${value.length} characters.`
    );
    process.exit(1);
  }
  return value;
}

// --- Email provider selection ---
// EMAIL_PROVIDER selects the transactional email transport: 'resend' (default,
// Resend HTTP API) or 'smtp' (legacy Nodemailer/SMTP, kept as a switchable
// rollback). An unknown value fails startup. Provider-specific credentials are
// validated conditionally below (RESEND_API_KEY for resend, SMTP_* for smtp).
const emailProvider = optional('EMAIL_PROVIDER', 'resend');
if (!['resend', 'smtp'].includes(emailProvider)) {
  console.error(`[ENV] Invalid EMAIL_PROVIDER: "${emailProvider}". Must be "resend" or "smtp".`);
  process.exit(1);
}

// --- Sendcloud authentication mode ---
// See the `sendcloud.authMode` entry below for what each value means. An
// unknown value fails startup rather than falling back to the default: the
// whole point of the variable is to pin the authentication method, so silently
// ignoring it would defeat its only purpose.
const sendcloudAuthMode = optional('SENDCLOUD_AUTH_MODE', 'auto');
if (!['auto', 'oauth2', 'basic'].includes(sendcloudAuthMode)) {
  console.error(
    `[ENV] Invalid SENDCLOUD_AUTH_MODE: "${sendcloudAuthMode}". Must be "auto", "oauth2" or "basic".`
  );
  process.exit(1);
}

// --- Marketing email circuit breaker ---
// MARKETING_EMAILS_ENABLED is a global on/off for marketing broadcasts (Resend).
// Default OFF (fail-safe): a brand-new environment never emails subscribers until
// explicitly enabled. When true, the marketing credentials/IDs below are required.
const marketingEnabled = optionalBool('MARKETING_EMAILS_ENABLED', false);

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

// A `file:` database URL means a local SQLite file rather than a remote Turso
// instance. It takes no auth token — see the `turso` block below.
const isFileDatabaseUrl = (process.env.TURSO_DATABASE_URL || '').startsWith('file:');

// --- Email transport ---
// EMAIL_TRANSPORT is orthogonal to EMAIL_PROVIDER: the provider picks WHICH
// service would be used (Resend or SMTP), the transport decides WHETHER
// anything leaves the process at all. `noop` short-circuits the single send
// chokepoint in services/emailService.js, so no provider is ever contacted.
// It is forced on under NODE_ENV=test and must be opted into anywhere else.
const emailTransport = isTest
  ? 'noop'
  : (optional('EMAIL_TRANSPORT', 'live') === 'noop' ? 'noop' : 'live');

const config = {
  // --- Application ---
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction,
  isDevelopment,
  isTest,
  port: optionalInt('PORT', 3001),
  logLevel: optional('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  // --- URLs ---
  clientUrl: optional('CLIENT_URL', 'http://localhost:3000'),
  sitePublicBaseUrl: optional('SITE_PUBLIC_BASE_URL', 'https://pre.140d.art'),
  siteApiBaseUrl: optional('SITE_API_BASE_URL', 'https://api.pre.140d.art'),

  // --- Database ---
  // A local SQLite file (`file:` URL, used by the test suite) has no auth
  // token; the token stays mandatory for any remote Turso instance.
  turso: {
    databaseUrl: required('TURSO_DATABASE_URL'),
    authToken: requiredIf(!isFileDatabaseUrl, 'TURSO_AUTH_TOKEN'),
  },

  // --- Authentication ---
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  // --- Email ---
  // Provider switch (default 'resend'). See the emailProvider validation above.
  emailProvider,
  // Transport switch: 'live' (default) or 'noop'. See the derivation above.
  emailTransport,
  // Resend HTTP API key. Required only when EMAIL_PROVIDER=resend.
  resendApiKey: requiredIf(emailProvider === 'resend', 'RESEND_API_KEY'),
  // Legacy SMTP (Nodemailer). Host/user/pass required only when
  // EMAIL_PROVIDER=smtp; port/secure keep their defaults regardless.
  smtp: {
    host: requiredIf(emailProvider === 'smtp', 'SMTP_HOST'),
    port: optionalInt('SMTP_PORT', 587),
    secure: optionalBool('SMTP_SECURE', false),
    user: requiredIf(emailProvider === 'smtp', 'SMTP_USER'),
    pass: requiredIf(emailProvider === 'smtp', 'SMTP_PASS'),
  },
  emailFrom: optional('EMAIL_FROM', 'info@140d.art'),
  registrationEmail: optional('REGISTRATION_EMAIL', ''),
  logoUrl: optional('LOGO_URL', ''),

  // --- Marketing email (Resend Broadcasts) ---
  // Distinct channel from the transactional email above. Uses a dedicated
  // FULL-ACCESS Resend key and the Broadcasts API to send to a segment scoped by
  // topic. Credentials and IDs are required ONLY when marketing is enabled.
  // RESEND_NEWSLETTER_SEGMENT_ID differs per environment: a TEST segment outside
  // production and the REAL segment in production (same var, value per env — no
  // code branching). The monthly Newsletter broadcast itself is still sent
  // manually from the Resend UI, but its topic ID (RESEND_TOPIC_NEWSLETTER) is
  // referenced here so the public signup form can offer it as an opt-in option.
  marketing: {
    enabled: marketingEnabled,
    apiKey: requiredIf(marketingEnabled, 'RESEND_MARKETING_API_KEY'),
    newsletterSegmentId: requiredIf(marketingEnabled, 'RESEND_NEWSLETTER_SEGMENT_ID'),
    topicNewAuthors: requiredIf(marketingEnabled, 'RESEND_TOPIC_NEW_AUTHORS'),
    topicAuctionsDraws: requiredIf(marketingEnabled, 'RESEND_TOPIC_AUCTIONS_DRAWS'),
    topicLiveEvents: requiredIf(marketingEnabled, 'RESEND_TOPIC_LIVE_EVENTS'),
    // Monthly "Newsletter" topic. Offered as an opt-in option in the public
    // newsletter signup form (see newsletter-subscription change), so it now
    // needs to be in config like the other three.
    topicNewsletter: requiredIf(marketingEnabled, 'RESEND_TOPIC_NEWSLETTER'),
    // Bare from-address; the "140d Galería de Arte" display name is added in code.
    from: optional('MARKETING_FROM', '') || optional('EMAIL_FROM', 'info@140d.art'),
  },

  // --- Stripe ---
  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    publishableKey: optional('STRIPE_PUBLISHABLE_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    connect: {
      enabled: optionalBool('STRIPE_CONNECT_ENABLED', false),
      refreshUrl: optional('STRIPE_CONNECT_REFRESH_URL', 'https://pre.140d.art/seller/stripe-connect/refresh'),
      returnUrl: optional('STRIPE_CONNECT_RETURN_URL', 'https://pre.140d.art/seller/stripe-connect/return'),
      webhookSecret: optional('STRIPE_CONNECT_WEBHOOK_SECRET', ''),
    },
  },

  // --- Revolut ---
  revolut: {
    mode: optional('REVOLUT_MODE', 'sandbox'),
    secretKey: optional('REVOLUT_SECRET_KEY', ''),
    apiVersion: optional('REVOLUT_API_VERSION', ''),
    apiUrlSandbox: optional('REVOLUT_API_URL_SANDBOX', ''),
    apiUrlProduction: optional('REVOLUT_API_URL_PRODUCTION', ''),
    locationId: optional('REVOLUT_LOCATION_ID', ''),
    webhookSecret: optional('REVOLUT_WEBHOOK_SECRET', ''),
  },

  // --- LiveKit ---
  livekit: {
    url: optional('LIVEKIT_URL', ''),
    apiKey: optional('LIVEKIT_API_KEY', ''),
    apiSecret: optional('LIVEKIT_API_SECRET', ''),
  },

  // --- Agora (per-event streaming provider, coexists with LiveKit) ---
  // appId/appCertificate feed RTC token generation (agora-token, AccessToken2);
  // customerId/customerSecret are the RESTful API credentials (Basic Auth) used
  // for moderation kicking rules. agoraService fails with a clear error when
  // invoked unconfigured. The appId travels to the client in the token endpoint
  // response (same pattern as livekit.url) — no NEXT_PUBLIC_* var.
  agora: {
    appId: optional('AGORA_APP_ID', ''),
    appCertificate: optional('AGORA_APP_CERTIFICATE', ''),
    customerId: optional('AGORA_CUSTOMER_ID', ''),
    customerSecret: optional('AGORA_CUSTOMER_SECRET', ''),
  },

  // --- Agora Interactive Whiteboard (optional phase) ---
  // SDK tokens are generated server-side from ak/sk (netless-token); only
  // per-role room tokens ever reach the client. When unconfigured, the
  // whiteboard toggle is hidden for the host (silent degradation).
  agoraWhiteboard: {
    appIdentifier: optional('AGORA_WHITEBOARD_APP_IDENTIFIER', ''),
    ak: optional('AGORA_WHITEBOARD_AK', ''),
    sk: optional('AGORA_WHITEBOARD_SK', ''),
    region: optional('AGORA_WHITEBOARD_REGION', 'eu'),
  },

  // --- Events (Change #3: stripe-connect-events-wallet) ---
  events: {
    creditGraceDays: optionalInt('EVENT_CREDIT_GRACE_DAYS', 1),
    creditSchedulerCron: optional('EVENT_CREDIT_SCHEDULER_CRON', '0 * * * *'),
    creditSchedulerEnabled: optionalBool('EVENT_CREDIT_SCHEDULER_ENABLED', true),
  },

  // --- Business ---
  payment: {
    provider: optional('PAYMENT_PROVIDER', 'stripe'),
    // TAX_VAT_ES: legacy-only. VAT is now per-seller (users.tax_vat_art /
    // users.tax_vat_other); this flat rate survives solely for the Revolut line
    // item metadata (ordersController.placeOrder). TAX_VAT_ART_ES was removed
    // (had no consumers).
    vatEs: optionalFloat('TAX_VAT_ES', 0.21),
    // Gallery commission is now per-seller (users.dealer_commission_art /
    // users.dealer_commission_other); the former global env vars are gone.
  },

  // --- Business fiscal identity (Change #4: stripe-connect-fiscal-report) ---
  // Used by the fiscal export endpoints as the "platform" block in every
  // PayoutReport. Not validated at startup (decision #11 of the design):
  // missing fields surface as a 503 only when the admin triggers an export.
  // See master_plan.md §9 for the checklist the user must fill before go-live.
  business: {
    name: optional('BUSINESS_NAME', '140d Galería de Arte'),
    legalName: optional('BUSINESS_LEGAL_NAME', ''),
    taxId: optional('BUSINESS_TAX_ID', ''),
    address: {
      line1: optional('BUSINESS_ADDRESS_LINE1', ''),
      line2: optional('BUSINESS_ADDRESS_LINE2', '') || null,
      city: optional('BUSINESS_ADDRESS_CITY', ''),
      postalCode: optional('BUSINESS_ADDRESS_POSTAL_CODE', ''),
      province: optional('BUSINESS_ADDRESS_PROVINCE', ''),
      country: optional('BUSINESS_ADDRESS_COUNTRY', 'ES'),
    },
    email: optional('BUSINESS_EMAIL', '') || optional('EMAIL_FROM', 'info@140d.art'),
  },

  // --- Order Reservation ---
  orderReservationTtlMinutes: optionalInt('ORDER_RESERVATION_TTL_MINUTES', 30),

  // --- Rate Limiting ---
  rateLimit: {
    general: {
      windowSeconds: optionalInt('GENERAL_RATE_LIMIT_WINDOW_SECONDS', 30),
      maxRequests: optionalInt('GENERAL_RATE_LIMIT_MAX_REQUESTS', 1000),
    },
    auth: {
      windowSeconds: optionalInt('AUTH_RATE_LIMIT_WINDOW_SECONDS', 30),
      maxRequests: optionalInt('AUTH_RATE_LIMIT_MAX_REQUESTS', 60),
    },
    sensitive: {
      windowSeconds: optionalInt('SENSITIVE_RATE_LIMIT_WINDOW_SECONDS', 30),
      maxRequests: optionalInt('SENSITIVE_RATE_LIMIT_MAX_REQUESTS', 500),
    },
    paymentVerification: {
      windowSeconds: optionalInt('PAYMENT_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS', 15),
      maxRequests: optionalInt('PAYMENT_VERIFICATION_RATE_LIMIT_MAX_REQUESTS', 2000),
    },
    // Note: despite the *_SECONDS naming, the rateLimiter middleware
    // multiplies these values by 60 * 1000, so windowSeconds is effectively
    // expressed in MINUTES. Keep the misleading name for consistency with
    // the other limiter sections in this file.
    coaVerify: {
      windowSeconds: optionalInt('COA_VERIFY_RATE_LIMIT_WINDOW_SECONDS', 1),
      maxRequests: optionalInt('COA_VERIFY_RATE_LIMIT_MAX_REQUESTS', 60),
    },
    // Art inquiry form rate limiter. windowSeconds is actually MINUTES due to
    // the legacy convention shared with the other limiters (the middleware
    // multiplies by 60 * 1000). Defaults: 3 requests per 60 minutes per IP.
    inquiry: {
      windowSeconds: optionalInt('INQUIRY_RATE_LIMIT_WINDOW_SECONDS', 60),
      maxRequests: optionalInt('INQUIRY_RATE_LIMIT_MAX_REQUESTS', 3),
    },
  },

  // --- Cloudflare Turnstile (captcha for the art product inquiry form) ---
  // If empty, the inquiry endpoint responds 503 CAPTCHA_UNAVAILABLE.
  turnstile: {
    secret: optional('TURNSTILE_SECRET', ''),
  },

  // --- NTAG 424 DNA (Certificates of Authenticity) ---
  // Loss of these keys = inability to ever verify a programmed sticker.
  // Leak of these keys = anyone can forge stickers. Custody is critical.
  ntag424: {
    systemId: requiredHex('NTAG424_SYSTEM_ID', 3),
    kPicc: requiredHex('NTAG424_K_PICC', 16),
    masterKey: requiredHex('NTAG424_MASTER_KEY', 16),
  },
  // Salt for HMAC-SHA256 over IP addresses in verification_events (GDPR).
  ipHashSalt: requiredHexAtLeast('IP_HASH_SALT', 16),

  // --- Sentry ---
  // `enabled` is the READ-ONLY mirror of the criterion that instrument.js
  // applies. instrument.js is the authority: it must run before any other
  // module is required (OpenTelemetry patches `require`, so it has to win the
  // race), which rules out importing THIS file from there — doing so would
  // load the whole env validation, and its process.exit paths, ahead of
  // Sentry.init(). The duplication is therefore deliberate; do not "fix" it by
  // making instrument.js require config/env.js. api/tests/sentryGating.test.js
  // asserts the two criteria agree across the whole environment matrix.
  //
  // Two independent gates, which must NOT be collapsed into one:
  //   NODE_ENV=test        -> Sentry is never imported at all (structural: the
  //                           global require-hook instrumentation survives
  //                           Jest's per-file module registry and breaks
  //                           unrelated suites). See instrument.js and app.js.
  //   NODE_ENV=development -> imported and initialized, but transport off, so
  //                           the wiring stays identical across environments
  //                           while HMR/nodemon noise stops leaving the box.
  //                           SENTRY_ENABLE_DEV=true opts back in on purpose.
  sentry: {
    enabled: !isTest && (!isDevelopment || optionalBool('SENTRY_ENABLE_DEV', false)),
    tracesSampleRate: optionalFloat('SENTRY_TRACES_SAMPLE_RATE', 0.1),
    profilesSampleRate: optionalFloat('SENTRY_PROFILES_SAMPLE_RATE', 0.0),
  },

  // --- Sendcloud ---
  sendcloud: {
    apiKey: optional('SENDCLOUD_API_KEY', ''),
    apiSecret: optional('SENDCLOUD_API_SECRET', ''),
    // How the API client authenticates:
    //   oauth2 — only OAuth2 client_credentials; an auth failure is an error.
    //   basic  — only HTTP Basic; the token endpoint is never contacted. This
    //            is the escape hatch if Sendcloud retires the OAuth2 beta.
    //   auto   — OAuth2 first, degrading to Basic for the failing request (and
    //            for the next five minutes) after one failed retry.
    // Validated above so a typo fails startup instead of silently selecting a
    // default: picking the wrong authentication method would surface as a wall
    // of 401s from a live carrier integration.
    authMode: sendcloudAuthMode,
    webhookSecret: optional('SENDCLOUD_WEBHOOK_SECRET', ''),
    enabledArt: optionalBool('SENDCLOUD_ENABLED_ART', false),
    enabledOthers: optionalBool('SENDCLOUD_ENABLED_OTHERS', false),
    autoConfirmDays: optionalInt('SENDCLOUD_AUTO_CONFIRM_DAYS', 14),
    maxAnnouncementRetries: optionalInt('SENDCLOUD_MAX_ANNOUNCEMENT_RETRIES', 3),
  },

  // --- AWS S3 ---
  aws: {
    s3Bucket: optional('AWS_S3_BUCKET', ''),
    s3Region: optional('AWS_S3_REGION', 'eu-west-1'),
  },
  cdnBaseUrl: optional('CDN_BASE_URL', ''),

  // --- Database backups (change: turso-s3-backups) ---
  // Daily dump of the Turso database uploaded to a DEDICATED S3 bucket, never
  // the media one. Activation is by configuration being present (same criterion
  // as `config.useS3`), not by a NODE_ENV === 'production' check: today only
  // production has these variables set, but nothing in the code says so.
  // `enabled` is forced off under test — see the `backup.enabled` line below.
  backup: {
    bucket: optional('AWS_S3_BACKUP_BUCKET', ''),
    // Falls back to the media region: the backup bucket lives in the same
    // region today, and a wrong region surfaces as an opaque 301 redirect.
    region: optional('AWS_S3_BACKUP_REGION', '') || optional('AWS_S3_REGION', 'eu-west-1'),
    cron: optional('DB_BACKUP_CRON', '0 4 * * *'),
  },

  // --- Access Control ---
  webAppHidden: optional('WEB_APP_HIDDEN', ''),
  testAccessPassword: optional('TEST_ACCESS_PASSWORD', ''),
};

// Convenience flag: true when S3 is configured for media storage
config.useS3 = !!config.aws.s3Bucket;

// Scheduled backups are opt-in AND unconditionally off under test: a test run
// must never dump a database to S3, whatever the env file says. The scheduler
// additionally refuses to start without a bucket (see backupScheduler.js).
config.backup.enabled = optionalBool('DB_BACKUP_ENABLED', false) && config.nodeEnv !== 'test';

/**
 * Returns the list of env var names that must be set before a fiscal export
 * can be generated (Change #4: stripe-connect-fiscal-report). Empty array
 * means the config is complete. Used by the export controller to return a
 * 503 with a clear message when a field is missing.
 */
function assertBusinessConfigComplete() {
  const missing = [];
  if (!config.business.legalName) missing.push('BUSINESS_LEGAL_NAME');
  if (!config.business.taxId) missing.push('BUSINESS_TAX_ID');
  if (!config.business.address.line1) missing.push('BUSINESS_ADDRESS_LINE1');
  if (!config.business.address.city) missing.push('BUSINESS_ADDRESS_CITY');
  if (!config.business.address.postalCode) missing.push('BUSINESS_ADDRESS_POSTAL_CODE');
  if (!config.business.address.province) missing.push('BUSINESS_ADDRESS_PROVINCE');
  return missing;
}

module.exports = config;
module.exports.assertBusinessConfigComplete = assertBusinessConfigComplete;
