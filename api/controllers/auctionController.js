const { ApiError } = require('../middleware/errorHandler');
const auctionService = require('../services/auctionService');
const stripeService = require('../services/stripeService');

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
      firstName, lastName, email,
      deliveryAddress1, deliveryAddress2, deliveryPostalCode,
      deliveryCity, deliveryProvince, deliveryCountry,
      invoicingAddress1, invoicingAddress2, invoicingPostalCode,
      invoicingCity, invoicingProvince, invoicingCountry,
    } = req.body;

    if (!firstName || !lastName || !email) {
      throw new ApiError(400, 'Nombre, apellido y email son obligatorios', 'Datos incompletos');
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

    // Create (or reuse) Stripe customer
    const customer = await stripeService.createStripeCustomer({
      email: buyer.email,
      name: `${buyer.first_name} ${buyer.last_name}`,
      metadata: { auction_id: id, auction_buyer_id: auctionBuyerId },
    });

    // Create 1 EUR PaymentIntent with setup_future_usage
    const paymentIntent = await stripeService.createAuctionPaymentIntent({
      customerId: customer.id,
      amount: 100, // 1 EUR in cents
      currency: 'eur',
      metadata: { auction_id: id, auction_buyer_id: auctionBuyerId },
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
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
    const { auctionBuyerId, paymentIntentId, paymentMethodId, customerId } = req.body;

    if (!auctionBuyerId || !paymentIntentId) {
      throw new ApiError(400, 'Datos de pago incompletos', 'Datos incompletos');
    }

    const buyer = await auctionService.getAuctionBuyer(auctionBuyerId);
    if (!buyer) {
      throw new ApiError(404, 'Comprador no encontrado', 'Comprador no encontrado');
    }

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
      stripeSetupIntentId: paymentIntentId,
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
    const { auctionBuyerId, productId, productType, amount } = req.body;

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
      id, auctionBuyerId, parseInt(productId, 10), productType, bidAmount
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
// ---------------------------------------------------------------------------
const getPostalCodes = async (req, res, next) => {
  try {
    const { id, productId, productType } = req.params;

    if (!['art', 'other'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    const postalCodes = await auctionService.getPostalCodesForProduct(
      id, parseInt(productId, 10), productType
    );

    res.status(200).json({ success: true, postalCodes });
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
};
