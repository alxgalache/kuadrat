const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authenticate, requireSeller } = require('../middleware/authorization');
const { db } = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const { sendWithdrawalNotificationEmail } = require('../services/emailService');
const { validate } = require('../middleware/validate');
const { changePasswordSchema } = require('../validators/sellerSchemas');
const { validatePassword } = require('../controllers/authController');
const { getSellerOrders, downloadOrderLabel, schedulePickup, scheduleBulkPickup } = require('../controllers/sellerOrdersController');
const { pickupSchema, bulkPickupSchema } = require('../validators/pickupSchemas');
const stripeConnectCtrl = require('../controllers/stripeConnectController');

// Apply authentication and seller authorization to all routes
router.use(authenticate, requireSeller);

/**
 * GET /api/seller/profile
 * Get the authenticated seller's profile data
 */
router.get('/profile', async (req, res, next) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, full_name, email, email_contact, location, bio, profile_img, visible,
                    stripe_connect_status
            FROM users WHERE id = ?`,
      args: [req.user.id],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    sendSuccess(res, { profile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/seller/profile/password
 * Change the authenticated seller's password
 */
router.put('/profile/password', validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      throw new ApiError(400, 'Las contraseñas no coinciden', 'Error de validación');
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      throw new ApiError(400, validation.errors.join('. '), 'Contraseña insegura');
    }

    const result = await db.execute({
      sql: 'SELECT password_hash FROM users WHERE id = ?',
      args: [req.user.id],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isMatch) {
      throw new ApiError(401, 'La contraseña actual es incorrecta', 'Contraseña incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.execute({
      sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
      args: [hashedPassword, req.user.id],
    });

    logger.info({ userId: req.user.id }, 'Seller password changed');

    sendSuccess(res, {}, 200, 'Contraseña actualizada correctamente');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/seller/products
 * Get all products (art and others) for the authenticated seller
 */
router.get('/products', async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Get art products
    const artResult = await db.execute({
      sql: `SELECT
              id,
              name,
              description,
              price,
              basename,
              slug,
              visible,
              is_sold,
              status,
              removed,
              created_at,
              'art' as product_type
            FROM art
            WHERE seller_id = ? AND removed = 0
            ORDER BY created_at DESC`,
      args: [sellerId]
    });

    // Get others products with their variations
    const othersResult = await db.execute({
      sql: `SELECT
              o.id,
              o.name,
              o.description,
              o.price,
              o.basename,
              o.slug,
              o.visible,
              o.is_sold,
              o.status,
              o.removed,
              o.created_at,
              'others' as product_type
            FROM others o
            WHERE o.seller_id = ? AND o.removed = 0
            ORDER BY o.created_at DESC`,
      args: [sellerId]
    });

    // For each 'others' product, get its variations
    const othersWithVariations = await Promise.all(
      othersResult.rows.map(async (product) => {
        const varsResult = await db.execute({
          sql: `SELECT id, key, value, stock FROM other_vars WHERE other_id = ?`,
          args: [product.id]
        });

        // Calculate total stock
        const totalStock = varsResult.rows.reduce((sum, v) => sum + (v.stock || 0), 0);

        return {
          ...product,
          variations: varsResult.rows,
          total_stock: totalStock
        };
      })
    );

    // Combine art and others products
    const allProducts = [
      ...artResult.rows.map(art => ({ ...art, total_stock: art.is_sold ? 0 : 1 })),
      ...othersWithVariations
    ];

    // Sort by created_at descending
    allProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ products: allProducts });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching seller products');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron cargar los productos'
    });
  }
});

/**
 * PUT /api/seller/others/:id/variations
 * Update variations for an 'others' product
 */
router.put('/others/:id/variations', async (req, res) => {
  try {
    const productId = req.params.id;
    const sellerId = req.user.id;
    const { variations } = req.body; // Array of { id?, key, value, stock }

    // Verify the product belongs to the seller
    const productCheck = await db.execute({
      sql: 'SELECT id FROM others WHERE id = ? AND seller_id = ? AND removed = 0',
      args: [productId, sellerId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    // Get existing variations
    const existingVars = await db.execute({
      sql: 'SELECT id FROM other_vars WHERE other_id = ?',
      args: [productId]
    });
    const existingVarIds = existingVars.rows.map(v => v.id);

    // Process variations
    const variationIds = [];
    for (const variation of variations) {
      if (variation.id && existingVarIds.includes(variation.id)) {
        // Update existing variation
        await db.execute({
          sql: 'UPDATE other_vars SET key = ?, value = ?, stock = ? WHERE id = ?',
          args: [variation.key || '', variation.value || '', variation.stock || 0, variation.id]
        });
        variationIds.push(variation.id);
      } else {
        // Insert new variation
        const result = await db.execute({
          sql: 'INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, ?, ?, ?)',
          args: [productId, variation.key || '', variation.value || '', variation.stock || 0]
        });
        variationIds.push(result.lastInsertRowid);
      }
    }

    // Delete variations that were not included (removed by user)
    const varsToDelete = existingVarIds.filter(id => !variationIds.includes(id));
    for (const varId of varsToDelete) {
      await db.execute({
        sql: 'DELETE FROM other_vars WHERE id = ?',
        args: [varId]
      });
    }

    res.json({
      title: 'Actualizado',
      message: 'Variaciones actualizadas correctamente'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating variations');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron actualizar las variaciones'
    });
  }
});

/**
 * PUT /api/seller/products/:id/visibility
 * Toggle visibility of a product (art or others)
 */
router.put('/products/:id/visibility', async (req, res) => {
  try {
    const productId = req.params.id;
    const sellerId = req.user.id;
    const { product_type, visible } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'Tipo de producto inválido'
      });
    }

    const table = product_type === 'art' ? 'art' : 'others';

    // Verify ownership
    const productCheck = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ? AND seller_id = ? AND removed = 0`,
      args: [productId, sellerId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    // Update visibility
    await db.execute({
      sql: `UPDATE ${table} SET visible = ? WHERE id = ?`,
      args: [visible ? 1 : 0, productId]
    });

    res.json({
      title: visible ? 'Producto visible' : 'Producto oculto',
      message: visible
        ? 'El producto ahora es visible en la galería'
        : 'El producto está oculto de la galería'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error toggling product visibility');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo cambiar la visibilidad del producto'
    });
  }
});

