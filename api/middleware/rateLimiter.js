const rateLimit = require('express-rate-limit');

// General API rate limiter
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
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
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // Limit each IP to 10 auth requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes.',
    },
});

// Stricter limiter for sensitive operations (payments, orders)
const sensitiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 30, // Limit each IP to 30 requests per hour
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests for this operation, please try again later.',
    },
});

module.exports = {
    generalLimiter,
    authLimiter,
    sensitiveLimiter,
};