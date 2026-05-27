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

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

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
  turso: {
    databaseUrl: required('TURSO_DATABASE_URL'),
    authToken: required('TURSO_AUTH_TOKEN'),
  },

  // --- Authentication ---
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  // --- Email (SMTP) ---
  smtp: {
    host: optional('SMTP_HOST', ''),
    port: optionalInt('SMTP_PORT', 587),
    secure: optionalBool('SMTP_SECURE', false),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
  },
  emailFrom: optional('EMAIL_FROM', 'info@140d.art'),
  registrationEmail: optional('REGISTRATION_EMAIL', ''),
  logoUrl: optional('LOGO_URL', ''),

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

  // --- Events (Change #3: stripe-connect-events-wallet) ---
  events: {
    creditGraceDays: optionalInt('EVENT_CREDIT_GRACE_DAYS', 1),
    creditSchedulerCron: optional('EVENT_CREDIT_SCHEDULER_CRON', '0 * * * *'),
    creditSchedulerEnabled: optionalBool('EVENT_CREDIT_SCHEDULER_ENABLED', true),
  },

  // --- Business ---
  payment: {
    provider: optional('PAYMENT_PROVIDER', 'stripe'),
    vatEs: optionalFloat('TAX_VAT_ES', 0.21),
    vatArtEs: optionalFloat('TAX_VAT_ART_ES', 0.10),
    dealerCommissionArt: optionalFloat('DEALER_COMMISSION_ART', 0),
    dealerCommissionOthers: optionalFloat('DEALER_COMMISSION_OTHERS', 0),
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
  sentry: {
    tracesSampleRate: optionalFloat('SENTRY_TRACES_SAMPLE_RATE', 0.1),
    profilesSampleRate: optionalFloat('SENTRY_PROFILES_SAMPLE_RATE', 0.0),
  },

  // --- Sendcloud ---
  sendcloud: {
    apiKey: optional('SENDCLOUD_API_KEY', ''),
    apiSecret: optional('SENDCLOUD_API_SECRET', ''),
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

  // --- Access Control ---
  webAppHidden: optional('WEB_APP_HIDDEN', ''),
  testAccessPassword: optional('TEST_ACCESS_PASSWORD', ''),
};

// Convenience flag: true when S3 is configured for media storage
config.useS3 = !!config.aws.s3Bucket;

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
