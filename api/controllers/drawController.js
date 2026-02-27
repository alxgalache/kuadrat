const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const drawService = require('../services/drawService');
const stripeService = require('../services/stripeService');
const { sendDrawEntryConfirmationEmail } = require('../services/emailService');

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
      firstName, lastName, email,
      deliveryAddress1, deliveryAddress2, deliveryPostalCode,
      deliveryCity, deliveryProvince, deliveryCountry,
      invoicingAddress1, invoicingAddress2, invoicingPostalCode,
      invoicingCity, invoicingProvince, invoicingCountry,
    } = req.body;

    if (!firstName || !lastName || !email) {
      throw new ApiError(400, 'Nombre, apellido y email son obligatorios', 'Datos incompletos');
    }

    const draw = await drawService.getDrawById(id);
    if (!draw) {
      throw new ApiError(404, 'Sorteo no encontrado', 'Sorteo no encontrado');
    }
    if (draw.status !== 'active') {
      throw new ApiError(400, 'Este sorteo no está activo', 'Sorteo no activo');
    }

    const buyer = await drawService.createOrGetDrawBuyer(id, {
      firstName, lastName, email,
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
        bid_password: buyer.bid_password,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/draws/:id/verify-buyer
// ---------------------------------------------------------------------------
const verifyBuyer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, bidPassword } = req.body;

    if (!email || !bidPassword) {
      throw new ApiError(400, 'Email y contraseña de acceso son obligatorios', 'Datos incompletos');
    }

    const buyer = await drawService.verifyDrawBuyerPassword(email, id, bidPassword);
    if (!buyer) {
      throw new ApiError(401, 'Email o contraseña de acceso incorrectos', 'Verificación fallida');
    }

    const paymentData = await drawService.getBuyerPaymentData(buyer.id);
    const hasParticipation = await drawService.hasParticipation(id, buyer.id);

    res.status(200).json({
      success: true,
      buyer: {
        id: buyer.id,
        first_name: buyer.first_name,
        last_name: buyer.last_name,
        email: buyer.email,
        bid_password: buyer.bid_password,
      },
      hasPaymentMethod: !!paymentData,
      hasParticipation,
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
// POST /api/draws/:id/confirm-payment
// ---------------------------------------------------------------------------
const confirmPayment = async (req, res, next) => {
  try {
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
    if (paymentMethodId) {
      try {
        const pm = await stripeService.retrievePaymentMethod(paymentMethodId);
        pmName = pm.billing_details?.name || null;
        pmLastFour = pm.card?.last4 || null;
      } catch {
        // Non-critical
      }
    }

    await drawService.savePaymentData(drawBuyerId, {
      name: pmName,
      lastFour: pmLastFour,
      stripeSetupIntentId: setupIntentId,
      stripePaymentMethodId: paymentMethodId || null,
      stripeCustomerId: customerId || null,
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
        bidPassword: buyer.bid_password,
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

module.exports = {
  getDraws,
  getDrawDetail,
  registerBuyer,
  verifyBuyer,
  setupPayment,
  confirmPayment,
  enterDraw,
};
