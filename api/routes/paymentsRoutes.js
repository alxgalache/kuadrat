const express = require('express');
const router = express.Router();

const { initRevolutOrderEndpoint, revolutWebhookEndpoint, getLatestRevolutPaymentForOrder } = require('../controllers/paymentsController');

// Initialise Revolut order (minimal payload: amount + currency, returns token and id)
router.post('/revolut/init-order', initRevolutOrderEndpoint);

// Webhook endpoint (Revolut -> our server)
router.post('/revolut/webhook', express.json({ type: '*/*' }), revolutWebhookEndpoint);

// Resolve latest payment for a Revolut order (used by client after pop-up success)
router.get('/revolut/order/:orderId/payments/latest', getLatestRevolutPaymentForOrder);

module.exports = router;
