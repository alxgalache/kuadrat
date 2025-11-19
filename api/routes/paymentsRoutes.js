const express = require('express');
const router = express.Router();

const { createRevolutOrderEndpoint, revolutWebhookEndpoint, getLatestRevolutPaymentForOrder } = require('../controllers/paymentsController');

// Create Revolut order (returns token)
router.post('/revolut/order', createRevolutOrderEndpoint);

// Webhook endpoint (Revolut -> our server)
router.post('/revolut/webhook', express.json({ type: '*/*' }), revolutWebhookEndpoint);

// Resolve latest payment for a Revolut order (used by client after pop-up success)
router.get('/revolut/order/:orderId/payments/latest', getLatestRevolutPaymentForOrder);

module.exports = router;
