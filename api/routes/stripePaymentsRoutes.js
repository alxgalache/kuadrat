const express = require('express');
const router = express.Router();
const { sensitiveLimiter, paymentVerificationLimiter } = require('../middleware/rateLimiter');
const { authenticate, optionalAuthenticate } = require('../middleware/authorization');

const {
  createPaymentIntentEndpoint,
  stripeWebhookEndpoint,
  getStripePaymentStatusEndpoint,
  cancelStripePaymentIntentEndpoint,
} = require('../controllers/stripePaymentsController');

// Create Stripe PaymentIntent (requires authentication)
router.post('/create-intent', sensitiveLimiter, createPaymentIntentEndpoint);

// Webhook endpoint (Stripe -> our server)
// NO auth, NO rate limiting - this is server-to-server communication from Stripe
router.post('/webhook', stripeWebhookEndpoint);

// Get PaymentIntent status (used by client to verify payment)
// Apply lenient rate limiting - this endpoint may be polled
router.get('/status/:paymentIntentId', paymentVerificationLimiter, getStripePaymentStatusEndpoint);

// Cancel a PaymentIntent
router.post('/cancel', sensitiveLimiter, cancelStripePaymentIntentEndpoint);

module.exports = router;
