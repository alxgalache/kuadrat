const logger = require('../config/logger');

/**
 * Security Middleware
 * Protects against prototype pollution, injection attacks, and suspicious requests
 */

// Patterns that indicate prototype pollution attempts
const PROTOTYPE_POLLUTION_PATTERNS = [
    '__proto__',
    'constructor',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
];

// Patterns that indicate command injection attempts
const COMMAND_INJECTION_PATTERNS = [
    'curl ',
    'wget ',
    'bash ',
    '/bin/sh',
    '/bin/bash',
    'exec(',
    'eval(',
    'child_process',
    'require(',
    'import(',
    'process.env',
    '$(', // Command substitution
    '`', // Backtick command execution
    '| bash',
    '| sh',
    '; rm ',
    '&& rm ',
    'gsocket',
    '/dev/tcp',
    '/dev/udp',
    'nc -e',
    'netcat',
    'powershell',
    'cmd.exe',
];

// Suspicious path patterns (vulnerability scanners)
const SUSPICIOUS_PATHS = [
    '.git',
    '.env',
    '.htaccess',
    'wp-admin',
    'wp-login',
    'wp-content',
    'phpinfo',
    'phpmyadmin',
    'adminer',
    '.php',
    '.asp',
    '.aspx',
    '.jsp',
    'actuator',
    'console',
    'manager/html',
    'solr',
    'struts',
    'jenkins',
    'config.json',
    'package.json',
    'composer.json',
    '.DS_Store',
    'Thumbs.db',
    'web.config',
];

/**
 * Deep scan an object for prototype pollution patterns
 * @param {any} obj - Object to scan
 * @param {string} path - Current path in object (for logging)
 * @returns {boolean} - true if suspicious patterns found
 */
