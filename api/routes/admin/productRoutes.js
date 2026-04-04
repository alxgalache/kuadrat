const express = require('express')
const router = express.Router()
const { db } = require('../../config/database')
const logger = require('../../config/logger')
const auctionAdminController = require('../../controllers/auctionAdminController')

/**
 * GET /api/admin/products/for-auction
 * List products eligible for auction
 * NOTE: Must be registered BEFORE the parameterized :id route
 */
router.get('/for-auction', auctionAdminController.getProductsForAuction);

/**
 * GET /api/admin/products/:id
 * Get product details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.*, u.email as seller_email, u.full_name as seller_name
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            WHERE p.id = ?`,
      args: [req.params.id]
    })

    if (result.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      })
    }

    res.json({ product: result.rows[0] })
  } catch (error) {
    logger.error({ err: error }, 'Error fetching product')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo cargar el producto'
    })
  }
})

/**
 * GET /api/admin/products/:id/preview
 * Preview a product (art or others) as it would appear publicly, regardless of status/visibility
 */
router.get('/:id/preview', async (req, res) => {
  try {
    const productId = req.params.id;
    const { type } = req.query;

    if (!type || (type !== 'art' && type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'El parámetro "type" es obligatorio y debe ser "art" o "others"'
      });
    }

    const table = type === 'art' ? 'art' : 'others';
    const result = await db.execute({
      sql: `SELECT t.*, u.full_name as seller_full_name, u.slug as seller_slug
            FROM ${table} t
            LEFT JOIN users u ON t.seller_id = u.id
            WHERE t.id = ? AND t.removed = 0`,
      args: [productId]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    const product = result.rows[0];

    if (type === 'others') {
      const varsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ?',
        args: [productId]
      });
      product.variations = varsResult.rows;
    }

    res.json({ product });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching product preview');
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo cargar la previsualización del producto'
    });
  }
});

// Legacy PUT /api/admin/products/:id removed (products table is no longer used)

/**
 * PUT /api/admin/products/:id/visibility
 * Toggle visibility of a product (art or others) - admin version (no ownership check)
 */
router.put('/:id/visibility', async (req, res) => {
  try {
    const productId = req.params.id;
    const { product_type, visible } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validacion',
        message: 'Tipo de producto invalido'
      });
    }

    const table = product_type === 'art' ? 'art' : 'others';
    const productCheck = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ? AND removed = 0`,
      args: [productId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    await db.execute({
      sql: `UPDATE ${table} SET visible = ? WHERE id = ?`,
      args: [visible ? 1 : 0, productId]
    });

    res.json({
      title: visible ? 'Producto visible' : 'Producto oculto',
      message: visible
        ? 'El producto ahora es visible en la galeria'
        : 'El producto esta oculto de la galeria'
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
 * DELETE /api/admin/products/:id
 * Soft delete a product (set removed = 1) - admin version (no ownership check)
 */
router.delete('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const { product_type } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validacion',
        message: 'Tipo de producto invalido'
      });
    }

    const table = product_type === 'art' ? 'art' : 'others';
    const productCheck = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ? AND removed = 0`,
      args: [productId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

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

module.exports = router
