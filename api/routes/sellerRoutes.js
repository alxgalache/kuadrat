const express = require('express');
const router = express.Router();
const { authenticate, requireSeller } = require('../middleware/authorization');
const { db } = require('../config/database');
const { createBatch } = require('../utils/transaction');
const logger = require('../config/logger');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { sendWithdrawalNotificationEmail } = require('../services/emailService');
const { validate } = require('../middleware/validate');
const { createWithdrawalSchema } = require('../validators/withdrawalSchemas');

// Apply authentication and seller authorization to all routes
router.use(authenticate, requireSeller);

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
 * Get seller's available withdrawal balance, commission rate, and saved payment details
 */
router.get('/wallet', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await db.execute({
      sql: 'SELECT available_withdrawal, withdrawal_recipient, withdrawal_iban FROM users WHERE id = ?',
      args: [userId],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    sendSuccess(res, {
      balance: Number(result.rows[0].available_withdrawal) || 0,
      commissionRate: config.payment.dealerCommission,
      recipientName: result.rows[0].withdrawal_recipient || '',
      iban: result.rows[0].withdrawal_iban || '',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/seller/withdrawals
 * Create a withdrawal request (full balance)
 */
router.post('/withdrawals', validate(createWithdrawalSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { iban, recipientName, saveDetails } = req.body;

    // Read current balance
    const userResult = await db.execute({
      sql: 'SELECT available_withdrawal, full_name, email FROM users WHERE id = ?',
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const user = userResult.rows[0];
    const balance = Number(user.available_withdrawal) || 0;

    if (balance <= 0) {
      throw new ApiError(400, 'No tienes saldo disponible para retirar', 'Saldo insuficiente');
    }

    // Atomically create withdrawal record and set balance to 0
    const batch = createBatch();
    batch.add(
      'INSERT INTO withdrawals (user_id, amount, iban, status) VALUES (?, ?, ?, ?)',
      [userId, balance, iban.trim(), 'pending']
    );

    if (saveDetails) {
      batch.add(
        'UPDATE users SET available_withdrawal = 0, withdrawal_recipient = ?, withdrawal_iban = ? WHERE id = ? AND available_withdrawal = ?',
        [recipientName?.trim() || null, iban.trim(), userId, balance]
      );
    } else {
      batch.add(
        'UPDATE users SET available_withdrawal = 0, withdrawal_recipient = NULL, withdrawal_iban = NULL WHERE id = ? AND available_withdrawal = ?',
        [userId, balance]
      );
    }
    const results = await batch.execute();

    // Verify the balance update affected a row (concurrent withdrawal protection)
    if (results[1].rowsAffected === 0) {
      throw new ApiError(409, 'El saldo ha cambiado. Por favor, inténtalo de nuevo.', 'Conflicto de saldo');
    }

    const withdrawalId = Number(results[0].lastInsertRowid);

    // Send admin notification email (non-blocking)
    try {
      await sendWithdrawalNotificationEmail({
        sellerName: user.full_name || user.email,
        sellerEmail: user.email,
        amount: balance,
        iban: iban.trim(),
      });
    } catch (emailError) {
      logger.error({ err: emailError }, 'Error sending withdrawal notification email');
    }

    logger.info({ userId, withdrawalId, amount: balance }, 'Withdrawal request created');

    sendCreated(res, {
      withdrawal: {
        id: withdrawalId,
        amount: balance,
        iban: iban.trim(),
        status: 'pending',
      },
    }, 'Solicitud de retirada creada correctamente');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
