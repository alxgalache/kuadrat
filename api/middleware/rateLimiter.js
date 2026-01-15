const rateLimit = require('express-rate-limit');

// General API rate limiter
const generalLimiter = rateLimit({
    windowMs: (parseInt(process.env.GENERAL_RATE_LIMIT_WINDOW_SECONDS) || 30) * 60 * 1000,
    limit: parseInt(process.env.GENERAL_RATE_LIMIT_MAX_REQUESTS) || 1000, // Limit each IP to X requests per windowMs
    standardHeaders: 'draft-7', // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        message: 'Too many requests, please try again later.',
    },
    // Skip successful requests to the health endpoint
    skip: (req, res) => req.path === '/health',
});

// Stricter limiter for authentication routes (login, register)
const authLimiter = rateLimit({
    windowMs: (parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS) || 30) * 60 * 1000,
    limit: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 60, // Limit each IP to X requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes.',
    },
});

// Stricter limiter for sensitive operations (payments, orders)
const sensitiveLimiter = rateLimit({
    windowMs: (parseInt(process.env.SENSITIVE_RATE_LIMIT_WINDOW_SECONDS) || 30) * 60 * 1000,
    limit: parseInt(process.env.SENSITIVE_RATE_LIMIT_MAX_REQUESTS) || 500, // Limit each IP to X requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests for this operation, please try again later.',
    },
});

// Lenient limiter for payment verification (status checks, payment retrieval)
// These are read-only operations that need to support polling during checkout
const paymentVerificationLimiter = rateLimit({
    windowMs: (parseInt(process.env.PAYMENT_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS) || 15) * 60 * 1000, // 15 min
    limit: parseInt(process.env.PAYMENT_VERIFICATION_RATE_LIMIT_MAX_REQUESTS) || 2000, // Much higher limit
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many verification requests, please try again later.',
    },
});

module.exports = {
    generalLimiter,
    authLimiter,
    sensitiveLimiter,
    paymentVerificationLimiter,
};