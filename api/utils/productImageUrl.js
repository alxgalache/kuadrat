const config = require('../config/env');

/**
 * Public, absolute URL of a product image.
 *
 * With CDN_BASE_URL configured (production: S3 behind CloudFront) the URL is
 * the CDN object itself — immutable, because a published basename is never
 * overwritten. Without it (development, preproduction on local disk) it falls
 * back to the API route that serves the file.
 *
 * Lives here, rather than in each consumer, because the marketing emails and
 * the Google Merchant Center feed must agree on it. `emailService.js` still
 * carries its own copy of the same rule.
 *
 * @param {string} basename
 * @param {'art'|'other'|'other_var'} productType
 * @returns {string|null} null when there is no basename
 */
function productImageUrl(basename, productType) {
  if (!basename) return null;
  if (config.cdnBaseUrl) {
    const prefix = productType === 'art' ? 'art' : 'others';
    return `${config.cdnBaseUrl}/${prefix}/${encodeURIComponent(basename)}`;
  }
  return productType === 'art'
    ? `${config.siteApiBaseUrl}/api/art/images/${encodeURIComponent(basename)}`
    : `${config.siteApiBaseUrl}/api/others/images/${encodeURIComponent(basename)}`;
}

module.exports = { productImageUrl };
