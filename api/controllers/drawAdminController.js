const drawService = require('../services/drawService');
const marketingEmailService = require('../services/marketingEmailService');
const { db } = require('../config/database');
const logger = require('../config/logger');
const { artVatRegimeForRate } = require('../utils/vatRegime');
const { artCommissionAmount } = require('../utils/artCommission');

// Draws never pre-reserve edition copies — consumption happens when billing
// each winner. This check only prevents creating/updating a draw whose units
// could never be fully billed at the time of the operation.
// Returns an es-ES error message, or null when the units fit.
const validateArtUnitsAvailability = async ({ productId, productType, units }) => {
  if (productType !== 'art') return null;
  const res = await db.execute({
    sql: 'SELECT edition_size, editions_sold FROM art WHERE id = ?',
    args: [productId],
  });
  if (res.rows.length === 0) return 'El producto del sorteo no existe';
  const available = Math.max((res.rows[0].edition_size || 1) - (res.rows[0].editions_sold || 0), 0);
  if (units > available) {
    return available === 0
      ? 'La edición de esta obra está agotada: no quedan ejemplares para sortear'
      : `Solo ${available === 1 ? 'queda' : 'quedan'} ${available} ejemplar${available === 1 ? '' : 'es'} disponible${available === 1 ? '' : 's'} de la edición para sortear`;
  }
  return null;
};

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

    const unitsVal = units ? parseInt(units, 10) : 1;
    if (!Number.isInteger(unitsVal) || unitsVal < 1) {
      return res.status(400).json({
        success: false,
        title: 'Unidades inválidas',
        message: 'El número de unidades debe ser un entero mayor o igual que 1',
      });
    }

    const unitsError = await validateArtUnitsAvailability({
      productId: parseInt(product_id, 10),
      productType: product_type,
      units: unitsVal,
    });
    if (unitsError) {
      return res.status(400).json({
        success: false,
        title: 'Unidades no disponibles',
        message: unitsError,
      });
    }

    const draw = await drawService.createDraw({
      name,
      description,
      product_id: parseInt(product_id, 10),
      product_type,
      price: parseFloat(price),
      units: unitsVal,
      min_participants: min_participants ? parseInt(min_participants, 10) : 30,
      max_participations: parseInt(max_participations, 10),
      start_datetime,
      end_datetime,
      status,
    });

    const fullDraw = await drawService.getDrawById(draw.id);

    // Marketing announcement (non-blocking; never throws; guarded send-once)
    marketingEmailService.announceDrawIfEligible(draw.id);

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

    // Validate units against edition availability with the effective values
    // (payload overrides falling back to the stored draw).
    if (fields.units !== undefined || fields.product_id !== undefined || fields.product_type !== undefined) {
      const existing = await drawService.getDrawById(id);
      if (existing) {
        const effectiveUnits = fields.units !== undefined ? fields.units : existing.units || 1;
        if (!Number.isInteger(effectiveUnits) || effectiveUnits < 1) {
          return res.status(400).json({
            success: false,
            title: 'Unidades inválidas',
            message: 'El número de unidades debe ser un entero mayor o igual que 1',
          });
        }
        const unitsError = await validateArtUnitsAvailability({
          productId: fields.product_id !== undefined ? fields.product_id : existing.product_id,
          productType: fields.product_type !== undefined ? fields.product_type : existing.product_type,
          units: effectiveUnits,
        });
        if (unitsError) {
          return res.status(400).json({
            success: false,
            title: 'Unidades no disponibles',
            message: unitsError,
          });
        }
      }
    }

    const draw = await drawService.updateDraw(id, fields);

    if (!draw) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Sorteo no encontrado o no se puede modificar en su estado actual',
      });
    }

    const fullDraw = await drawService.getDrawById(id);

    // Marketing announcement on transition into 'scheduled' (guarded send-once)
    marketingEmailService.announceDrawIfEligible(id);

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
  // Edition copy consumed for this billing (released if the charge fails).
  let consumedArtId = null;
  const releaseEditionCopy = async () => {
    if (consumedArtId == null) return;
    const artId = consumedArtId;
    consumedArtId = null;
    await db.execute({
      sql: 'UPDATE art SET editions_sold = MAX(editions_sold - 1, 0), is_sold = 0 WHERE id = ? AND editions_sold > 0',
      args: [artId],
    });
    logger.warn({ action: 'inventory_released', productId: artId, type: 'art', reason: 'draw_billing_failed' }, 'Draw billing edition copy released');
  };

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

    // 2b. Enforce the draw units cap. Billed = orders created for this draw
    // whose charge did not fail (failed billings release their copy, so a
    // substitute winner can still be billed).
    const unitsRes = await db.execute({ sql: 'SELECT units FROM draws WHERE id = ?', args: [id] });
    const drawUnits = unitsRes.rows[0] ? Number(unitsRes.rows[0].units) || 1 : 1;
    const billedRes = await db.execute({
      sql: `SELECT COUNT(*) AS billed
            FROM orders o
            JOIN draw_participations dp ON o.notes = 'draw_participation:' || dp.id
            WHERE dp.draw_id = ? AND o.status != 'payment_failed'`,
      args: [id],
    });
    if (Number(billedRes.rows[0]?.billed || 0) >= drawUnits) {
      return res.status(409).json({
        success: false,
        message: `Ya se han facturado las ${drawUnits} unidades del sorteo`,
      });
    }

    // 2c. For art, atomically consume one edition copy BEFORE charging, so two
    // concurrent billings can never oversell the edition.
    if (data.product_type === 'art') {
      const consume = await db.execute({
        sql: `UPDATE art
              SET editions_sold = editions_sold + 1,
                  is_sold = CASE WHEN editions_sold + 1 >= edition_size THEN 1 ELSE 0 END
              WHERE id = ? AND editions_sold < edition_size`,
        args: [data.product_id],
      });
      if (consume.rowsAffected === 0) {
        return res.status(409).json({
          success: false,
          message: 'La edición de esta obra está agotada: no quedan ejemplares disponibles',
        });
      }
      consumedArtId = data.product_id;
    }

    // 3. Create order
    const token = require('crypto').randomUUID();
    const drawPrice = Number(data.price) || 0;
    const parsedShippingCost = Number(shippingCost) || 0;
    // Freeze the fiscal regime derived from the seller's art VAT rate. The
    // same regime value drives the art commission split (flat for REBU, margin
    // grossed up by its 21% VAT for standard_vat) and the row snapshot below.
    // Other-product draws keep the flat split (always standard, no regime column).
    const vatRegime = data.product_type === 'art'
      ? artVatRegimeForRate(data.tax_vat_art)
      : 'standard_vat';
    const commissionAmount = data.product_type === 'art'
      ? artCommissionAmount({
          price: drawPrice,
          commissionRate: Number(data.dealer_commission_art) || 0,
          vatRegime,
        })
      : Math.round(drawPrice * ((Number(data.dealer_commission_other) || 0) / 100) * 100) / 100;
    const totalPrice = drawPrice + parsedShippingCost;

    const orderResult = await db.execute({
      sql: `INSERT INTO orders (
              full_name, dni, email, total_price, status, token,
              delivery_address_line_1, delivery_address_line_2,
              delivery_postal_code, delivery_city, delivery_province, delivery_country,
              delivery_lat, delivery_lng,
              invoicing_address_line_1, invoicing_address_line_2,
              invoicing_postal_code, invoicing_city, invoicing_province, invoicing_country,
              payment_provider, stripe_customer_id, stripe_payment_method_id,
              notes
            ) VALUES (?, ?, ?, ?, 'pending', ?,
              ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              'stripe', ?, ?,
              ?)`,
      args: [
        `${data.first_name} ${data.last_name}`,
        data.dni || null,
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
                order_id, art_id, price_at_purchase, shipping_cost, commission_amount, status, vat_regime
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        args: [orderId, data.product_id, drawPrice, parsedShippingCost, commissionAmount, vatRegime],
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
      await releaseEditionCopy();
      return res.status(200).json({
        success: false,
        message: 'Error al realizar el cobro. El pedido se ha creado pero el pago ha fallado.',
        orderId,
      });
    }

    // The charge went through (paid, SCA pending, or unknown-but-not-failed):
    // the consumed copy is now definitive and must never be released by the
    // outer catch (e.g. if the confirmation email or a later update throws).
    consumedArtId = null;

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
    // Unexpected failure after the edition copy was consumed (e.g. order
    // insert error) — release it so no phantom copy stays consumed.
    try {
      await releaseEditionCopy();
    } catch (releaseErr) {
      logger.error({ err: releaseErr }, 'Failed to release edition copy after draw billing error');
    }
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
