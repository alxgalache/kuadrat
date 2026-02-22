const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// General API rate limiter
const generalLimiter = rateLimit({
    windowMs: config.rateLimit.general.windowSeconds * 60 * 1000,
    limit: config.rateLimit.general.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests, please try again later.',
    },
    // Skip successful requests to the health endpoint
    skip: (req, res) => req.path === '/health',
});

// Stricter limiter for authentication routes (login, register)
const authLimiter = rateLimit({
    windowMs: config.rateLimit.auth.windowSeconds * 60 * 1000,
    limit: config.rateLimit.auth.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes.',
    },
});

// Stricter limiter for sensitive operations (payments, orders)
const sensitiveLimiter = rateLimit({
    windowMs: config.rateLimit.sensitive.windowSeconds * 60 * 1000,
    limit: config.rateLimit.sensitive.maxRequests,
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
    windowMs: config.rateLimit.paymentVerification.windowSeconds * 60 * 1000,
    limit: config.rateLimit.paymentVerification.maxRequests,
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
