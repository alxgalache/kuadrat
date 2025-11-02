const express = require('express');
const router = express.Router();
const { authenticate, requireSeller } = require('../middleware/authorization');
const { db } = require('../config/database');

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
    console.error('Error fetching seller products:', error);
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
    console.error('Error updating variations:', error);
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
    console.error('Error toggling product visibility:', error);
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
    console.error('Error deleting product:', error);
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo eliminar el producto'
    });
  }
});

module.exports = router;