function containsPrototypePollution(obj, path = '') {
    if (obj === null || obj === undefined) {
        return false;
    }

    if (typeof obj === 'string') {
        const lowerStr = obj.toLowerCase();
        return PROTOTYPE_POLLUTION_PATTERNS.some(pattern =>
            lowerStr.includes(pattern.toLowerCase())
        );
    }

    if (Array.isArray(obj)) {
        return obj.some((item, index) =>
            containsPrototypePollution(item, `${path}[${index}]`)
        );
    }

    if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
            // Check if the key itself is a pollution attempt
            if (PROTOTYPE_POLLUTION_PATTERNS.includes(key)) {
                logger.warn({ path: `${path}.${key}` }, 'Prototype pollution attempt detected in key');
                return true;
            }
            // Recursively check values
            if (containsPrototypePollution(obj[key], `${path}.${key}`)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check for command injection patterns in request data
 * @param {any} obj - Object to scan
 * @returns {boolean} - true if suspicious patterns found
 */
function containsCommandInjection(obj) {
    if (obj === null || obj === undefined) {
        return false;
    }

    if (typeof obj === 'string') {
        const lowerStr = obj.toLowerCase();
        return COMMAND_INJECTION_PATTERNS.some(pattern =>
            lowerStr.includes(pattern.toLowerCase())
        );
    }

    if (Array.isArray(obj)) {
        return obj.some(item => containsCommandInjection(item));
    }

    if (typeof obj === 'object') {
        return Object.values(obj).some(value => containsCommandInjection(value));
    }

    return false;
}

/**
 * Main security middleware
 * Blocks requests with prototype pollution, command injection, and suspicious patterns
 */
const prototypePollutionGuard = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    // Check URL path for suspicious patterns
    const urlPath = req.path.toLowerCase();
    if (SUSPICIOUS_PATHS.some(pattern => urlPath.includes(pattern.toLowerCase()))) {
        logger.warn({ urlPath, clientIP }, 'Suspicious path access blocked');
        return res.status(404).json({
            success: false,
            message: 'Not found'
        });
    }

    // Check request body for prototype pollution
    if (req.body && typeof req.body === 'object') {
        if (containsPrototypePollution(req.body, 'body')) {
            logger.error({ clientIP, path: req.path, userAgent: req.get('User-Agent') }, 'Prototype pollution attack blocked');
            return res.status(400).json({
                success: false,
                message: 'Invalid request data'
            });
        }

        // Check for command injection in body
        if (containsCommandInjection(req.body)) {
            logger.error({ clientIP, path: req.path, userAgent: req.get('User-Agent') }, 'Command injection attempt blocked');
            return res.status(400).json({
                success: false,
                message: 'Invalid request data'
            });
        }
    }

    // Check query parameters
    if (req.query && typeof req.query === 'object') {
        if (containsPrototypePollution(req.query, 'query')) {
            logger.error({ clientIP }, 'Prototype pollution in query params');
            return res.status(400).json({
                success: false,
                message: 'Invalid request parameters'
            });
        }

        if (containsCommandInjection(req.query)) {
            logger.error({ clientIP }, 'Command injection in query params');
            return res.status(400).json({
                success: false,
                message: 'Invalid request parameters'
            });
        }
    }

    // Check URL-encoded body (for form submissions)
    if (req.params && typeof req.params === 'object') {
        if (containsPrototypePollution(req.params, 'params')) {
            logger.error({ clientIP }, 'Prototype pollution in URL params');
            return res.status(400).json({
                success: false,
                message: 'Invalid request'
            });
        }
    }

    next();
};

/**
 * Block requests from known malicious user agents
 * Note: This filter is DISABLED in development mode to allow testing tools
 */
const userAgentFilter = (req, res, next) => {
    // Skip user agent filtering in development mode
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const userAgent = (req.get('User-Agent') || '').toLowerCase();

    // Only block actual malicious scanners/attack tools
    // Removed: curl, wget, python-requests, go-http-client (legitimate testing tools)
    const maliciousAgents = [
        'nmap', 'nikto', 'wikto', 'sqlmap', 'bsqlbf', 'w3af',
        'acunetix', 'havij', 'appscan', 'nessus', 'burpsuite',
        'dirbuster', 'gobuster', 'wfuzz', 'masscan', 'zgrab',
        'exploit', 'attack', 'hack',
    ];

    // Allow empty user agents for health checks
    if (!userAgent) {
        if (req.path === '/health') {
            return next();
        }
    }

    // Block known malicious user agents
    if (maliciousAgents.some(agent => userAgent.includes(agent))) {
        const clientIP = req.ip || req.connection.remoteAddress;
        logger.warn({ userAgent, clientIP }, 'Blocked malicious user agent');
        return res.status(403).json({
            success: false,
            message: 'Access denied'
        });
    }

    next();
};

/**
 * Request size limiter - prevents large payload attacks
 */
const requestSizeLimiter = (maxSizeBytes = 10 * 1024 * 1024) => {
    return (req, res, next) => {
        const contentLength = parseInt(req.get('Content-Length') || '0', 10);

        if (contentLength > maxSizeBytes) {
            const clientIP = req.ip || req.connection.remoteAddress;
            logger.warn({ contentLength, clientIP }, 'Oversized request blocked');
            return res.status(413).json({
                success: false,
                message: 'Request too large'
            });
        }

        next();
    };
};

/**
 * Log suspicious activity for later analysis
 */
const suspiciousActivityLogger = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const path = req.path;
    const method = req.method;
    const userAgent = req.get('User-Agent') || 'unknown';

    // Log POST/PUT/PATCH requests to non-standard endpoints
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        // Check for unusual characters in path
        if (/[<>'";&|`$]/.test(path)) {
            logger.warn({ path, clientIP }, 'Suspicious characters in path');
        }
    }

    // Track response for logging
    const originalSend = res.send;
    res.send = function(body) {
        // Log 4xx and 5xx responses
        if (res.statusCode >= 400) {
            logger.info({ method, path, statusCode: res.statusCode, clientIP, userAgent }, 'Audit log');
        }
        return originalSend.call(this, body);
    };

    next();
};

module.exports = {
    prototypePollutionGuard,
    userAgentFilter,
    requestSizeLimiter,
    suspiciousActivityLogger,
    // Export for testing
    containsPrototypePollution,
    containsCommandInjection,
};
