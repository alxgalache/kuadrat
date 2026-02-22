const { ApiError } = require('./errorHandler');

/**
 * Express middleware that enforces a response timeout.
 * If the response doesn't finish within the timeout, sends a 408 error.
 *
 * @param {number} [ms=30000] - Timeout in milliseconds
 * @returns {import('express').RequestHandler}
 */
function requestTimeout(ms = 30000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(new ApiError(408, 'La solicitud ha tardado demasiado', 'Tiempo de espera agotado'));
      }
    }, ms);

    // Clean up timer when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

// Pre-configured timeouts for common use cases
const standardTimeout = requestTimeout(30000);   // 30s for normal requests
const uploadTimeout = requestTimeout(120000);     // 2min for file uploads
const paymentTimeout = requestTimeout(60000);     // 1min for payment operations

module.exports = { requestTimeout, standardTimeout, uploadTimeout, paymentTimeout };
