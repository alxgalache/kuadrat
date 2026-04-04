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

  // --- Business ---
  payment: {
    provider: optional('PAYMENT_PROVIDER', 'stripe'),
    vatEs: optionalFloat('TAX_VAT_ES', 0.21),
    dealerCommissionArt: optionalFloat('DEALER_COMMISSION_ART', 0),
    dealerCommissionOthers: optionalFloat('DEALER_COMMISSION_OTHERS', 0),
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
  },

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

module.exports = config;
