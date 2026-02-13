const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { authenticate } = require('../middleware/authorization')
const adminAuth = require('../middleware/adminAuth')
const { db } = require('../config/database')
const { sendPasswordSetupEmail } = require('../services/emailService')
const auctionAdminController = require('../controllers/auctionAdminController')
const eventAdminController = require('../controllers/eventAdminController')

// Configure multer for author avatar uploads
const authorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/authors')
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, 'author-' + uniqueSuffix + ext)
  }
})

const authorUpload = multer({
  storage: authorStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG and WEBP are allowed'))
    }
  }
})

// Configure multer for product image uploads
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/products')
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

// Apply authenticate and adminAuth middleware to all admin routes
router.use(authenticate, adminAuth)

// ===== AUTHOR ROUTES =====

// Token expiration time: 48 hours in milliseconds
const TOKEN_EXPIRATION_MS = 48 * 60 * 60 * 1000

/**
 * Generate a cryptographically secure token
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * POST /api/admin/authors
 * Create a new author (seller user)
 * Password is not set here - a setup email is sent to the user
 */
router.post('/authors', async (req, res) => {
  try {
    const {
      email, full_name, slug, bio, location, email_contact, visible,
      pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions
    } = req.body

    // Validate required fields
    if (!email || !full_name) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'El email y nombre completo son obligatorios'
      })
    }

    // Check if email already exists
    const checkEmail = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    })

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'Este email ya está registrado'
      })
    }

    // Check if slug already exists (if provided)
    if (slug) {
      const checkSlug = await db.execute({
        sql: 'SELECT id FROM users WHERE slug = ?',
        args: [slug]
      })

      if (checkSlug.rows.length > 0) {
        return res.status(400).json({
          title: 'Error de validación',
          message: 'Este slug ya está en uso'
        })
      }
    }

    // Generate secure token for password setup
    const setupToken = generateSecureToken()
    const tokenExpires = new Date(Date.now() + TOKEN_EXPIRATION_MS).toISOString()

    // Create user with role 'seller' and no password (will be set via token)
    // password_hash is set to empty string temporarily - user must set password via token
    const result = await db.execute({
      sql: `INSERT INTO users (email, password_hash, full_name, slug, bio, location, email_contact, role, visible,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_setup_token, password_setup_token_expires)
            VALUES (?, '', ?, ?, ?, ?, ?, 'seller', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        email,
        full_name,
        slug || null,
        bio || '',
        location || '',
        email_contact || '',
        visible ? 1 : 0,
        pickup_address || '',
        pickup_city || '',
        pickup_postal_code || '',
        pickup_country || '',
        pickup_instructions || '',
        setupToken,
        tokenExpires
      ]
    })

    // Send password setup email
    const emailResult = await sendPasswordSetupEmail({
      email,
      fullName: full_name,
      token: setupToken,
      expiresIn: '48 horas'
    })

    if (!emailResult.success) {
      console.error('Failed to send password setup email to:', email)
    }

    // Fetch created user
    const newUser = await db.execute({
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_setup_token_expires
            FROM users
            WHERE id = ?`,
      args: [result.lastInsertRowid]
    })

    res.status(201).json({
      title: 'Creado',
      message: 'Autor creado correctamente. Se ha enviado un email para configurar la contraseña.',
      author: newUser.rows[0],
      emailSent: emailResult.success
    })
  } catch (error) {
    console.error('Error creating author:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo crear el autor'
    })
  }
})

/**
 * GET /api/admin/authors
 * Get all authors (users with role='seller')
 */
router.get('/authors', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_hash, password_setup_token_expires
            FROM users
            WHERE role = 'seller'
            ORDER BY created_at DESC`,
      args: []
    })

    // Map results to include activation status without exposing password_hash
    const authors = result.rows.map(author => {
      const { password_hash, ...authorData } = author
      return {
        ...authorData,
        // User is activated if they have a password set (non-empty password_hash)
        is_activated: password_hash && password_hash.length > 0
      }
    })

    res.json({ authors })
  } catch (error) {
    console.error('Error fetching authors:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron cargar los autores'
    })
  }
})

/**
 * GET /api/admin/authors/:id
 * Get author details by ID
 */
router.get('/authors/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_hash, password_setup_token_expires
            FROM users
            WHERE id = ? AND role = 'seller'`,
      args: [req.params.id]
    })

    if (result.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    const { password_hash, ...authorData } = result.rows[0]
    res.json({
      author: {
        ...authorData,
        is_activated: password_hash && password_hash.length > 0
      }
    })
  } catch (error) {
    console.error('Error fetching author:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo cargar el autor'
    })
  }
})

/**
 * POST /api/admin/authors/:id/resend-invitation
 * Resend the password setup email to an author
 */
