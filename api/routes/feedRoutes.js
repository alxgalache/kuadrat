const express = require('express');
const router = express.Router();

const { getGoogleMerchantFeed } = require('../controllers/feedController');

// Product feed for Google Merchant Center. See services/googleMerchantFeed.js.
router.get('/google-merchant.xml', getGoogleMerchantFeed);

module.exports = router;
