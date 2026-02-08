// IMPORTANT: Initialize Sentry as early as possible per v10 docs
// See: https://docs.sentry.io/platforms/node/guides/express/
require('./instrument.js');

const Sentry = require('@sentry/node');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import configurations and middleware
const { initializeDatabase } = require('./config/database');
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
const setupAuctionSocket = require('./socket/auctionSocket');
const startAuctionScheduler = require('./scheduler/auctionScheduler');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// Trust proxy - required when behind a reverse proxy (nginx, Docker, etc.)
app.set('trust proxy', 1);

// Security middleware - MUST be applied before body parsing
// Filter malicious user agents
app.use(userAgentFilter);

// Log suspicious activity
app.use(suspiciousActivityLogger);

// Limit request size (10MB default, prevents large payload attacks)
app.use(requestSizeLimiter(15 * 1024 * 1024)); // Match express.json limit

// Apply general rate limiter to all requests
app.use(generalLimiter);

app.use(morgan('dev'));

// Capture raw body for webhook signature verification
// The verify callback stores the raw buffer before JSON parsing
app.use(express.json({
  limit: '15mb', // Increase limit for larger payloads
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
app.use('/api/products', productsRoutes); // Keep old routes for backward compatibility temporarily
app.use('/api/art', artRoutes);
app.use('/api/others', othersRoutes);
app.use('/api/orders', sensitiveLimiter, ordersRoutes);
app.use('/api/payments', paymentsRoutes); // Rate limiters applied per-endpoint in paymentsRoutes
app.use('/api/payments/stripe', stripePaymentsRoutes); // Stripe payment routes
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/test-access', testAccessRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/events', eventRoutes);

// 404 handler
app.use(notFound);

// Register Sentry error handler before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Initialize database schema
    await initializeDatabase();

    // Verify email service (optional)
    await verifyTransporter();

    // Start server
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Socket.IO is ready for real-time communication`);

      // Start auction lifecycle scheduler
      startAuctionScheduler(app);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
