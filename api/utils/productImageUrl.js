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

/**
 * Version segment of the square JPEG copies (`/api/{art,others}/images/jpeg/v1/…`,
 * services/catalogImageService.js). The routes are mounted with it and the Meta
 * feed links to it. A copy behind `v1` never changes: a new size, background or
 * format is published as `v2`, and this constant moves with it.
 */
const CATALOG_JPEG_VERSION = 'v1';

/**
 * Public, absolute URL of the square JPEG copy of a product image, for the
 * channels that do not accept WebP (the Meta catalogue). Always the API: the
 * copies are generated there and cached by nginx, never stored in S3.
 *
 * The URL ends in `.jpg` (`<uuid>.webp.jpg`): it serves a JPEG, and a
 * validator that trusts the extension must not read `.webp` there.
 *
 * @param {string} basename
 * @param {'art'|'other'|'other_var'} productType
 * @returns {string|null} null when there is no basename
 */
function catalogJpegUrl(basename, productType) {
  if (!basename) return null;
  const prefix = productType === 'art' ? 'art' : 'others';
  return `${config.siteApiBaseUrl}/api/${prefix}/images/jpeg/${CATALOG_JPEG_VERSION}/${encodeURIComponent(basename)}.jpg`;
}

module.exports = { productImageUrl, catalogJpegUrl, CATALOG_JPEG_VERSION };
