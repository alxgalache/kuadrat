const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const logger = require('../config/logger');
const config = require('../config/env');
const turnstileService = require('../services/turnstileService');
const marketingService = require('../services/marketing');

// Public newsletter signup. Mirrors the art-inquiry flow (Turnstile + rate
// limit) but writes a contact to the Resend audience instead of sending an
// email. An already-existing (or unsubscribed) email is NOT an error: the
// service re-subscribes it silently and we return the same success.
const subscribe = async (req, res, next) => {
  try {
    const { firstName, lastName, email, topics, turnstileToken } = req.body;

    // Circuit breaker: same gate as the rest of marketing. Checked before the
    // captcha call so a disabled environment fails fast and cheap.
    if (!marketingService.marketingActive()) {
      throw new ApiError(503, 'La suscripción no está disponible en este momento', 'NEWSLETTER_DISABLED');
    }

    if (!config.turnstile.secret) {
      logger.error('Turnstile secret not configured; refusing newsletter signup');
      throw new ApiError(503, 'Verificación de seguridad no disponible', 'CAPTCHA_UNAVAILABLE');
    }

    let verification;
    try {
      verification = await turnstileService.verify(turnstileToken, req.ip);
    } catch (err) {
      if (err instanceof turnstileService.TurnstileNetworkError) {
        throw new ApiError(503, 'Verificación de seguridad no disponible', 'CAPTCHA_UNAVAILABLE');
      }
      throw err;
    }
    if (!verification.success) {
      throw new ApiError(400, 'Verificación de seguridad fallida', 'CAPTCHA_FAILED');
    }

    let result;
    try {
      result = await marketingService.upsertSubscriber({
        email,
        firstName,
        lastName: lastName || null,
        selectedTopicKeys: topics,
      });
    } catch (err) {
      logger.error({ err, email }, 'Failed to subscribe contact to newsletter');
      throw new ApiError(502, 'No se pudo completar la suscripción', 'SUBSCRIPTION_FAILED');
    }

    // Safety net: the breaker could flip between the early check and here.
    if (result.skipped) {
      throw new ApiError(503, 'La suscripción no está disponible en este momento', 'NEWSLETTER_DISABLED');
    }

    return sendSuccess(res, {}, 200, 'Suscripción completada');
  } catch (err) {
    next(err);
  }
};

module.exports = { subscribe };
