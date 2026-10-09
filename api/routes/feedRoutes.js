const express = require('express');
const router = express.Router();

const { getGoogleMerchantFeed, getMetaCatalogFeed } = require('../controllers/feedController');

// Product feed for Google Merchant Center. See services/googleMerchantFeed.js.
router.get('/google-merchant.xml', getGoogleMerchantFeed);

// Product feed for the Meta catalogue (Instagram and Facebook shop). See
// services/metaCatalogFeed.js.
router.get('/meta-catalog.xml', getMetaCatalogFeed);

module.exports = router;
