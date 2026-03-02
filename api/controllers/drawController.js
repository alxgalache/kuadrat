const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const drawService = require('../services/drawService');
const stripeService = require('../services/stripeService');
const { sendDrawEntryConfirmationEmail, sendDrawVerificationEmail } = require('../services/emailService');

// ---------------------------------------------------------------------------
// GET /api/draws?from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------
const getDraws = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      throw new ApiError(400, 'Los parámetros "from" y "to" son obligatorios', 'Solicitud inválida');
    }
    const draws = await drawService.getDrawsByDateRange(from, to);
    res.status(200).json({ success: true, draws });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/draws/:id
// ---------------------------------------------------------------------------
const getDrawDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const draw = await drawService.getDrawById(id);
    if (!draw) {
      throw new ApiError(404, 'Sorteo no encontrado', 'Sorteo no encontrado');
    }
    res.status(200).json({ success: true, draw });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/register-buyer
// ---------------------------------------------------------------------------
const registerBuyer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, email, dni,
      deliveryAddress1, deliveryAddress2, deliveryPostalCode,
      deliveryCity, deliveryProvince, deliveryCountry,
      invoicingAddress1, invoicingAddress2, invoicingPostalCode,
      invoicingCity, invoicingProvince, invoicingCountry,
    } = req.body;

    if (!firstName || !lastName || !email || !dni) {
      throw new ApiError(400, 'Nombre, apellido, email y DNI son obligatorios', 'Datos incompletos');
    }

    const draw = await drawService.getDrawById(id);
    if (!draw) {
      throw new ApiError(404, 'Sorteo no encontrado', 'Sorteo no encontrado');
    }
    if (draw.status !== 'active') {
      throw new ApiError(400, 'Este sorteo no está activo', 'Sorteo no activo');
    }

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    const buyer = await drawService.createOrGetDrawBuyer(id, {
      firstName, lastName, email, dni, ipAddress,
      deliveryAddress1, deliveryAddress2, deliveryPostalCode,
      deliveryCity, deliveryProvince, deliveryCountry,
      invoicingAddress1, invoicingAddress2, invoicingPostalCode,
      invoicingCity, invoicingProvince, invoicingCountry,
    });

    res.status(200).json({
      success: true,
      buyer: {
        id: buyer.id,
        first_name: buyer.first_name,
        last_name: buyer.last_name,
        email: buyer.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/setup-payment
// ---------------------------------------------------------------------------
const setupPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { drawBuyerId } = req.body;

    if (!drawBuyerId) {
      throw new ApiError(400, 'El ID del participante es obligatorio', 'Datos incompletos');
    }

    const buyer = await drawService.getDrawBuyer(drawBuyerId);
    if (!buyer) {
      throw new ApiError(404, 'Participante no encontrado', 'Participante no encontrado');
    }

    const customer = await stripeService.findOrCreateCustomer({
      email: buyer.email,
      name: `${buyer.first_name} ${buyer.last_name}`,
      metadata: { draw_id: id, draw_buyer_id: drawBuyerId },
    });

    const setupIntent = await stripeService.createAuctionSetupIntent({
      customerId: customer.id,
      metadata: { draw_id: id, draw_buyer_id: drawBuyerId },
    });

    res.status(200).json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/send-verification
// ---------------------------------------------------------------------------
const sendVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, dni } = req.body;

    if (!email || !dni) {
      throw new ApiError(400, 'Email y DNI son obligatorios', 'Datos incompletos');
    }

    // Validate DNI format
    if (!drawService.validateDNI(dni)) {
      throw new ApiError(400, 'El DNI/NIE introducido no es válido', 'DNI inválido');
    }

    // Check email uniqueness for this draw (allow re-entry if participation is not completed)
    const isEmailUnique = await drawService.checkEmailUniqueness(id, email);
    if (!isEmailUnique) {
      const hasCompleted = await drawService.hasBuyerCompletedParticipation(id, email, dni);
      if (hasCompleted) {
        throw new ApiError(409, 'Este email ya está registrado en este sorteo', 'Email duplicado');
      }
    }

    // Check DNI uniqueness for this draw (allow re-entry if participation is not completed)
    const isDniUnique = await drawService.checkDniUniqueness(id, dni);
    if (!isDniUnique) {
      const hasCompleted = await drawService.hasBuyerCompletedParticipation(id, email, dni);
      if (hasCompleted) {
        throw new ApiError(409, 'Este DNI ya está registrado en este sorteo', 'DNI duplicado');
      }
    }

    // Capture IP address
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    // Generate and send OTP
    const code = await drawService.createEmailVerification(email, id, ipAddress);
    await sendDrawVerificationEmail({ email, code });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/verify-email
// ---------------------------------------------------------------------------
const verifyEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, code } = req.body;

    if (!email || !code) {
      throw new ApiError(400, 'Email y código son obligatorios', 'Datos incompletos');
    }

    const result = await drawService.verifyEmailCode(email, id, code);
    if (!result.valid) {
      throw new ApiError(400, result.error, 'Verificación fallida');
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/confirm-payment
// ---------------------------------------------------------------------------
const confirmPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { drawBuyerId, setupIntentId, customerId } = req.body;

    if (!drawBuyerId || !setupIntentId) {
      throw new ApiError(400, 'Datos de pago incompletos', 'Datos incompletos');
    }

    const buyer = await drawService.getDrawBuyer(drawBuyerId);
    if (!buyer) {
      throw new ApiError(404, 'Participante no encontrado', 'Participante no encontrado');
    }

    const setupIntent = await stripeService.retrieveSetupIntent(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;

    let pmName = null;
    let pmLastFour = null;
    let fingerprint = null;
    if (paymentMethodId) {
      try {
        const pm = await stripeService.retrievePaymentMethod(paymentMethodId);
        pmName = pm.billing_details?.name || null;
        pmLastFour = pm.card?.last4 || null;
        fingerprint = pm.card?.fingerprint || null;
      } catch {
        // Non-critical
      }
    }

    // Check card fingerprint uniqueness for this draw
    if (fingerprint) {
      const isUnique = await drawService.checkFingerprintUniqueness(id, fingerprint, drawBuyerId);
      if (!isUnique) {
        throw new ApiError(409, 'Este método de pago ya está asociado a otra inscripción en este sorteo', 'Método de pago duplicado');
      }
    } else {
      logger.warn({ drawId: id, drawBuyerId }, 'No card fingerprint available for deduplication');
    }

    await drawService.savePaymentData(drawBuyerId, {
      name: pmName,
      lastFour: pmLastFour,
      stripeSetupIntentId: setupIntentId,
      stripePaymentMethodId: paymentMethodId || null,
      stripeCustomerId: customerId || null,
      stripeFingerprint: fingerprint,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/enter
// ---------------------------------------------------------------------------
const enterDraw = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { drawBuyerId } = req.body;

    if (!drawBuyerId) {
      throw new ApiError(400, 'El ID del participante es obligatorio', 'Datos incompletos');
    }

    const participation = await drawService.enterDraw(id, drawBuyerId);

    // Send confirmation email (non-blocking)
    const draw = await drawService.getDrawById(id);
    const buyer = await drawService.getDrawBuyer(drawBuyerId);
    if (draw && buyer) {
      sendDrawEntryConfirmationEmail({
        email: buyer.email,
        firstName: buyer.first_name,
        drawName: draw.name,
        productName: draw.product_name || 'Producto',
        productType: draw.product_type,
        productBasename: draw.basename || null,
        drawPrice: draw.price,
      }).catch((err) => logger.error({ err }, 'Error sending draw entry confirmation email'));
    }

    res.status(200).json({
      success: true,
      participation: {
        id: participation.id,
        created_at: participation.created_at,
      },
    });
  } catch (error) {
    if (error.message && !error.statusCode) {
      return next(new ApiError(400, error.message, 'Error en la inscripción'));
    }
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/validate-postal-code
// ---------------------------------------------------------------------------
const validatePostalCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { postalCode, country } = req.body;

    const result = await drawService.validatePostalCodeForDraw(id, postalCode, country || 'ES');
    if (result === null) {
      throw new ApiError(404, 'Sorteo no encontrado', 'Sorteo no encontrado');
    }

    res.status(200).json({ success: true, valid: result.valid });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDraws,
  getDrawDetail,
  registerBuyer,
  setupPayment,
  confirmPayment,
  enterDraw,
  sendVerification,
  verifyEmail,
  validatePostalCode,
};
