/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for production Docker builds
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    // Build CSP connect-src based on environment
    // In development, allow localhost API; in production/staging, use the configured API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const apiOrigin = new URL(apiUrl).origin;

    // WebSocket URLs derived from API origin
    const wsOrigin = apiOrigin.replace(/^http/, 'ws');

    const cspConnectSrc = [
      "'self'",
      apiOrigin,
      wsOrigin,
      'https://api.pre.140d.art',
      'https://api.140d.art',
      'wss://api.pre.140d.art',
      'wss://api.140d.art',
      'https://*.sentry.io',
      'https://*.revolut.com',
      'https://maps.googleapis.com',
      'https://api.stripe.com',
    ].join(' ');

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://*.revolut.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `img-src 'self' data: https: http: blob: ${apiOrigin}`,
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src ${cspConnectSrc}`,
      "frame-src 'self' https://*.revolut.com https://js.stripe.com",
      "worker-src 'self' blob:",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
};

module.exports = nextConfig;


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "140d",
  project: "140d-client",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
