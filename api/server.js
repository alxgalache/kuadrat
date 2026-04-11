// IMPORTANT: Initialize Sentry as early as possible per v10 docs
// See: https://docs.sentry.io/platforms/node/guides/express/
require('./instrument.js');

const Sentry = require('@sentry/node');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');

// Centralized config and logger
const config = require('./config/env');
const logger = require('./config/logger');
const { setupGracefulShutdown } = require('./config/shutdown');

// Import configurations and middleware
const { initializeDatabase } = require('./config/database');
const { runWalletSplitMigration } = require('./migrations/2026-04-stripe-connect-wallet-split');
const passport = require('./config/passport');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { verifyTransporter } = require('./services/emailService');
const { generalLimiter, authLimiter, sensitiveLimiter } = require('./middleware/rateLimiter');
const {
    prototypePollutionGuard,
    userAgentFilter,
    requestSizeLimiter,
    suspiciousActivityLogger,
} = require('./middleware/securityMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const productsRoutes = require('./routes/productsRoutes');
const artRoutes = require('./routes/artRoutes');
const othersRoutes = require('./routes/othersRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const stripePaymentsRoutes = require('./routes/stripePaymentsRoutes');
const usersRoutes = require('./routes/usersRoutes');
const adminRoutes = require('./routes/admin');
const sellerRoutes = require('./routes/sellerRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const testAccessRoutes = require('./routes/testAccessRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const eventRoutes = require('./routes/eventRoutes');
const drawRoutes = require('./routes/drawRoutes');
const storiesRoutes = require('./routes/storiesRoutes');
const setupAuctionSocket = require('./socket/auctionSocket');
const setupEventSocket = require('./socket/eventSocket');
const startAuctionScheduler = require('./scheduler/auctionScheduler');
const startReservationScheduler = require('./scheduler/reservationScheduler');
const startConfirmationScheduler = require('./scheduler/confirmationScheduler');
const startShipmentRetryScheduler = require('./scheduler/shipmentRetryScheduler');
const startEventCreditScheduler = require('./scheduler/eventCreditScheduler');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
  },
});

// Response compression (before other middleware for maximum effect)
app.use(compression());

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Trust proxy - required when behind a reverse proxy (nginx, Docker, etc.)
app.set('trust proxy', 1);

// Security middleware - MUST be applied before body parsing
// Filter malicious user agents
app.use(userAgentFilter);

// Log suspicious activity
app.use(suspiciousActivityLogger);

// Limit request size (prevents large payload attacks)
// Skip for video upload routes which use multer with their own size limits
app.use((req, res, next) => {
  if (req.path.match(/^\/api\/admin\/events\/[^/]+\/upload-video$/)) {
    return next();
  }
  return requestSizeLimiter(15 * 1024 * 1024)(req, res, next);
});

// Apply general rate limiter to all requests
app.use(generalLimiter);

// Structured request logging (replaces morgan)
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
}));

// Capture raw body for webhook signature verification
// The verify callback stores the raw buffer before JSON parsing
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buf, encoding) => {
    // Store raw body for routes that need it (e.g., webhook signature verification)
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Prototype pollution and command injection guard - MUST be after body parsing
app.use(prototypePollutionGuard);

app.use(passport.initialize());

// Socket.IO - Auction real-time module
const auctionSocket = setupAuctionSocket(io);
app.set('io', io);
app.set('auctionSocket', auctionSocket);

// Socket.IO - Event real-time module
const eventSocket = setupEventSocket(io);
app.set('eventSocket', eventSocket);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Kuadrat API is running',
    timestamp: new Date().toISOString(),
  });
});

// Debug route to verify Sentry error capture
// Hit GET /debug-sentry to force an error and confirm it appears in Sentry
app.get('/debug-sentry', (req, res) => {
  throw new Error('Sentry test error');
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/art', artRoutes);
app.use('/api/others', othersRoutes);
app.use('/api/orders', sensitiveLimiter, ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/payments/stripe', stripePaymentsRoutes);

// Stripe Connect webhook (Change #1: stripe-connect-accounts)
// Public endpoint — signature verified via `req.rawBody` captured by the
// global express.json() verify callback. Distinct from /api/payments/stripe/webhook.
app.post(
  '/api/stripe/connect/webhook',
  require('./controllers/stripeConnectWebhookController').handleConnectWebhook
);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/test-access', testAccessRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/draws', drawRoutes);
app.use('/api/stories', storiesRoutes);

// 404 handler
app.use(notFound);

// Register Sentry error handler before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database schema
    await initializeDatabase();

    // One-off migration (Change #2: stripe-connect-manual-payouts) — dumps any
    // remaining legacy `available_withdrawal` balance into the new standard_vat
    // bucket. Idempotent: no-op when the legacy column is already zero.
    await runWalletSplitMigration();

    // Verify email service (optional)
    await verifyTransporter();

    // Start server
    server.listen(config.port, () => {
      logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
      logger.info('Socket.IO ready for real-time communication');

      // Start auction lifecycle scheduler
      startAuctionScheduler(app);

      // Start reservation cleanup scheduler
      startReservationScheduler();

      // Start Sendcloud auto-confirmation scheduler
      startConfirmationScheduler();

      // Start Sendcloud shipment retry scheduler
      startShipmentRetryScheduler();

      // Start paid-event credit scheduler (Change #3: stripe-connect-events-wallet)
      startEventCreditScheduler();
    });

    // Register graceful shutdown
    setupGracefulShutdown(server, io);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
