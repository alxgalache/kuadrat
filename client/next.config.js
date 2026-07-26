/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for production Docker builds
  output: 'standalone',
  // Use in-memory cache handler for ISR — the production container runs with
  // read_only: true, which prevents the default handler from writing to .next/server/
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'api.pre.140d.art'},
      { protocol: 'https', hostname: 'api.140d.art'},
      { protocol: 'https', hostname: 'cdn.140d.art'},
      // Fallback avatars for authors without a profile image (admin/autores, seller/profile)
      { protocol: 'https', hostname: 'ui-avatars.com'},
    ],
  },
  async rewrites() {
    // Dev-only image proxy: the image optimizer fetches sources from the Next server,
    // which inside the dev Docker network cannot reach the API through the browser-facing
    // localhost URL. Product image helpers return same-origin /img-proxy/ paths in dev
    // (see client/lib/api.js) and this rewrite forwards them to the internal API URL.
    if (process.env.NODE_ENV !== 'development') return [];
    const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001/api';
    return [
      { source: '/img-proxy/:path*', destination: `${internalApiUrl}/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: '/galeria/mas', destination: '/tienda', permanent: true },
      { source: '/galeria/mas/:path*', destination: '/tienda/:path*', permanent: true },
      { source: '/subastas', destination: '/eventos', permanent: true },
      { source: '/subastas/:path*', destination: '/eventos/:path*', permanent: true },
      { source: '/espacios', destination: '/live', permanent: true },
      { source: '/espacios/:path*', destination: '/live/:path*', permanent: true },
    ];
  },
  async headers() {
    // Build CSP connect-src based on environment
    // In development, allow localhost API; in production/staging, use the configured API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const apiOrigin = new URL(apiUrl).origin;

    // WebSocket URLs derived from API origin
    const wsOrigin = apiOrigin.replace(/^http/, 'ws');

    // CDN origin for S3 assets (images, story videos)
    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || '';
    const cdnOrigin = cdnUrl ? new URL(cdnUrl).origin : '';

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
      // LiveKit Cloud (events/streaming)
      'https://*.livekit.cloud',
      'wss://*.livekit.cloud',
      // Agora (events/streaming, per-event provider): access points + wss
      // signaling live on *.agora.io and the SD-RTN edge on *.sd-rtn.com
      'https://*.agora.io',
      'wss://*.agora.io',
      'https://*.sd-rtn.com',
      'wss://*.sd-rtn.com',
      // Agora Interactive Whiteboard (Netless): REST + gateway websockets
      'https://*.netless.link',
      'wss://*.netless.link',
      // Agora solutions endpoints + whiteboard fallback logger (Argus) — silences
      // the CSP network noise from white-web-sdk's agora-foundation fallback
      'https://*.agoralab.co',
      'wss://*.agoralab.co',
      // white-web-sdk loads its modules from blob: URLs (script inject + fetch)
      'blob:',
      // Plausible Analytics
      'https://analytics.140d.art',
    ].join(' ');

    const csp = [
      "default-src 'self'",
      // 'blob:' required by the Agora Interactive Whiteboard (white-web-sdk): it
      // loads its modules via document.createElement('script') with src=blob:.
      // 'unsafe-eval' is ALSO what allows WebAssembly compilation: the Agora
      // virtual background extension compiles a base64-embedded WASM module at
      // runtime. Replacing it with a stricter directive requires keeping at least
      // 'wasm-unsafe-eval' or camera background effects stop working.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://maps.googleapis.com https://*.revolut.com https://js.stripe.com https://challenges.cloudflare.com https://analytics.140d.art",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `img-src 'self' data: https: http: blob: ${apiOrigin}${cdnOrigin ? ' ' + cdnOrigin : ''}`,
      // *.netless.link serves the whiteboard fonts (convertcdn.netless.link/fonts)
      "font-src 'self' https://fonts.gstatic.com https://*.netless.link",
      `connect-src ${cspConnectSrc}`,
      "frame-src 'self' https://*.revolut.com https://js.stripe.com https://challenges.cloudflare.com",
      `media-src 'self' blob: https: ${apiOrigin}${cdnOrigin ? ' ' + cdnOrigin : ''}`,
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
