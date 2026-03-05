const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
} = require('../services/stripeService');
const {
  loadProductsDetails,
  buildLineItems,
  computeShippingTotal,
  verifyShippingCosts,
} = require('../utils/paymentHelpers');
const { processOrderConfirmation } = require('./paymentsController');
const { releaseOrderInventory } = require('../services/inventoryService');

const SITE_BASE_URL = process.env.SITE_PUBLIC_BASE_URL || 'https://pre.140d.art';
const SITE_API_URL = process.env.SITE_API_BASE_URL || 'https://api.pre.140d.art';

/**
 * POST /api/payments/stripe/create-intent
 * Creates a Stripe PaymentIntent for the given cart items.
 * Body: { items: [...], currency: 'EUR' }
 * Returns: { clientSecret, paymentIntentId, amount, currency }
 */
const createPaymentIntentEndpoint = async (req, res, next) => {
  try {
    const {
      items: compactItems,
      currency = 'EUR',
    } = req.body || {};

    if (!Array.isArray(compactItems) || compactItems.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    // Load products from DB and validate
    const { artMap, otherMap } = await loadProductsDetails(compactItems);

    // Verify shipping costs server-side before computing total
    await verifyShippingCosts(compactItems, artMap, otherMap);

    const { productsTotal } = buildLineItems({
      compactItems,
      artMap,
      otherMap,
      siteApiUrl: SITE_API_URL,
      siteBaseUrl: SITE_BASE_URL,
    });
    const shippingTotal = computeShippingTotal(compactItems);
    const amountMinor = productsTotal + shippingTotal;

    if (amountMinor <= 0) {
      throw new ApiError(400, 'El importe debe ser mayor que cero', 'Importe inválido');
    }

    // Store a compact cart snapshot in metadata for traceability
    const cartSnapshot = JSON.stringify(compactItems.map(i => ({
      type: i.type,
      id: i.id,
      ...(i.variantId ? { variantId: i.variantId } : {}),
      qty: i.quantity || 1,
    })));

    const paymentIntent = await createPaymentIntent({
      amount: amountMinor,
      currency: currency.toLowerCase(),
      metadata: {
        cartSnapshot: cartSnapshot.slice(0, 500), // Stripe metadata value limit
      },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/stripe/webhook
 * Handles Stripe webhook events for payment confirmation.
 * No authentication - Stripe verifies via signature.
 */
const stripeWebhookEndpoint = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    const rawBody = req.rawBody || '';

    let event;
    try {
      event = constructWebhookEvent(rawBody, sig);
    } catch (err) {
      logger.error({ err }, 'Stripe webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    logger.info({ eventType: event.type }, 'Stripe webhook received');

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const stripePaymentIntentId = paymentIntent.id;

      // Find order by stripe_payment_intent_id
      const orderRes = await db.execute({
        sql: 'SELECT id, status FROM orders WHERE stripe_payment_intent_id = ?',
        args: [stripePaymentIntentId],
      });

      if (orderRes.rows.length === 0) {
        logger.info({ stripePaymentIntentId }, 'Order not found for stripe_payment_intent_id');
        return res.status(200).json({ received: true, processed: false, reason: 'order not found' });
      }

      const order = orderRes.rows[0];

      if (order.status === 'paid') {
        logger.info({ orderId: order.id }, 'Order already paid, webhook acknowledged');
        return res.status(200).json({ received: true, processed: false, reason: 'already paid' });
      }

      try {
        const result = await processOrderConfirmation(order.id, stripePaymentIntentId);
        logger.info({ orderId: order.id, result }, 'Order confirmed via Stripe webhook');
        return res.status(200).json({ received: true, processed: true, orderId: order.id });
      } catch (confirmErr) {
        logger.error({ err: confirmErr, orderId: order.id }, 'Failed to confirm order');
        return res.status(200).json({ received: true, processed: false, reason: confirmErr.message });
      }
    }

    // For other event types, acknowledge receipt
    // Handle payment failures and cancellations — release reserved inventory
    if (event.type === 'payment_intent.canceled' || event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const stripePaymentIntentId = paymentIntent.id;

      const orderRes = await db.execute({
        sql: 'SELECT id, status FROM orders WHERE stripe_payment_intent_id = ?',
        args: [stripePaymentIntentId],
      });

      if (orderRes.rows.length > 0) {
        const order = orderRes.rows[0];
        if (order.status === 'pending') {
          try {
            await releaseOrderInventory(order.id, event.type === 'payment_intent.canceled' ? 'payment_cancelled' : 'payment_failed');
            await db.execute({
              sql: "UPDATE orders SET status = 'expired', reserved_at = NULL WHERE id = ?",
              args: [order.id],
            });
            logger.info({ orderId: order.id, eventType: event.type }, 'Released inventory for failed/cancelled payment');
          } catch (releaseErr) {
            logger.error({ err: releaseErr, orderId: order.id }, 'Failed to release inventory on payment failure');
          }
        }
      }

      return res.status(200).json({ received: true, processed: true, reason: event.type });
    }

    return res.status(200).json({ received: true, processed: false, reason: 'unhandled event type' });
  } catch (err) {
    logger.error({ err }, 'Stripe webhook processing error');
    return res.status(200).json({ received: true, processed: false, error: err.message });
  }
};

/**
 * GET /api/payments/stripe/status/:paymentIntentId
 * Returns the status of a Stripe PaymentIntent.
 */
const getStripePaymentStatusEndpoint = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;
    if (!paymentIntentId) {
      throw new ApiError(400, 'Falta paymentIntentId', 'Solicitud inválida');
    }

    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    // Also check if we have an order linked to this payment intent
    const orderRes = await db.execute({
      sql: 'SELECT id, status, token, email, guest_email FROM orders WHERE stripe_payment_intent_id = ?',
      args: [paymentIntentId],
    });

    const order = orderRes.rows.length > 0 ? orderRes.rows[0] : null;

    return res.status(200).json({
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      // Order info if available
      order: order ? {
        id: order.id,
        status: order.status,
        token: order.token,
        email: order.email || order.guest_email,
        is_paid: order.status === 'paid',
      } : null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/stripe/cancel
 * Cancels a Stripe PaymentIntent.
 * Body: { paymentIntentId: string }
 */
const cancelStripePaymentIntentEndpoint = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId) {
      throw new ApiError(400, 'Falta paymentIntentId', 'Solicitud inválida');
    }

    const result = await cancelPaymentIntent(paymentIntentId);

    // Release inventory if there's a pending order linked to this payment intent
    const orderRes = await db.execute({
      sql: 'SELECT id, status FROM orders WHERE stripe_payment_intent_id = ?',
      args: [paymentIntentId],
    });
    if (orderRes.rows.length > 0 && orderRes.rows[0].status === 'pending') {
      try {
        await releaseOrderInventory(orderRes.rows[0].id, 'payment_cancelled');
        await db.execute({
          sql: "UPDATE orders SET status = 'expired', reserved_at = NULL WHERE id = ?",
          args: [orderRes.rows[0].id],
        });
        logger.info({ orderId: orderRes.rows[0].id }, 'Released inventory for cancelled Stripe payment');
      } catch (releaseErr) {
        logger.error({ err: releaseErr, orderId: orderRes.rows[0].id }, 'Failed to release inventory on cancel');
      }
    }

    return res.status(200).json({
      success: true,
      paymentIntentId: result.id,
      status: result.status,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createPaymentIntentEndpoint,
  stripeWebhookEndpoint,
  getStripePaymentStatusEndpoint,
  cancelStripePaymentIntentEndpoint,
};
