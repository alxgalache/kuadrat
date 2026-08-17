const express = require('express');
const router = express.Router();

const { generalLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { trackEventSchema } = require('../validators/insightsSchemas');
const { trackEvent } = require('../controllers/insightsController');

/**
 * POST /api/insights/events
 *
 * Relé hacia la Conversions API de Meta. Ver `controllers/insightsController.js`.
 *
 * SOBRE EL NOMBRE DE LA RUTA: se evitan a conciencia las palabras que las
 * listas de filtros de los bloqueadores buscan en la URL ("facebook", "pixel",
 * "track", "analytics"). No es un capricho: si la ruta se llamara
 * `/api/facebook/track`, el bloqueador la cortaría igual que corta
 * `fbevents.js` y este endpoint no serviría para nada.
 *
 * Lo que NO hace ese nombre es esquivar la decisión del visitante: quien elige
 * "Solo las necesarias" no genera ninguna llamada aquí, porque el cliente ni
 * siquiera la emite. Lo que se recupera son las conversiones de quienes SÍ
 * consintieron y además tienen un bloqueador puesto.
 */
router.post(
  '/events',
  generalLimiter,
  validate(trackEventSchema),
  trackEvent,
);

module.exports = router;
