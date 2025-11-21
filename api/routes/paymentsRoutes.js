const express = require('express');
const router = express.Router();

const {
  initRevolutOrderEndpoint,
  revolutWebhookEndpoint,
  getLatestRevolutPaymentForOrder,
  cancelRevolutOrderEndpoint,
} = require('../controllers/paymentsController');

// Initialise Revolut order (minimal payload: amount + currency, returns token and id)
router.post('/revolut/init-order', initRevolutOrderEndpoint);

// Webhook endpoint (Revolut -> our server)
router.post('/revolut/webhook', express.json({ type: '*/*' }), revolutWebhookEndpoint);

// Resolve latest payment for a Revolut order (used by client after pop-up success)
router.get('/revolut/order/:orderId/payments/latest', getLatestRevolutPaymentForOrder);

// Cancel a pending Revolut order (used when cart contents change and we invalidate the dummy order)
router.post('/revolut/order/:orderId/cancel', cancelRevolutOrderEndpoint);

module.exports = router;