router.post('/authors/:id/resend-invitation', async (req, res) => {
  try {
    const authorId = req.params.id

    // Fetch author
    const result = await db.execute({
      sql: `SELECT id, email, full_name, password_hash
            FROM users
            WHERE id = ? AND role = 'seller'`,
      args: [authorId]
    })

    if (result.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    const author = result.rows[0]

    // Check if author already has a password set
    if (author.password_hash && author.password_hash.length > 0) {
      return res.status(400).json({
        title: 'Error',
        message: 'Este autor ya ha configurado su contraseña'
      })
    }

    // Generate new token and update expiration
    const newToken = generateSecureToken()
    const newExpires = new Date(Date.now() + TOKEN_EXPIRATION_MS).toISOString()

    await db.execute({
      sql: `UPDATE users
            SET password_setup_token = ?, password_setup_token_expires = ?
            WHERE id = ?`,
      args: [newToken, newExpires, authorId]
    })

    // Send password setup email
    const emailResult = await sendPasswordSetupEmail({
      email: author.email,
      fullName: author.full_name,
      token: newToken,
      expiresIn: '48 horas'
    })

    if (!emailResult.success) {
      return res.status(500).json({
        title: 'Error',
        message: 'No se pudo enviar el email de invitación'
      })
    }

    res.json({
      title: 'Enviado',
      message: 'Se ha reenviado el email de invitación',
      emailSent: true
    })
  } catch (error) {
    console.error('Error resending invitation:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo reenviar la invitación'
    })
  }
})

/**
 * PUT /api/admin/authors/:id
 * Update author information
 */
router.put('/authors/:id', async (req, res) => {
  try {
    const {
      full_name, bio, location, email, email_contact, visible,
      pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions
    } = req.body
    const authorId = req.params.id

    // Verify author exists and is a seller
    const checkResult = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ? AND role = ?',
      args: [authorId, 'seller']
    })

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    // Update author
    await db.execute({
      sql: `UPDATE users
            SET full_name = ?, bio = ?, location = ?, email = ?, email_contact = ?, visible = ?,
            pickup_address = ?, pickup_city = ?, pickup_postal_code = ?, pickup_country = ?, pickup_instructions = ?
            WHERE id = ?`,
      args: [
        full_name, bio, location, email, email_contact, visible ? 1 : 0,
        pickup_address || '', pickup_city || '', pickup_postal_code || '', pickup_country || '', pickup_instructions || '',
        authorId
      ]
    })

    // Fetch updated author
    const updatedResult = await db.execute({
      sql: `SELECT id, email, full_name, bio, location, email_contact, profile_img, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions
            FROM users
            WHERE id = ?`,
      args: [authorId]
    })

    res.json({
      title: 'Actualizado',
      message: 'Autor actualizado correctamente',
      author: updatedResult.rows[0]
    })
  } catch (error) {
    console.error('Error updating author:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo actualizar el autor'
    })
  }
})

/**
 * POST /api/admin/authors/:id/upload-avatar
 * Upload author avatar
 */
router.post('/authors/:id/upload-avatar', authorUpload.single('avatar'), async (req, res) => {
  try {
    const authorId = req.params.id

    if (!req.file) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'No se proporcionó ningún archivo'
      })
    }

    // Verify author exists
    const result = await db.execute({
      sql: 'SELECT id, profile_img FROM users WHERE id = ? AND role = ?',
      args: [authorId, 'seller']
    })

    if (result.rows.length === 0) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path)
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    const author = result.rows[0]

    // Delete old avatar if exists
    if (author.profile_img) {
      const oldImagePath = path.join(__dirname, '../uploads/authors', author.profile_img)
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath)
      }
    }

    // Update database with new avatar filename
    await db.execute({
      sql: 'UPDATE users SET profile_img = ? WHERE id = ?',
      args: [req.file.filename, authorId]
    })

    res.json({
      title: 'Avatar actualizado',
      message: 'Avatar del autor actualizado correctamente',
      filename: req.file.filename
    })
  } catch (error) {
    console.error('Error uploading avatar:', error)
    // Delete uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo subir el avatar'
    })
  }
})

/**
 * GET /api/admin/authors/:id/products
 * Get all products for an author
 */
