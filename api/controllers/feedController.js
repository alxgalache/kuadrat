const { getGoogleMerchantFeed: buildGoogleMerchantFeed } = require('../services/googleMerchantFeed');

/**
 * GET /api/feeds/google-merchant.xml
 *
 * Public on purpose: Merchant Center's scheduled fetch reads it, and every
 * value in it is already public on the product pages. What a public URL could
 * cost — a full re-quote of the catalogue — is bounded by the service's cache.
 */
const getGoogleMerchantFeed = async (req, res, next) => {
  try {
    const xml = await buildGoogleMerchantFeed();
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xml);
  } catch (error) {
    next(error);
  }
};

module.exports = { getGoogleMerchantFeed };
