const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const auctionService = require('../services/auctionService');
const stripeService = require('../services/stripeService');
const { sendBidConfirmationEmail, sendAuctionVerificationEmail } = require('../services/emailService');

// ---------------------------------------------------------------------------
// GET /api/auctions?from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------
const getAuctions = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      throw new ApiError(400, 'Los parámetros "from" y "to" son obligatorios', 'Solicitud inválida');
    }
    const auctions = await auctionService.getAuctionsByDateRange(from, to);
    res.status(200).json({ success: true, auctions });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/auctions/:id
// ---------------------------------------------------------------------------
const getAuctionDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const auction = await auctionService.getAuctionById(id);
    if (!auction) {
      throw new ApiError(404, 'Subasta no encontrada', 'Subasta no encontrada');
    }
    res.status(200).json({ success: true, auction });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/auctions/:id/products/:productId/:productType/bids
// ---------------------------------------------------------------------------
const getProductBids = async (req, res, next) => {
  try {
    const { id, productId, productType } = req.params;
    const limit = parseInt(req.query.limit, 10) || 50;

    if (!['art', 'other'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    const bids = await auctionService.getProductBids(id, parseInt(productId, 10), productType, limit);
    res.status(200).json({ success: true, bids });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/auctions/:id/register-buyer
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
      throw new ApiError(400, 'Nombre, apellido, email y DNI/NIE son obligatorios', 'Datos incompletos');
    }

    // Verify auction exists and is active
    const auction = await auctionService.getAuctionById(id);
    if (!auction) {
      throw new ApiError(404, 'Subasta no encontrada', 'Subasta no encontrada');
    }
    if (auction.status !== 'active') {
      throw new ApiError(400, 'Esta subasta no está activa', 'Subasta no activa');
    }

    const buyer = await auctionService.createOrGetAuctionBuyer(id, {
      firstName, lastName, email, dni: dni.toUpperCase().trim(),
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
// POST /api/auctions/:id/verify-buyer
// ---------------------------------------------------------------------------
const verifyBuyer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, bidPassword } = req.body;

    if (!email || !bidPassword) {
      throw new ApiError(400, 'Email y contraseña de puja son obligatorios', 'Datos incompletos');
    }

    const buyer = await auctionService.verifyBidPassword(email, id, bidPassword);
    if (!buyer) {
      throw new ApiError(401, 'Email o contraseña de puja incorrectos', 'Verificación fallida');
    }

    // Check if buyer already has payment data
    const paymentData = await auctionService.getBuyerPaymentData(buyer.id);

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
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/auctions/:id/setup-payment
// ---------------------------------------------------------------------------
const setupPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { auctionBuyerId } = req.body;

    if (!auctionBuyerId) {
      throw new ApiError(400, 'El ID del comprador es obligatorio', 'Datos incompletos');
    }

    const buyer = await auctionService.getAuctionBuyer(auctionBuyerId);
    if (!buyer) {
      throw new ApiError(404, 'Comprador no encontrado', 'Comprador no encontrado');
    }

    // Find existing Stripe customer by email or create a new one
    const customer = await stripeService.findOrCreateCustomer({
      email: buyer.email,
      name: `${buyer.first_name} ${buyer.last_name}`,
      metadata: { auction_id: id, auction_buyer_id: auctionBuyerId },
    });

    // Create a SetupIntent to verify and save the payment method (no charge)
    const setupIntent = await stripeService.createAuctionSetupIntent({
      customerId: customer.id,
      metadata: { auction_id: id, auction_buyer_id: auctionBuyerId },
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
// POST /api/auctions/:id/confirm-payment
// ---------------------------------------------------------------------------
const confirmPayment = async (req, res, next) => {
  try {
    const { auctionBuyerId, setupIntentId, customerId } = req.body;

    if (!auctionBuyerId || !setupIntentId) {
      throw new ApiError(400, 'Datos de pago incompletos', 'Datos incompletos');
    }

    const buyer = await auctionService.getAuctionBuyer(auctionBuyerId);
    if (!buyer) {
      throw new ApiError(404, 'Comprador no encontrado', 'Comprador no encontrado');
    }

    // Retrieve the SetupIntent to get the saved payment method
    const setupIntent = await stripeService.retrieveSetupIntent(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;

    // Retrieve payment method details
    let pmName = null;
    let pmLastFour = null;
    if (paymentMethodId) {
      try {
        const pm = await stripeService.retrievePaymentMethod(paymentMethodId);
        pmName = pm.billing_details?.name || null;
        pmLastFour = pm.card?.last4 || null;
      } catch {
        // Non-critical - we can continue without card details
      }
    }

    // Save payment data
    await auctionService.savePaymentData(auctionBuyerId, {
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
// POST /api/auctions/:id/bid
// ---------------------------------------------------------------------------
const placeBid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { auctionBuyerId, productId, productType, amount, expectedPrice } = req.body;

    if (!auctionBuyerId || !productId || !productType || !amount) {
      throw new ApiError(400, 'Faltan datos obligatorios para la puja', 'Datos incompletos');
    }

    if (!['art', 'other'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    // Verify auction is active
    const auction = await auctionService.getAuctionById(id);
    if (!auction) {
      throw new ApiError(404, 'Subasta no encontrada', 'Subasta no encontrada');
    }
    if (auction.status !== 'active') {
      throw new ApiError(400, 'Esta subasta no está activa', 'Subasta no activa');
    }

    // Verify buyer
    const buyer = await auctionService.getAuctionBuyer(auctionBuyerId);
    if (!buyer || buyer.auction_id !== id) {
      throw new ApiError(403, 'Comprador no válido para esta subasta', 'Acceso denegado');
    }

    // Verify buyer has payment method
    const paymentData = await auctionService.getBuyerPaymentData(auctionBuyerId);
    if (!paymentData) {
      throw new ApiError(400, 'Debes completar el pago de autorización antes de pujar', 'Pago requerido');
    }

    // Place the bid
    const bidAmount = parseFloat(amount);
    const { bid, updatedPrice } = await auctionService.placeBid(
      id, auctionBuyerId, parseInt(productId, 10), productType, bidAmount,
      expectedPrice !== undefined && expectedPrice !== null ? parseFloat(expectedPrice) : undefined
    );

    // Broadcast via Socket.IO
    const auctionSocket = req.app.get('auctionSocket');
    if (auctionSocket) {
      auctionSocket.broadcastNewBid(id, {
        buyerFirstName: buyer.first_name,
        amount: bidAmount,
        productId: parseInt(productId, 10),
        productType,
        createdAt: bid.created_at,
      });

      const stepNewBid = auction.products?.find(
        (p) => (p.art_id === parseInt(productId, 10) || p.other_id === parseInt(productId, 10)) && p.product_type === productType
      )?.step_new_bid || 0;

      auctionSocket.broadcastPriceUpdate(id, {
        productId: parseInt(productId, 10),
        productType,
        newPrice: updatedPrice,
        nextBidAmount: updatedPrice + stepNewBid,
      });
    }

    // Anti-sniping: if less than 5 minutes remain, extend by 5 minutes
    const now = new Date();
    const endTime = new Date(auction.end_datetime);
    const remainingMs = endTime.getTime() - now.getTime();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (remainingMs > 0 && remainingMs < fiveMinutesMs) {
      const newEnd = await auctionService.extendAuction(id, 5);
      if (auctionSocket && newEnd) {
        auctionSocket.broadcastAuctionExtended(id, { newEndDatetime: newEnd });
      }
    }

    // Send bid confirmation email (non-blocking)
    const auctionProduct = auction.products?.find(
      (p) => (p.art_id === parseInt(productId, 10) || p.other_id === parseInt(productId, 10)) && p.product_type === productType
    );
    sendBidConfirmationEmail({
      email: buyer.email,
      firstName: buyer.first_name,
      bidPassword: buyer.bid_password,
      auctionName: auction.name,
      productName: auctionProduct?.name || 'Producto',
      bidAmount: bidAmount,
      productType,
      productBasename: auctionProduct?.basename || null,
      sellerName: auctionProduct?.seller_name || null,
    }).catch((err) => logger.error({ err }, 'Error sending bid confirmation email'));

    res.status(200).json({
      success: true,
      bid: {
        id: bid.id,
        amount: bid.amount,
        created_at: bid.created_at,
      },
      updatedPrice,
    });
  } catch (error) {
    // Convert service-level errors to API errors
    if (error.message && !error.statusCode) {
      return next(new ApiError(400, error.message, 'Error en la puja'));
    }
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/auctions/:id/postal-codes/:productId/:productType
// Returns postal refs (not expanded postal codes) for a product.
// ---------------------------------------------------------------------------
const getPostalCodes = async (req, res, next) => {
  try {
    const { id, productId, productType } = req.params;

    if (!['art', 'other'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    const postalCodes = await auctionService.getPostalRefsForProduct(
      id, parseInt(productId, 10), productType
    );

    res.status(200).json({ success: true, postalCodes });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/auctions/:id/validate-postal-code/:productId/:productType?postalCode=...
// Validates whether a buyer's postal code is allowed for a product.
// ---------------------------------------------------------------------------
const validatePostalCode = async (req, res, next) => {
  try {
    const { id, productId, productType } = req.params;
    const { postalCode } = req.query;

    if (!['art', 'other'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    if (!postalCode) {
      throw new ApiError(400, 'Código postal requerido', 'Solicitud inválida');
    }

    const result = await auctionService.validatePostalCodeForProduct(
      id, parseInt(productId, 10), productType, postalCode
    );

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/auctions/:id/send-verification
// ---------------------------------------------------------------------------
const sendVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, dni } = req.body;

    const auction = await auctionService.getAuctionById(id);
    if (!auction) {
      throw new ApiError(404, 'Subasta no encontrada', 'Subasta no encontrada');
    }
    if (auction.status !== 'active') {
      throw new ApiError(400, 'Esta subasta no está activa', 'Subasta no activa');
    }

    if (!auctionService.validateDNI(dni)) {
      throw new ApiError(400, 'DNI/NIE no válido', 'DNI/NIE no válido');
    }

    const normalizedDni = dni.toUpperCase().trim();
    const normalizedEmail = email.toLowerCase().trim();

    const completed = await auctionService.hasBuyerCompletedRegistration(id, normalizedEmail, normalizedDni);
    if (completed) {
      throw new ApiError(409, 'Ya estás registrado en esta subasta con este email o DNI/NIE', 'Ya registrado');
    }

    const isEmailUnique = await auctionService.checkEmailUniqueness(id, normalizedEmail);
    if (!isEmailUnique) {
      throw new ApiError(409, 'Este email ya está registrado en esta subasta', 'Email duplicado');
    }

    const isDniUnique = await auctionService.checkDniUniqueness(id, normalizedDni);
    if (!isDniUnique) {
      throw new ApiError(409, 'Este DNI/NIE ya está registrado en esta subasta', 'DNI duplicado');
    }

    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const code = await auctionService.createEmailVerification(normalizedEmail, id, ipAddress);

    await sendAuctionVerificationEmail(normalizedEmail, code, auction.name);

    res.status(200).json({ success: true, message: 'Código de verificación enviado' });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/auctions/:id/verify-email
// ---------------------------------------------------------------------------
const verifyEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, code } = req.body;

    const auction = await auctionService.getAuctionById(id);
    if (!auction) {
      throw new ApiError(404, 'Subasta no encontrada', 'Subasta no encontrada');
    }

    const result = await auctionService.verifyEmailCode(email.toLowerCase().trim(), id, code);
    if (!result.valid) {
      throw new ApiError(400, result.error, result.error);
    }

    res.status(200).json({ success: true, message: 'Email verificado correctamente' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuctions,
  getAuctionDetail,
  getProductBids,
  registerBuyer,
  verifyBuyer,
  setupPayment,
  confirmPayment,
  placeBid,
  getPostalCodes,
  validatePostalCode,
  sendVerification,
  verifyEmail,
};