router.get('/authors/:id/products', async (req, res) => {
  try {
    const sellerId = req.params.id;

    // Get art products
    const artResult = await db.execute({
      sql: `SELECT id, name, description, price, basename, slug, visible, is_sold, status, removed, created_at,
            'art' as product_type
            FROM art
            WHERE seller_id = ? AND removed = 0
            ORDER BY created_at DESC`,
      args: [sellerId]
    });

    // Get others products
    const othersResult = await db.execute({
      sql: `SELECT id, name, description, price, basename, slug, visible, is_sold, status, removed, created_at,
            'others' as product_type
            FROM others
            WHERE seller_id = ? AND removed = 0
            ORDER BY created_at DESC`,
      args: [sellerId]
    });

    // For each 'others' product, get its variations
    const othersWithVariations = await Promise.all(
      othersResult.rows.map(async (product) => {
        const varsResult = await db.execute({
          sql: 'SELECT id, key, value, stock FROM other_vars WHERE other_id = ?',
          args: [product.id]
        });
        const totalStock = varsResult.rows.reduce((sum, v) => sum + (v.stock || 0), 0);
        return { ...product, variations: varsResult.rows, total_stock: totalStock };
      })
    );

    // Combine art and others products
    const allProducts = [
      ...artResult.rows.map(art => ({ ...art, total_stock: art.is_sold ? 0 : 1 })),
      ...othersWithVariations
    ];
    allProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ products: allProducts });
  } catch (error) {
    console.error('Error fetching author products:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron cargar los productos del autor'
    })
  }
})

// ===== PRODUCT ROUTES =====

/**
 * GET /api/admin/products/for-auction
 * List products eligible for auction
 * NOTE: Must be registered BEFORE the parameterized :id route
 */
router.get('/products/for-auction', auctionAdminController.getProductsForAuction);

/**
 * GET /api/admin/products/:id
 * Get product details by ID
 */
