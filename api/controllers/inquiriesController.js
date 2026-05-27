const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const logger = require('../config/logger');
const config = require('../config/env');
const turnstileService = require('../services/turnstileService');
const emailService = require('../services/emailService');

const createArtInquiry = async (req, res, next) => {
  try {
    const { productId, name, email, phone, message, turnstileToken } = req.body;

    if (!config.turnstile.secret) {
      logger.error('Turnstile secret not configured; refusing art inquiry');
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

    const productRows = await db.execute({
      sql: `SELECT a.id, a.name, a.slug, a.price, u.full_name AS seller_full_name
            FROM art a
            LEFT JOIN users u ON a.seller_id = u.id
            WHERE a.id = ?`,
      args: [productId],
    });
    const product = productRows.rows[0];
    if (!product) {
      throw new ApiError(404, 'Obra no encontrada', 'PRODUCT_NOT_FOUND');
    }

    try {
      await emailService.sendArtInquiryEmail({
        inquiry: { name, email, phone: phone || null, message },
        product: {
          id: Number(product.id),
          name: product.name,
          slug: product.slug,
          price: typeof product.price === 'number' ? product.price : Number(product.price),
          seller_full_name: product.seller_full_name || null,
        },
      });
    } catch (err) {
      logger.error({ err, productId }, 'Failed to send art inquiry email');
      throw new ApiError(500, 'No se pudo enviar la consulta', 'EMAIL_DELIVERY_FAILED');
    }

    return sendSuccess(res, {}, 200, 'Consulta enviada');
  } catch (err) {
    next(err);
  }
};

module.exports = { createArtInquiry };
