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
const { sendPasswordSetupEmail, sendPasswordResetEmail } = require('../../services/emailService')
const {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
} = require('../../utils/passwordSecurity')
const { getSendcloudConfig, createSendcloudConfig, updateSendcloudConfig, getShippingMethods } = require('../../controllers/sendcloudConfigController')
const { createSendcloudConfigSchema, updateSendcloudConfigSchema } = require('../../validators/sendcloudConfigSchemas')
const { updateAuthorSchema } = require('../../validators/authorSchemas')
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
 * Issue an admin-initiated password reset link for an activated artist and
 * email it to them.
 *
 * Only the SHA-256 of the token is stored; the plaintext lives exclusively in
 * the message body. Writing it overwrites whatever was there, which is how the
 * "one live link per account" invariant holds without a separate table.
 *
 * @returns {Promise<boolean>} whether the email actually went out
 */
async function issuePasswordReset(author) {
  const token = generateResetToken()

  await db.execute({
    sql: `UPDATE users
          SET password_reset_token_hash = ?, password_reset_token_expires = ?
          WHERE id = ?`,
    args: [hashResetToken(token), resetTokenExpiry(), author.id]
  })

  const result = await sendPasswordResetEmail({
    email: author.email,
    fullName: author.full_name || author.email,
    token,
    expiresIn: '24 horas'
  })

  return result.success === true
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
      pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
      hide_profile_img_mobile
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
            password_setup_token, password_setup_token_expires, hide_profile_img_mobile)
            VALUES (?, '', ?, ?, ?, ?, ?, 'seller', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        tokenExpires,
        hide_profile_img_mobile ? 1 : 0
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
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, profile_img_mobile, hide_profile_img_mobile, visible, created_at,
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
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, profile_img_mobile, hide_profile_img_mobile, visible, created_at,
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
 * POST /api/admin/authors/send-password-reset-all
 * Send a password reset link to every activated author.
 *
 * Must stay above the `/:id` routes below — Express matches in declaration
 * order, so `send-password-reset-all` would otherwise be read as an id.
 *
 * Sends sequentially, never with Promise.all: the SMTP provider rate-limits,
 * a partial failure has to be legible artist by artist, and Promise.all would
 * abort on the first rejection leaving half the roster with a freshly issued
 * token and no email — the worst state, because their old link is dead too.
 */
router.post('/send-password-reset-all', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name
            FROM users
            WHERE role = 'seller' AND password_hash != ''
            ORDER BY full_name ASC`,
      args: []
    })

    const authors = result.rows
    const failed = []
    let sent = 0

    for (const author of authors) {
      try {
        if (await issuePasswordReset(author)) {
          sent += 1
        } else {
          failed.push(author.email)
        }
      } catch (error) {
        logger.error({ err: error, authorId: author.id }, 'Bulk password reset failed for author')
        failed.push(author.email)
      }
    }

    logger.info({ sent, failed: failed.length, total: authors.length }, 'Bulk password reset dispatched')

    // 200 even with failures: the operation ran, and the caller needs the
    // breakdown to retry the stragglers individually.
    res.json({
      title: 'Enviado',
      message: `Se han enviado ${sent} de ${authors.length} emails`,
      sent,
      failed: failed.length,
      total: authors.length,
      failedEmails: failed
    })
  } catch (error) {
    logger.error({ err: error }, 'Error sending bulk password reset')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudieron enviar los emails de cambio de contraseña'
    })
  }
})

/**
 * GET /api/admin/authors/:id
 * Get author details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, full_name, slug, bio, location, email_contact, profile_img, profile_img_mobile, hide_profile_img_mobile, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            password_hash, password_setup_token_expires,
            stripe_connect_account_id, stripe_connect_status, stripe_transfers_capability_active,
            stripe_connect_requirements_due, stripe_connect_last_synced_at,
            tax_status, tax_id, fiscal_full_name,
            fiscal_address_line1, fiscal_address_line2, fiscal_address_city,
            fiscal_address_postal_code, fiscal_address_province, fiscal_address_country,
            irpf_retention_rate,
            dealer_commission_art, dealer_commission_other,
            tax_vat_art, tax_vat_other
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
 * POST /api/admin/authors/:id/send-password-reset
 * Send an activated author a link to set a new password without knowing the
 * old one. The counterpart for accounts that never activated is
 * /:id/resend-invitation above.
 */
router.post('/:id/send-password-reset', async (req, res) => {
  try {
    const authorId = req.params.id

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

    // An artist with no password has nothing to reset — that account belongs
    // to the invitation flow, and sending both would be two contradictory
    // emails.
    if (!author.password_hash || author.password_hash.length === 0) {
      return res.status(400).json({
        title: 'Error',
        message: 'Este autor todavía no ha configurado su contraseña. Usa "Reenviar" para enviarle la invitación.'
      })
    }

    const emailSent = await issuePasswordReset(author)

    if (!emailSent) {
      return res.status(500).json({
        title: 'Error',
        message: 'No se pudo enviar el email de cambio de contraseña'
      })
    }

    logger.info({ authorId: author.id }, 'Password reset link sent to author')

    res.json({
      title: 'Enviado',
      message: 'Se ha enviado el email para cambiar la contraseña',
      emailSent: true
    })
  } catch (error) {
    logger.error({ err: error }, 'Error sending password reset')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo enviar el email de cambio de contraseña'
    })
  }
})

/**
 * PUT /api/admin/authors/:id
 * Update author information
 */
router.put('/:id', validate(updateAuthorSchema), async (req, res) => {
  try {
    const {
      full_name, bio, location, email, email_contact, visible,
      pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
      dealer_commission_art, dealer_commission_other,
      tax_vat_art, tax_vat_other,
      hide_profile_img_mobile
    } = req.body
    const authorId = req.params.id

    // Verify author exists and is a seller
    const checkResult = await db.execute({
      sql: `SELECT id, dealer_commission_art, dealer_commission_other,
                   tax_vat_art, tax_vat_other, hide_profile_img_mobile
            FROM users WHERE id = ? AND role = ?`,
      args: [authorId, 'seller']
    })

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        title: 'No encontrado',
        message: 'Autor no encontrado'
      })
    }

    // Commission and VAT fields are optional on the payload: keep the existing
    // value when the field is omitted. Zod already guarantees the range [0, 100].
    const existing = checkResult.rows[0]
    const commissionArt = dealer_commission_art !== undefined
      ? Number(dealer_commission_art)
      : Number(existing.dealer_commission_art)
    const commissionOther = dealer_commission_other !== undefined
      ? Number(dealer_commission_other)
      : Number(existing.dealer_commission_other)
    const taxVatArt = tax_vat_art !== undefined
      ? Number(tax_vat_art)
      : Number(existing.tax_vat_art)
    const taxVatOther = tax_vat_other !== undefined
      ? Number(tax_vat_other)
      : Number(existing.tax_vat_other)
    // Same omitted-field convention as above: absent leaves the flag untouched.
    const hideImgMobile = hide_profile_img_mobile !== undefined
      ? (hide_profile_img_mobile ? 1 : 0)
      : Number(existing.hide_profile_img_mobile)

    // Update author
    await db.execute({
      sql: `UPDATE users
            SET full_name = ?, bio = ?, location = ?, email = ?, email_contact = ?, visible = ?,
            pickup_address = ?, pickup_city = ?, pickup_postal_code = ?, pickup_country = ?, pickup_instructions = ?,
            dealer_commission_art = ?, dealer_commission_other = ?,
            tax_vat_art = ?, tax_vat_other = ?,
            hide_profile_img_mobile = ?
            WHERE id = ?`,
      args: [
        full_name, bio, location, email, email_contact, visible ? 1 : 0,
        pickup_address || '', pickup_city || '', pickup_postal_code || '', pickup_country || '', pickup_instructions || '',
        commissionArt, commissionOther,
        taxVatArt, taxVatOther,
        hideImgMobile,
        authorId
      ]
    })

    // Fetch updated author
    const updatedResult = await db.execute({
      sql: `SELECT id, email, full_name, bio, location, email_contact, profile_img, profile_img_mobile, hide_profile_img_mobile, visible, created_at,
            pickup_address, pickup_city, pickup_postal_code, pickup_country, pickup_instructions,
            dealer_commission_art, dealer_commission_other,
            tax_vat_art, tax_vat_other
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
 * Store an uploaded author portrait into one of the two avatar columns.
 *
 * Both variants live in the same `authors/` bucket/directory and use the same
 * `author-<suffix><ext>` naming, so `getAuthorImageUrl` on the client resolves
 * either one without knowing which column it came from. The column name is
 * chosen from a fixed literal at the call site — never from request data — so
 * it can't be steered into another column.
 *
 * @param {'profile_img'|'profile_img_mobile'} column
 */
async function storeAuthorAvatar(req, res, column) {
  const authorId = req.params.id

  if (!req.file) {
    return res.status(400).json({
      title: 'Error de validacion',
      message: 'No se proporciono ningun archivo'
    })
  }

  // Verify author exists
  const result = await db.execute({
    sql: `SELECT id, ${column} AS current_img FROM users WHERE id = ? AND role = ?`,
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

  // Delete the previous file for THIS column only, so replacing one variant
  // never removes the other.
  if (author.current_img) {
    if (config.useS3) {
      await s3Service.deleteFile(`authors/${author.current_img}`)
    } else {
      const oldImagePath = path.join(AUTHORS_UPLOADS_DIR, author.current_img)
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

  await db.execute({
    sql: `UPDATE users SET ${column} = ? WHERE id = ?`,
    args: [filename, authorId]
  })

  res.json({
    title: 'Avatar actualizado',
    message: 'Avatar del autor actualizado correctamente',
    filename: filename
  })
}

/**
 * POST /api/admin/authors/:id/upload-avatar
 * Upload the author's main (desktop) portrait
 */
router.post('/:id/upload-avatar', authorUpload.single('avatar'), async (req, res) => {
  try {
    await storeAuthorAvatar(req, res, 'profile_img')
  } catch (error) {
    logger.error({ err: error }, 'Error uploading avatar')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo subir el avatar'
    })
  }
})

/**
 * POST /api/admin/authors/:id/upload-avatar-mobile
 * Upload the landscape portrait shown below the `md` breakpoint
 */
router.post('/:id/upload-avatar-mobile', authorUpload.single('avatar'), async (req, res) => {
  try {
    await storeAuthorAvatar(req, res, 'profile_img_mobile')
  } catch (error) {
    logger.error({ err: error }, 'Error uploading mobile avatar')
    res.status(500).json({
      title: 'Error del servidor',
      message: 'No se pudo subir la imagen para móvil'
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

    const { attachProductImages } = require('../../utils/productImages');

    // Get art products
    const artResult = await db.execute({
      sql: `SELECT id, name, description, price, slug, visible, is_sold, status, removed, created_at,
            'art' as product_type
            FROM art
            WHERE seller_id = ? AND removed = 0
            ORDER BY created_at DESC`,
      args: [sellerId]
    });
    await attachProductImages(artResult.rows, 'art');

    // Get others products
    const othersResult = await db.execute({
      sql: `SELECT id, name, description, price, slug, visible, is_sold, status, removed, created_at,
            'others' as product_type
            FROM others
            WHERE seller_id = ? AND removed = 0
            ORDER BY created_at DESC`,
      args: [sellerId]
    });
    await attachProductImages(othersResult.rows, 'other');

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
