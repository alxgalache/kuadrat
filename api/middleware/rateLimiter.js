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

// Limiter for the public CoA verification endpoint. Permissive enough to allow
// a collector to tap the sticker repeatedly (e.g. showing it to friends at an
// opening), strict enough to slow down enumeration attempts from a single IP.
const coaVerifyLimiter = rateLimit({
    windowMs: config.rateLimit.coaVerify.windowSeconds * 60 * 1000,
    limit: config.rateLimit.coaVerify.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many verification requests, please try again later.',
    },
});

// Limiter for the public art-product inquiry form. Tight defaults (3/hour/IP)
// because each successful request triggers an outbound email to the commercial
// inbox — abuse would flood that mailbox.
const inquiryLimiter = rateLimit({
    windowMs: config.rateLimit.inquiry.windowSeconds * 60 * 1000,
    limit: config.rateLimit.inquiry.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Has alcanzado el número máximo de consultas. Inténtalo de nuevo más tarde.',
    },
});

module.exports = {
    generalLimiter,
    authLimiter,
    sensitiveLimiter,
    paymentVerificationLimiter,
    coaVerifyLimiter,
    inquiryLimiter,
};
