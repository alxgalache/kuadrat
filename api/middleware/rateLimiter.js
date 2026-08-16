const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../config/logger');

// Rangos privados RFC1918 + loopback. La red bridge de Docker vive en 172.16/12.
const PRIVATE_IP = /^(::1|::ffff:127\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * ¿La petición viene de dentro del despliegue y no de un visitante?
 *
 * El renderizado de Next.js pide sus datos a la API. Esas peticiones no llevan
 * la IP de quien navega sino la del propio servidor, así que TODOS los renders
 * comparten una única cubeta de rate limit: bastaría una avalancha con caché
 * fría para agotarla y que las fichas de producto empezaran a renderizarse como
 * «no encontrado» — un fallo silencioso que no se parece en nada a su causa.
 *
 * La condición es deliberadamente doble, y el `x-forwarded-for` es la mitad que
 * importa: nginx SIEMPRE añade la cabecera, de modo que cualquier petición que
 * llegue desde fuera la tiene. Una petición sin ella sólo puede haber entrado
 * por la red interna de Docker, a la que no se expone ningún puerto público
 * (el compose publica 3001 en 127.0.0.1). Comprobar sólo el rango privado sí
 * sería explotable: bastaría con enviar `X-Forwarded-For: 10.0.0.1`.
 */
function isInternalRequest(req) {
    if (req.headers['x-forwarded-for']) return false;
    return PRIVATE_IP.test(req.ip || '');
}

// Aviso al arrancar si el límite general se ha dejado abierto. La variable se
// sube a propósito para medir el techo real de la API en pruebas de carga, y
// olvidar revertirla deja el servicio sin protección frente a abuso sin que
// nada lo delate.
if (config.rateLimit.general.maxRequests > 100000) {
    logger.warn(
        { limit: config.rateLimit.general.maxRequests },
        'GENERAL_RATE_LIMIT_MAX_REQUESTS está en un valor de prueba de carga: la API queda efectivamente sin límite de peticiones',
    );
}

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
    // `startsWith` y no igualdad: además de /health existe /health/ready, que
    // consulta un monitor externo cada minuto. Sujetarlo al límite haría que el
    // monitor acabara midiendo el limitador en vez del servicio.
    skip: (req, res) => req.path.startsWith('/health') || isInternalRequest(req),
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
    // Exportado sólo para los tests: es la mitad de seguridad de la exención
    // interna, y merece aserciones propias.
    isInternalRequest,
};
