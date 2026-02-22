const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { db } = require('../../config/database')
const logger = require('../../config/logger')
const auctionAdminController = require('../../controllers/auctionAdminController')

// Configure multer for product image uploads
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/products')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, 'product-' + uniqueSuffix + ext)
  }
})

const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG and WEBP are allowed'))
    }
  }
})

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
 * PUT /api/admin/products/:id
 * Update product information
 */
router.put('/:id', productUpload.single('image'), async (req, res) => {
  try {
    const productId = req.params.id
    const { name, description, price, type, visible, is_sold, status, for_auction } = req.body

    // Verify product exists
    const checkResult = await db.execute({
      sql: 'SELECT id, basename FROM products WHERE id = ?',
      args: [productId]
    })

    if (checkResult.rows.length === 0) {
      if (req.file) {
        fs.unlinkSync(req.file.path)
      }
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      })
    }

    const product = checkResult.rows[0]

    // If new image was uploaded, delete old one
    let imageBasename = product.basename
    if (req.file) {
      if (product.basename) {
        const oldImagePath = path.join(__dirname, '../../uploads/products', product.basename)
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath)
        }
      }
      imageBasename = req.file.filename
    }

    // Update product
    const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0
    await db.execute({
      sql: `UPDATE products
            SET name = ?, description = ?, price = ?, type = ?, basename = ?, visible = ?, is_sold = ?, status = ?, for_auction = ?
            WHERE id = ?`,
      args: [
        name,
        description,
        parseFloat(price),
        type,
        imageBasename,
        visible ? 1 : 0,
        is_sold ? 1 : 0,
        status,
        forAuctionVal,
        productId
      ]
    })

    // Fetch updated product
    const updatedResult = await db.execute({
      sql: 'SELECT * FROM products WHERE id = ?',
      args: [productId]
    })

    res.json({
      title: 'Actualizado',
      message: 'Producto actualizado correctamente',
      product: updatedResult.rows[0]
    })
  } catch (error) {
    logger.error({ err: error }, 'Error updating product')
    if (req.file) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo actualizar el producto'
    })
  }
})

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
