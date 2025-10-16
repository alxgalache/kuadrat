const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { authenticate } = require('../middleware/authorization')
const adminAuth = require('../middleware/adminAuth')
const { db } = require('../config/database')

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

/**
 * GET /api/admin/authors
 * Get all authors (users with role='seller')
 */
router.get('/authors', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name, bio, location, email_contact, profile_img, visible, created_at
            FROM users
            WHERE role = 'seller'
            ORDER BY created_at DESC`,
      args: []
    })

    res.json({ authors: result.rows })
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
      sql: `SELECT id, email, full_name, bio, location, email_contact, profile_img, visible, created_at
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

    res.json({ author: result.rows[0] })
  } catch (error) {
    console.error('Error fetching author:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo cargar el autor'
    })
  }
})

/**
 * PUT /api/admin/authors/:id
 * Update author information
 */
router.put('/authors/:id', async (req, res) => {
  try {
    const { full_name, bio, location, email, email_contact, visible } = req.body
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
            SET full_name = ?, bio = ?, location = ?, email = ?, email_contact = ?, visible = ?
            WHERE id = ?`,
      args: [full_name, bio, location, email, email_contact, visible ? 1 : 0, authorId]
    })

    // Fetch updated author
    const updatedResult = await db.execute({
      sql: `SELECT id, email, full_name, bio, location, email_contact, profile_img, visible, created_at
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
    const result = await db.execute({
      sql: `SELECT id, name, price, type, basename, status, visible, is_sold, created_at, seller_id
            FROM products
            WHERE seller_id = ?
            ORDER BY created_at DESC`,
      args: [req.params.id]
    })

    res.json({ products: result.rows })
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
    const { name, description, price, type, visible, is_sold, status } = req.body

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
    await db.execute({
      sql: `UPDATE products
            SET name = ?, description = ?, price = ?, type = ?, basename = ?, visible = ?, is_sold = ?, status = ?
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

module.exports = router
