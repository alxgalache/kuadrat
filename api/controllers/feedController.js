const { getGoogleMerchantFeed: buildGoogleMerchantFeed } = require('../services/googleMerchantFeed');
const { getMetaCatalogFeed: buildMetaCatalogFeed } = require('../services/metaCatalogFeed');

// Feeds are XML, not the JSON envelope of utils/response.js.
function sendXml(res, xml) {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.status(200).send(xml);
}

/**
 * GET /api/feeds/google-merchant.xml
 *
 * Public on purpose: Merchant Center's scheduled fetch reads it, and every
 * value in it is already public on the product pages. What a public URL could
 * cost — a full re-quote of the catalogue — is bounded by the service's cache.
 */
const getGoogleMerchantFeed = async (req, res, next) => {
  try {
    sendXml(res, await buildGoogleMerchantFeed());
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/feeds/meta-catalog.xml
 *
 * Public for the same reasons: Commerce Manager fetches it every hour. It is
 * rendered from the same cached catalogue as the Google feed, so serving both
 * costs one generation per hour.
 */
const getMetaCatalogFeed = async (req, res, next) => {
  try {
    sendXml(res, await buildMetaCatalogFeed());
  } catch (error) {
    next(error);
  }
};

module.exports = { getGoogleMerchantFeed, getMetaCatalogFeed };