/**
 * DELETE /api/seller/products/:id
 * Soft delete a product (set removed = 1)
 */
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const sellerId = req.user.id;
    const { product_type } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'Tipo de producto inválido'
      });
    }

    const table = product_type === 'art' ? 'art' : 'others';

    // Verify ownership
    const productCheck = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ? AND seller_id = ? AND removed = 0`,
      args: [productId, sellerId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    // Soft delete: set removed = 1 and visible = 0
    await db.execute({
      sql: `UPDATE ${table} SET removed = 1, visible = 0 WHERE id = ?`,
      args: [productId]
    });

    res.json({
      title: 'Producto eliminado',
      message: 'El producto ha sido eliminado y ya no es visible'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting product');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo eliminar el producto'
    });
  }
});

/**
 * GET /api/seller/wallet
 * Get the seller's available withdrawal balance split into the two VAT-regime
 * buckets introduced in Change #2: `art_rebu` (REBU 21% for art) and
 * `standard_vat` (21% for everything else). The legacy `balance` field is
 * preserved and equals the sum of both buckets, so older clients keep working.
 */
router.get('/wallet', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await db.execute({
      sql: `SELECT available_withdrawal_art_rebu,
                   available_withdrawal_standard_vat,
                   withdrawal_recipient,
                   withdrawal_iban
            FROM users
            WHERE id = ?`,
      args: [userId],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const row = result.rows[0];
    const balanceArtRebu = Number(row.available_withdrawal_art_rebu) || 0;
    const balanceStandardVat = Number(row.available_withdrawal_standard_vat) || 0;

    sendSuccess(res, {
      balance: balanceArtRebu + balanceStandardVat,
      balanceArtRebu,
      balanceStandardVat,
      commissionRateArt: config.payment.dealerCommissionArt,
      commissionRateOthers: config.payment.dealerCommissionOthers,
      recipientName: row.withdrawal_recipient || '',
      iban: row.withdrawal_iban || '',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/seller/paid-events
 *
 * Change #3: stripe-connect-events-wallet — list all paid events hosted by the
 * authenticated seller, with their credit state (upcoming / grace_period /
 * credited / excluded) so the seller can track when income will hit their
 * standard_vat bucket. Informational only — no actions here.
 */
router.get('/paid-events', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await db.execute({
      sql: `
        SELECT e.id, e.title, e.event_datetime, e.status,
               e.finished_at, e.host_credited_at, e.host_credit_excluded,
               COUNT(CASE WHEN ea.status IN ('paid', 'joined') THEN 1 END) AS paid_attendees,
               COALESCE(SUM(CASE WHEN ea.status IN ('paid', 'joined') THEN ea.amount_paid ELSE 0 END), 0) AS total_amount
        FROM events e
        LEFT JOIN event_attendees ea ON ea.event_id = e.id
        WHERE e.host_user_id = ?
          AND e.access_type = 'paid'
        GROUP BY e.id
        ORDER BY e.event_datetime DESC
        LIMIT 50
      `,
      args: [userId],
    });

    const events = result.rows.map((row) => {
      let state;
      if (row.host_credit_excluded) state = 'excluded';
      else if (row.host_credited_at) state = 'credited';
      else if (row.finished_at) state = 'grace_period';
      else state = 'upcoming';

      return {
        id: Number(row.id),
        title: row.title,
        status: row.status,
        event_datetime: row.event_datetime,
        finished_at: row.finished_at,
        host_credited_at: row.host_credited_at,
        host_credit_excluded: Boolean(row.host_credit_excluded),
        paid_attendees: Number(row.paid_attendees) || 0,
        total_amount: Number(row.total_amount) || 0,
        state,
      };
    });

    sendSuccess(res, { events });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/seller/withdrawals
 *
 * Change #2 — this endpoint is now a *nudge*, not a writer. The admin is the
 * only actor that can create `withdrawals` rows (via the payouts panel), so
 * here we just:
 *
 *   1. Read the seller's current wallet buckets (for context in the email).
 *   2. Send the admin an email with a link to `/admin/payouts/<sellerId>`.
 *   3. Return `{ ok: true }`.
 *
 * No row is inserted, no balance is zeroed. The seller may call this
 * repeatedly without side effects.
 */
router.post('/withdrawals', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const userResult = await db.execute({
      sql: `SELECT full_name, email,
                   available_withdrawal_art_rebu,
                   available_withdrawal_standard_vat
            FROM users WHERE id = ?`,
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const user = userResult.rows[0];
    const balanceArtRebu = Number(user.available_withdrawal_art_rebu) || 0;
    const balanceStandardVat = Number(user.available_withdrawal_standard_vat) || 0;
    const totalBalance = balanceArtRebu + balanceStandardVat;

    if (totalBalance <= 0) {
      throw new ApiError(400, 'No tienes saldo disponible para retirar', 'Saldo insuficiente');
    }

    // Send admin notification email (non-blocking).
    try {
      await sendWithdrawalNotificationEmail({
        sellerId: userId,
        sellerName: user.full_name || user.email,
        sellerEmail: user.email,
        balanceArtRebu,
        balanceStandardVat,
      });
    } catch (emailError) {
      logger.error({ err: emailError }, 'Error sending withdrawal notification email');
    }

    logger.info(
      { userId, balanceArtRebu, balanceStandardVat, totalBalance },
      'Seller withdrawal nudge sent to admin'
    );

    sendSuccess(res, { ok: true }, 200, 'Solicitud enviada');
  } catch (error) {
    next(error);
  }
});

// Seller orders (Sendcloud-managed shipments)
router.get('/orders', getSellerOrders);
router.get('/orders/:itemType/:itemId/label', downloadOrderLabel);
router.post('/orders/bulk-pickup', validate(bulkPickupSchema), scheduleBulkPickup);
router.post('/orders/:orderId/pickup', validate(pickupSchema), schedulePickup);

// Stripe Connect self-service (Change #1: stripe-connect-accounts)
// authenticate + requireSeller are already applied globally at line 20.
router.post('/stripe-connect/onboarding-link', stripeConnectCtrl.generateOnboardingLinkForSelf);
router.post('/stripe-connect/login-link', stripeConnectCtrl.generateLoginLinkForSelf);
router.get('/stripe-connect/status', stripeConnectCtrl.getStatusForSelf);

module.exports = router;
