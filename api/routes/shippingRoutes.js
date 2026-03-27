const express = require('express');
const router = express.Router();
const {
  getAvailableShipping,
} = require('../controllers/shippingController');
const { getShippingOptions } = require('../controllers/shippingOptionsController');
const { getServicePoints } = require('../controllers/servicePointsController');
const { handleSendcloudWebhook } = require('../controllers/sendcloudWebhookController');
const { validate } = require('../middleware/validate');
const { getShippingOptionsSchema, getServicePointsSchema } = require('../validators/shippingOptionsSchemas');

// Public route - Get available shipping for a product (legacy)
// Query params: productId, productType, country (optional), postalCode (optional)
router.get('/available', getAvailableShipping);

// Sendcloud shipping options (public - buyers may not be authenticated)
router.post('/options', validate(getShippingOptionsSchema), getShippingOptions);

// Sendcloud service points (public - buyers may not be authenticated)
router.get('/service-points', validate(getServicePointsSchema), getServicePoints);

// Sendcloud webhook (no auth - uses webhook secret validation)
router.post('/webhook', express.json({ verify: (req, res, buf) => { req.rawBody = buf } }), handleSendcloudWebhook);

module.exports = router;
