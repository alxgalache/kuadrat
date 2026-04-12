const drawService = require('../services/drawService');
const { db } = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/env');

/**
 * POST /api/admin/draws
 */
const createDraw = async (req, res, next) => {
  try {
    const { name, description, product_id, product_type, price, units, min_participants, max_participations, start_datetime, end_datetime, status } = req.body;

    if (!name || !product_id || !product_type || !price || !max_participations || !start_datetime || !end_datetime) {
      return res.status(400).json({
        success: false,
        title: 'Datos incompletos',
        message: 'Nombre, producto, precio, máximo de participaciones y fechas son obligatorios',
      });
    }

    if (new Date(start_datetime) >= new Date(end_datetime)) {
      return res.status(400).json({
        success: false,
        title: 'Fechas inválidas',
        message: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
    }

    const draw = await drawService.createDraw({
      name,
      description,
      product_id: parseInt(product_id, 10),
      product_type,
      price: parseFloat(price),
      units: units ? parseInt(units, 10) : 1,
      min_participants: min_participants ? parseInt(min_participants, 10) : 30,
      max_participations: parseInt(max_participations, 10),
      start_datetime,
      end_datetime,
      status,
    });

    const fullDraw = await drawService.getDrawById(draw.id);

    res.status(201).json({
      success: true,
      title: 'Sorteo creado',
      message: 'El sorteo se ha creado correctamente',
      draw: fullDraw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/draws
 */
const listDraws = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filters = {};
    if (status) filters.status = status;

    const draws = await drawService.listDraws(filters);

    res.status(200).json({
      success: true,
      draws,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/draws/:id
 */
const getDraw = async (req, res, next) => {
  try {
    const draw = await drawService.getDrawById(req.params.id);

    if (!draw) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Sorteo no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      draw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/draws/:id
 */
const updateDraw = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, product_id, product_type, price, units, min_participants, max_participations, start_datetime, end_datetime, status } = req.body;

    const fields = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (product_id !== undefined) fields.product_id = parseInt(product_id, 10);
    if (product_type !== undefined) fields.product_type = product_type;
    if (price !== undefined) fields.price = parseFloat(price);
    if (units !== undefined) fields.units = parseInt(units, 10);
    if (min_participants !== undefined) fields.min_participants = parseInt(min_participants, 10);
    if (max_participations !== undefined) fields.max_participations = parseInt(max_participations, 10);
    if (start_datetime !== undefined) fields.start_datetime = start_datetime;
    if (end_datetime !== undefined) fields.end_datetime = end_datetime;
    if (status !== undefined) fields.status = status;

    const draw = await drawService.updateDraw(id, fields);

    if (!draw) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Sorteo no encontrado o no se puede modificar en su estado actual',
      });
    }

    const fullDraw = await drawService.getDrawById(id);

    res.status(200).json({
      success: true,
      title: 'Sorteo actualizado',
      message: 'El sorteo se ha actualizado correctamente',
      draw: fullDraw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/draws/:id
 */
const deleteDraw = async (req, res, next) => {
  try {
    const result = await drawService.deleteDraw(req.params.id);

    if (!result) {
      return res.status(400).json({
        success: false,
        title: 'No se puede eliminar',
        message: 'Solo se pueden eliminar sorteos en estado borrador o cancelados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo eliminado',
      message: 'El sorteo se ha eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/start
 */
const startDraw = async (req, res, next) => {
  try {
    const draw = await drawService.startDraw(req.params.id);

    if (!draw) {
      return res.status(400).json({
        success: false,
        title: 'No se puede iniciar',
        message: 'Solo se pueden iniciar sorteos programados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo iniciado',
      message: 'El sorteo se ha iniciado correctamente',
      draw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/cancel
 */
const cancelDraw = async (req, res, next) => {
  try {
    const draw = await drawService.cancelDraw(req.params.id);

    if (!draw) {
      return res.status(400).json({
        success: false,
        title: 'No se puede cancelar',
        message: 'No se pueden cancelar sorteos finalizados o no encontrados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo cancelado',
      message: 'El sorteo se ha cancelado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/draws/:id/participations
 */
const getParticipations = async (req, res, next) => {
  try {
    const participations = await drawService.getDrawParticipationsWithDetails(req.params.id);

    res.status(200).json({
      success: true,
      participations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/finish
 */
const finishDraw = async (req, res, next) => {
  try {
    const draw = await drawService.finishDraw(req.params.id);

    if (!draw) {
      return res.status(400).json({
        success: false,
        title: 'No se puede finalizar',
        message: 'Solo se pueden finalizar sorteos activos',
      });
    }

    const drawSocket = req.app.get('drawSocket');
    if (drawSocket) {
      drawSocket.broadcastDrawEnded(draw.id);
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo finalizado',
      message: 'El sorteo se ha finalizado correctamente',
      draw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/participations/:participationId/bill
 */
const billParticipation = async (req, res, next) => {
  try {
    const { id, participationId } = req.params;
    const { shippingCost = 0 } = req.body;

    // 1. Fetch all billing data
    const data = await drawService.getParticipationBillingData(participationId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Participación no encontrada' });
    }
    if (data.draw_id !== id) {
      return res.status(400).json({ success: false, message: 'La participación no pertenece a este sorteo' });
    }

    // 2. Idempotency check
    const marker = `draw_participation:${participationId}`;
    const existing = await db.execute({
      sql: `SELECT id FROM orders WHERE notes = ?`,
      args: [marker],
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Esta participación ya ha sido facturada',
        orderId: existing.rows[0].id,
      });
    }

    // 3. Create order
    const token = require('crypto').randomUUID();
    const drawPrice = Number(data.price) || 0;
    const parsedShippingCost = Number(shippingCost) || 0;
    const commissionRate = data.product_type === 'other'
      ? (config.payment.dealerCommissionOthers / 100)
      : (config.payment.dealerCommissionArt / 100);
    const commissionAmount = Math.round(drawPrice * commissionRate * 100) / 100;
    const totalPrice = drawPrice + parsedShippingCost;

    const orderResult = await db.execute({
      sql: `INSERT INTO orders (
              full_name, email, total_price, status, token,
              delivery_address_line_1, delivery_address_line_2,
              delivery_postal_code, delivery_city, delivery_province, delivery_country,
              delivery_lat, delivery_lng,
              invoicing_address_line_1, invoicing_address_line_2,
              invoicing_postal_code, invoicing_city, invoicing_province, invoicing_country,
              payment_provider, stripe_customer_id, stripe_payment_method_id,
              notes
            ) VALUES (?, ?, ?, 'pending', ?,
              ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              'stripe', ?, ?,
              ?)`,
      args: [
        `${data.first_name} ${data.last_name}`,
        data.email,
        totalPrice,
        token,
        data.delivery_address_1 || null,
        data.delivery_address_2 || null,
        data.delivery_postal_code || null,
        data.delivery_city || null,
        data.delivery_province || null,
        data.delivery_country || null,
        data.delivery_lat != null ? Number(data.delivery_lat) : null,
        data.delivery_long != null ? Number(data.delivery_long) : null,
        data.invoicing_address_1 || null,
        data.invoicing_address_2 || null,
        data.invoicing_postal_code || null,
        data.invoicing_city || null,
        data.invoicing_province || null,
        data.invoicing_country || null,
        data.stripe_customer_id || null,
        data.stripe_payment_method_id || null,
        marker,
      ],
    });

    const orderId = Number(orderResult.lastInsertRowid);

    // 4. Create order item (art or other)
    if (data.product_type === 'art') {
      await db.execute({
        sql: `INSERT INTO art_order_items (
                order_id, art_id, price_at_purchase, shipping_cost, commission_amount, status
              ) VALUES (?, ?, ?, ?, ?, 'pending')`,
        args: [orderId, data.product_id, drawPrice, parsedShippingCost, commissionAmount],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO other_order_items (
                order_id, other_id, quantity, price_at_purchase, shipping_cost, commission_amount, status
              ) VALUES (?, ?, 1, ?, ?, ?, 'pending')`,
        args: [orderId, data.product_id, drawPrice, parsedShippingCost, commissionAmount],
      });
    }

    // 5. Charge off-session via Stripe
    const stripeService = require('../services/stripeService');
    const amountInCents = Math.round(totalPrice * 100);

    let chargeResult;
    try {
      chargeResult = await stripeService.chargeWinnerOffSession({
        customerId: data.stripe_customer_id,
        paymentMethodId: data.stripe_payment_method_id,
        amount: amountInCents,
        currency: 'eur',
        metadata: {
          draw_id: id,
          participation_id: participationId,
          order_id: String(orderId),
          product_id: String(data.product_id),
        },
      });
    } catch (stripeErr) {
      logger.error({ err: stripeErr, participationId, orderId }, 'Stripe charge failed for draw billing');
      await db.execute({
        sql: `UPDATE orders SET status = 'payment_failed' WHERE id = ?`,
        args: [orderId],
      });
      return res.status(200).json({
        success: false,
        message: 'Error al realizar el cobro. El pedido se ha creado pero el pago ha fallado.',
        orderId,
      });
    }

    // 6. Update order to paid
    const itemTable = data.product_type === 'art' ? 'art_order_items' : 'other_order_items';
    if (chargeResult && chargeResult.success) {
      await db.execute({
        sql: `UPDATE orders SET status = 'paid', stripe_payment_intent_id = ? WHERE id = ?`,
        args: [chargeResult.paymentIntentId || null, orderId],
      });
      await db.execute({
        sql: `UPDATE ${itemTable} SET status = 'paid' WHERE order_id = ?`,
        args: [orderId],
      });
    } else if (chargeResult && chargeResult.requiresAction) {
      await db.execute({
        sql: `UPDATE orders SET status = 'requires_action', stripe_payment_intent_id = ? WHERE id = ?`,
        args: [chargeResult.paymentIntentId || null, orderId],
      });
      return res.status(200).json({
        success: true,
        message: 'El pago requiere autenticación adicional (SCA).',
        orderId,
        requiresAction: true,
      });
    }

    logger.info({ orderId, participationId, drawId: id, amount: totalPrice }, 'Draw participation billed successfully');

    // 7. Send purchase confirmation email (non-blocking)
    try {
      const { sendPurchaseConfirmation } = require('../services/emailService');

      const items = [{
        product_type: data.product_type,
        art_id: data.product_type === 'art' ? data.product_id : undefined,
        other_id: data.product_type === 'other' ? data.product_id : undefined,
        name: data.product_name,
        basename: data.basename,
        type: data.art_type || null,
        seller_id: data.seller_id,
        price_at_purchase: data.price,
        shipping_cost: parsedShippingCost,
        shipping_method_name: parsedShippingCost > 0 ? 'Envío sorteo' : null,
      }];

      let sellersInfo = [];
      if (data.seller_id) {
        const sellerResult = await db.execute({
          sql: 'SELECT id, email, full_name FROM users WHERE id = ?',
          args: [data.seller_id],
        });
        if (sellerResult.rows.length > 0) {
          const s = sellerResult.rows[0];
          sellersInfo = [{ id: s.id, email: s.email, name: s.full_name }];
        }
      }

      await sendPurchaseConfirmation({
        orderId,
        orderToken: token,
        items,
        totalPrice,
        buyerEmail: data.email,
        sellers: sellersInfo,
      });
    } catch (emailErr) {
      logger.error({ err: emailErr, orderId }, 'Failed to send draw billing confirmation email');
    }

    res.status(201).json({
      success: true,
      message: 'Pedido creado y cobro realizado correctamente',
      orderId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDraw,
  listDraws,
  getDraw,
  updateDraw,
  deleteDraw,
  startDraw,
  cancelDraw,
  finishDraw,
  getParticipations,
  billParticipation,
};
