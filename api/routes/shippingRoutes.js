const express = require('express');
const router = express.Router();
const {
  getAvailableShipping,
} = require('../controllers/shippingController');

// Public route - Get available shipping for a product
// Query params: productId, productType, country (optional), postalCode (optional)
router.get('/available', getAvailableShipping);

module.exports = router;
