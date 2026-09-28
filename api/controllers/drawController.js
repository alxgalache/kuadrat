const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const drawService = require('../services/drawService');
const stripeService = require('../services/stripeService');
const { sendDrawEntryConfirmationEmail, sendDrawVerificationEmail } = require('../services/emailService');
const { normalizeEmail } = require('../utils/emailOtp');

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

    // The email must be proven by the token verify-email handed back, for THIS
    // draw and THIS email. Without it, an existing buyer's email returned that
    // buyer's record to anyone who typed it (enforce-verification-gates).
    const verifiedEmail = await drawService.resolveVerificationToken(id, req.body.verificationToken);
    if (!verifiedEmail || verifiedEmail !== normalizeEmail(email)) {
      throw new ApiError(403, 'Verifica tu email antes de continuar', 'VERIFICATION_REQUIRED');
    }

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    const buyer = await drawService.createOrGetDrawBuyer(id, {
      firstName, lastName, email: verifiedEmail, dni, ipAddress,
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
    if (!buyer || buyer.draw_id !== id) {
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

    // Generate and send OTP. Inside the resend cooldown the previous code is
    // still valid: 400 rather than 429, which the client shows as the global
    // rate-limit banner.
    const result = await drawService.createEmailVerification(email, id, ipAddress);
    if (result.tooSoon) {
      throw new ApiError(400, 'Ya te enviamos un código hace unos segundos. Revisa tu correo.', 'OTP_RESEND_TOO_SOON');
    }
    await sendDrawVerificationEmail({ email: normalizeEmail(email), code: result.code });

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

    // The only proof register-buyer accepts. Only its hash is stored.
    res.status(200).json({ success: true, verificationToken: result.verificationToken });
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
    const { drawBuyerId, setupIntentId } = req.body;

    if (!drawBuyerId || !setupIntentId) {
      throw new ApiError(400, 'Datos de pago incompletos', 'Datos incompletos');
    }

    const buyer = await drawService.getDrawBuyer(drawBuyerId);
    if (!buyer || buyer.draw_id !== id) {
      throw new ApiError(404, 'Participante no encontrado', 'Participante no encontrado');
    }

    // Bind the SetupIntent to this buyer and this draw, and require a real
    // card behind it. Accepting any SetupIntent id let a buyer skip the card
    // form entirely and still enter (enforce-verification-gates). The customer
    // comes from the SetupIntent, never from the request body.
    const setupIntent = await stripeService.retrieveSetupIntent(setupIntentId);
    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
    if (setupIntent.status !== 'succeeded' || !paymentMethodId) {
      throw new ApiError(400, 'La autorización de pago no se ha completado', 'SETUP_NOT_SUCCEEDED');
    }
    const metadata = setupIntent.metadata || {};
    if (metadata.draw_buyer_id !== drawBuyerId || metadata.draw_id !== id) {
      logger.warn({ drawId: id, drawBuyerId, setupIntentId }, 'Draw payment confirmation rejected: SetupIntent does not match');
      throw new ApiError(400, 'La autorización de pago no corresponde a esta inscripción', 'SETUP_MISMATCH');
    }
    const customerId = typeof setupIntent.customer === 'string'
      ? setupIntent.customer
      : setupIntent.customer?.id || null;

    let pmName = null;
    let pmLastFour = null;
    let fingerprint = null;
    try {
      const pm = await stripeService.retrievePaymentMethod(paymentMethodId);
      pmName = pm.billing_details?.name || null;
      pmLastFour = pm.card?.last4 || null;
      fingerprint = pm.card?.fingerprint || null;
    } catch {
      // Non-critical
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
      stripePaymentMethodId: paymentMethodId,
      stripeCustomerId: customerId,
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

    // A buyer of another draw is a 404 here, like in setup-payment and
    // confirm-payment. enterDraw repeats the check, but its errors surface
    // as 400s through the catch below.
    const owner = await drawService.getDrawBuyer(drawBuyerId);
    if (!owner || owner.draw_id !== id) {
      throw new ApiError(404, 'Participante no encontrado', 'Participante no encontrado');
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
