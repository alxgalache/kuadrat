const express = require('express');
const router = express.Router();
const { sensitiveLimiter, paymentVerificationLimiter } = require('../middleware/rateLimiter');

const {
  initRevolutOrderEndpoint,
  revolutWebhookEndpoint,
  getLatestRevolutPaymentForOrder,
  cancelRevolutOrderEndpoint,
  getOrderStatusByRevolutId,
} = require('../controllers/paymentsController');

// Initialise Revolut order (minimal payload: amount + currency, returns token and id)
// Apply strict rate limiting for order creation
router.post('/revolut/init-order', sensitiveLimiter, initRevolutOrderEndpoint);

// Webhook endpoint (Revolut -> our server)
// NO rate limiting - this is server-to-server communication from Revolut
// Raw body is captured by the global express.json() middleware in server.js
router.post('/revolut/webhook', revolutWebhookEndpoint);

// Resolve latest payment for a Revolut order (used by client after pop-up success)
// Apply lenient rate limiting - this endpoint is used for polling
router.get('/revolut/order/:orderId/payments/latest', paymentVerificationLimiter, getLatestRevolutPaymentForOrder);

// Get order status by Revolut order ID (used by success page to check if webhook confirmed)
// Apply lenient rate limiting - this endpoint is used for polling with exponential backoff
router.get('/revolut/order/:orderId/status', paymentVerificationLimiter, getOrderStatusByRevolutId);

// Cancel a pending Revolut order (used when cart contents change and we invalidate the dummy order)
// Apply strict rate limiting for cancellation
router.post('/revolut/order/:orderId/cancel', sensitiveLimiter, cancelRevolutOrderEndpoint);

module.exports = router;
