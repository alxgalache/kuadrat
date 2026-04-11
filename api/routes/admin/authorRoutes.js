const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { db } = require('../../config/database')
const config = require('../../config/env')
const logger = require('../../config/logger')
const s3Service = require('../../services/s3Service')
const { sendPasswordSetupEmail } = require('../../services/emailService')
const { getSendcloudConfig, createSendcloudConfig, updateSendcloudConfig, getShippingMethods } = require('../../controllers/sendcloudConfigController')
const { createSendcloudConfigSchema, updateSendcloudConfigSchema } = require('../../validators/sendcloudConfigSchemas')
const { validate } = require('../../middleware/validate')

const AUTHORS_UPLOADS_DIR = path.join(__dirname, '../../uploads/authors')

// Configure multer for author avatar uploads (memory storage for S3 compatibility)
const authorUpload = multer({
  storage: multer.memoryStorage(),
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
router.post('/', async (req, res) => {
  try {
    const {
      email, full_name, slug, bio, location, email_contact, visible,
      pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions
    } = req.body

    // Validate required fields
    if (!email || !full_name) {
      return res.status(400).json({
        title: 'Error de validacion',
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
        title: 'Error de validacion',
        message: 'Este email ya esta registrado'
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
          title: 'Error de validacion',
          message: 'Este slug ya esta en uso'
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
      logger.error({ email }, 'Failed to send password setup email')
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
    logger.error({ err: error }, 'Error creating author')
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
router.get('/', async (req, res) => {
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
    logger.error({ err: error }, 'Error fetching authors')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron cargar los autores'
    })
  }
})

// ── Sendcloud: shipping methods (must be before /:id) ───────
router.get('/shipping-methods', getShippingMethods)

/**
 * GET /api/admin/authors/:id
 * Get author details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_hash, password_setup_token_expires,
            stripe_connect_account_id, stripe_connect_status, stripe_transfers_capability_active,
            stripe_connect_requirements_due, stripe_connect_last_synced_at,
            tax_status, tax_id, fiscal_full_name,
            fiscal_address_line1, fiscal_address_line2, fiscal_address_city,
            fiscal_address_postal_code, fiscal_address_province, fiscal_address_country,
            irpf_retention_rate
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
    logger.error({ err: error }, 'Error fetching author')
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
router.post('/:id/resend-invitation', async (req, res) => {
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
        message: 'No se pudo enviar el email de invitacion'
      })
    }

    res.json({
      title: 'Enviado',
      message: 'Se ha reenviado el email de invitacion',
      emailSent: true
    })
  } catch (error) {
    logger.error({ err: error }, 'Error resending invitation')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo reenviar la invitacion'
    })
  }
})

/**
 * PUT /api/admin/authors/:id
 * Update author information
 */
router.put('/:id', async (req, res) => {
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
    logger.error({ err: error }, 'Error updating author')
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
router.post('/:id/upload-avatar', authorUpload.single('avatar'), async (req, res) => {
  try {
    const authorId = req.params.id

    if (!req.file) {
      return res.status(400).json({
        title: 'Error de validacion',
        message: 'No se proporciono ningun archivo'
      })
    }

    // Verify author exists
    const result = await db.execute({
      sql: 'SELECT id, profile_img FROM users WHERE id = ? AND role = ?',
      args: [authorId, 'seller']
    })

    if (result.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    const author = result.rows[0]

    // Generate filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(req.file.originalname)
    const filename = 'author-' + uniqueSuffix + ext

    // Delete old avatar if exists
    if (author.profile_img) {
      if (config.useS3) {
        await s3Service.deleteFile(`authors/${author.profile_img}`)
      } else {
        const oldImagePath = path.join(AUTHORS_UPLOADS_DIR, author.profile_img)
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath)
        }
      }
    }

    // Upload new avatar
    if (config.useS3) {
      await s3Service.uploadFile(`authors/${filename}`, req.file.buffer, req.file.mimetype)
    } else {
      if (!fs.existsSync(AUTHORS_UPLOADS_DIR)) {
        fs.mkdirSync(AUTHORS_UPLOADS_DIR, { recursive: true })
      }
      await fs.promises.writeFile(path.join(AUTHORS_UPLOADS_DIR, filename), req.file.buffer)
    }

    // Update database with new avatar filename
    await db.execute({
      sql: 'UPDATE users SET profile_img = ? WHERE id = ?',
      args: [filename, authorId]
    })

    res.json({
      title: 'Avatar actualizado',
      message: 'Avatar del autor actualizado correctamente',
      filename: filename
    })
  } catch (error) {
    logger.error({ err: error }, 'Error uploading avatar')
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
router.get('/:id/products', async (req, res) => {
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
    logger.error({ err: error }, 'Error fetching author products')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron cargar los productos del autor'
    })
  }
})

// ── Sendcloud Configuration ─────────────────────────────────
router.get('/:id/sendcloud-config', getSendcloudConfig)
router.post('/:id/sendcloud-config', validate(createSendcloudConfigSchema), createSendcloudConfig)
router.put('/:id/sendcloud-config', validate(updateSendcloudConfigSchema), updateSendcloudConfig)

module.exports = router
