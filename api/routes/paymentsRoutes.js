const express = require('express');
const router = express.Router();

const {
  initRevolutOrderEndpoint,
  revolutWebhookEndpoint,
  getLatestRevolutPaymentForOrder,
  cancelRevolutOrderEndpoint,
  getOrderStatusByRevolutId,
} = require('../controllers/paymentsController');

// Initialise Revolut order (minimal payload: amount + currency, returns token and id)
router.post('/revolut/init-order', initRevolutOrderEndpoint);

// Webhook endpoint (Revolut -> our server)
// We need to capture the raw body for signature verification, then parse JSON
router.post('/revolut/webhook',
  express.json({
    type: '*/*',
    verify: (req, res, buf) => {
      // Store the raw buffer as a string for signature verification
      req.rawBody = buf.toString('utf8');
    }
  }),
  revolutWebhookEndpoint
);

// Resolve latest payment for a Revolut order (used by client after pop-up success)
router.get('/revolut/order/:orderId/payments/latest', getLatestRevolutPaymentForOrder);

// Get order status by Revolut order ID (used by success page to check if webhook confirmed)
router.get('/revolut/order/:orderId/status', getOrderStatusByRevolutId);

// Cancel a pending Revolut order (used when cart contents change and we invalidate the dummy order)
router.post('/revolut/order/:orderId/cancel', cancelRevolutOrderEndpoint);

module.exports = router;