router.get('/products/:id', async (req, res) => {
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
    console.error('Error fetching product:', error)
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
router.put('/products/:id', productUpload.single('image'), async (req, res) => {
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
        const oldImagePath = path.join(__dirname, '../uploads/products', product.basename)
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
    console.error('Error updating product:', error)
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
router.put('/products/:id/visibility', async (req, res) => {
  try {
    const productId = req.params.id;
    const { product_type, visible } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'Tipo de producto inválido'
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
 * DELETE /api/admin/products/:id
 * Soft delete a product (set removed = 1) - admin version (no ownership check)
 */
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const { product_type } = req.body;

    if (!product_type || (product_type !== 'art' && product_type !== 'others')) {
      return res.status(400).json({
        title: 'Error de validación',
        message: 'Tipo de producto inválido'
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
    console.error('Error deleting product:', error);
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo eliminar el producto'
    });
  }
});

/**
 * PUT /api/admin/others/:id/variations
 * Update variations for an 'others' product - admin version (no ownership check)
 */
router.put('/others/:id/variations', async (req, res) => {
  try {
    const productId = req.params.id;
    const { variations } = req.body;

    const productCheck = await db.execute({
      sql: 'SELECT id FROM others WHERE id = ? AND removed = 0',
      args: [productId]
    });

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Producto no encontrado'
      });
    }

    const existingVars = await db.execute({
      sql: 'SELECT id FROM other_vars WHERE other_id = ?',
      args: [productId]
    });
    const existingVarIds = existingVars.rows.map(v => v.id);
    const variationIds = [];

    for (const variation of variations) {
      if (variation.id && existingVarIds.includes(variation.id)) {
        await db.execute({
          sql: 'UPDATE other_vars SET key = ?, value = ?, stock = ? WHERE id = ?',
          args: [variation.key || '', variation.value || '', variation.stock || 0, variation.id]
        });
        variationIds.push(variation.id);
      } else {
        const result = await db.execute({
          sql: 'INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, ?, ?, ?)',
          args: [productId, variation.key || '', variation.value || '', variation.stock || 0]
        });
        variationIds.push(result.lastInsertRowid);
      }
    }

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

// ===== ORDER ROUTES =====

const {
  getAllOrdersAdmin,
  getOrderByIdAdmin,
} = require('../controllers/ordersController');

/**
 * GET /api/admin/orders
 * Get all orders
 */
router.get('/orders', getAllOrdersAdmin);

/**
 * GET /api/admin/orders/:id
 * Get order details by ID
 */
router.get('/orders/:id', getOrderByIdAdmin);

// ===== SHIPPING ROUTES =====

const {
  getAllShippingMethods,
  getShippingMethodById,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  getShippingZones,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
} = require('../controllers/shippingController');

/**
 * GET /api/admin/shipping/methods
 * Get all shipping methods
 */
router.get('/shipping/methods', getAllShippingMethods);

/**
 * GET /api/admin/shipping/methods/:id
 * Get shipping method by ID
 */
router.get('/shipping/methods/:id', getShippingMethodById);

/**
 * POST /api/admin/shipping/methods
 * Create a new shipping method
 */
router.post('/shipping/methods', createShippingMethod);

/**
 * PUT /api/admin/shipping/methods/:id
 * Update a shipping method
 */
router.put('/shipping/methods/:id', updateShippingMethod);

/**
 * DELETE /api/admin/shipping/methods/:id
 * Delete a shipping method
 */
router.delete('/shipping/methods/:id', deleteShippingMethod);

/**
 * GET /api/admin/shipping/methods/:methodId/zones
 * Get all zones for a shipping method
 */
router.get('/shipping/methods/:methodId/zones', getShippingZones);

/**
 * POST /api/admin/shipping/methods/:methodId/zones
 * Create a new zone for a shipping method
 */
router.post('/shipping/methods/:methodId/zones', createShippingZone);

/**
 * PUT /api/admin/shipping/zones/:zoneId
 * Update a shipping zone
 */
router.put('/shipping/zones/:zoneId', updateShippingZone);

/**
 * DELETE /api/admin/shipping/zones/:zoneId
 * Delete a shipping zone
 */
router.delete('/shipping/zones/:zoneId', deleteShippingZone);

// ===== AUCTION ROUTES =====

/**
 * POST /api/admin/auctions
 * Create a new auction
 */
router.post('/auctions', auctionAdminController.createAuction);

/**
 * GET /api/admin/auctions
 * List all auctions
 */
router.get('/auctions', auctionAdminController.listAuctions);

/**
 * GET /api/admin/auctions/:id
 * Get auction details
 */
router.get('/auctions/:id', auctionAdminController.getAuction);

/**
 * PUT /api/admin/auctions/:id
 * Update auction
 */
router.put('/auctions/:id', auctionAdminController.updateAuction);

/**
 * DELETE /api/admin/auctions/:id
 * Delete auction
 */
router.delete('/auctions/:id', auctionAdminController.deleteAuction);

/**
 * POST /api/admin/auctions/:id/start
 * Start auction
 */
router.post('/auctions/:id/start', auctionAdminController.startAuction);

/**
 * POST /api/admin/auctions/:id/cancel
 * Cancel auction
 */
router.post('/auctions/:id/cancel', auctionAdminController.cancelAuction);

/**
 * GET /api/admin/postal-codes/search
 * Search postal codes by postal_code or city (async multi-select)
 * NOTE: Must be registered BEFORE the base /postal-codes route
 */
router.get('/postal-codes/search', auctionAdminController.searchPostalCodes);

/**
 * GET /api/admin/postal-codes/by-ids
 * Get postal codes by IDs (for loading pre-selected values)
 */
router.get('/postal-codes/by-ids', auctionAdminController.getPostalCodesByIds);

/**
 * GET /api/admin/postal-codes
 * List all postal codes
 */
router.get('/postal-codes', auctionAdminController.listPostalCodes);

/**
 * POST /api/admin/postal-codes
 * Create postal code
 */
router.post('/postal-codes', auctionAdminController.createPostalCode);

// ===== EVENT ROUTES =====

/**
 * POST /api/admin/events
 * Create a new event
 */
router.post('/events', eventAdminController.createEvent);

/**
 * GET /api/admin/events
 * List all events
 */
router.get('/events', eventAdminController.listEvents);

/**
 * GET /api/admin/events/:id
 * Get event details
 */
router.get('/events/:id', eventAdminController.getEvent);

/**
 * PUT /api/admin/events/:id
 * Update event
 */
router.put('/events/:id', eventAdminController.updateEvent);

/**
 * DELETE /api/admin/events/:id
 * Delete event
 */
router.delete('/events/:id', eventAdminController.deleteEvent);

/**
 * POST /api/admin/events/:id/start
 * Start event (creates LiveKit room)
 */
router.post('/events/:id/start', eventAdminController.startEvent);

/**
 * POST /api/admin/events/:id/end
 * End event (cleans up LiveKit room)
 */
router.post('/events/:id/end', eventAdminController.endEvent);

/**
 * GET /api/admin/events/:id/attendees
 * List attendees
 */
router.get('/events/:id/attendees', eventAdminController.getAttendees);

/**
 * GET /api/admin/events/:id/participants
 * List LiveKit room participants
 */
router.get('/events/:id/participants', eventAdminController.listParticipants);

/**
 * POST /api/admin/events/:id/participants/:identity/promote
 * Promote viewer to speaker
 */
router.post('/events/:id/participants/:identity/promote', eventAdminController.promoteParticipant);

/**
 * POST /api/admin/events/:id/participants/:identity/demote
 * Demote speaker to viewer
 */
router.post('/events/:id/participants/:identity/demote', eventAdminController.demoteParticipant);

/**
 * POST /api/admin/events/:id/participants/:identity/mute
 * Mute/unmute a participant's track
 */
router.post('/events/:id/participants/:identity/mute', eventAdminController.muteParticipant);

module.exports = router
