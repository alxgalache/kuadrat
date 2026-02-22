const crypto = require('crypto');

/**
 * Express middleware that adds Cache-Control and ETag headers to GET responses.
 * Supports conditional requests with If-None-Match → 304 Not Modified.
 *
 * @param {object} options
 * @param {number} [options.maxAge=60] - Cache-Control max-age in seconds
 * @param {boolean} [options.isPublic=true] - Whether cache is public or private
 * @param {boolean} [options.etag=true] - Whether to generate ETag headers
 * @returns {import('express').RequestHandler}
 */
function cacheControl({ maxAge = 60, isPublic = true, etag = true } = {}) {
  return (req, res, next) => {
    // Only apply to GET requests
    if (req.method !== 'GET') return next();

    const visibility = isPublic ? 'public' : 'private';
    res.set('Cache-Control', `${visibility}, max-age=${maxAge}`);

    if (!etag) return next();

    // Override res.json to add ETag before sending
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const bodyStr = JSON.stringify(body);
      const hash = crypto.createHash('md5').update(bodyStr).digest('hex');
      const etagValue = `"${hash}"`;

      res.set('ETag', etagValue);

      // Check If-None-Match for conditional request
      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch && ifNoneMatch === etagValue) {
        return res.status(304).end();
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * No-cache middleware for responses that should never be cached.
 * @returns {import('express').RequestHandler}
 */
function noCache() {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    next();
  };
}

module.exports = { cacheControl, noCache };
