const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

const AUTHORS_IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'authors');

// Get all visible authors (users with visible = 1), optionally filtered by category
const getVisibleAuthors = async (req, res, next) => {
  try {
    const category = req.query.category; // 'art' or 'other'

    let query;
    const args = [];

    // If no category specified, return all visible authors
    if (!category) {
      query = `
        SELECT DISTINCT
          u.id,
          u.email,
          u.full_name,
          u.slug,
          u.profile_img,
          u.location,
          u.bio,
          u.visible
        FROM users u
        WHERE u.visible = 1
        ORDER BY u.full_name ASC
      `;
    } else if (category === 'art') {
      // Only include authors with at least one visible and approved art product
      query = `
        SELECT DISTINCT
          u.id,
          u.email,
          u.full_name,
          u.slug,
          u.profile_img,
          u.location,
          u.bio,
          u.visible
        FROM users u
        INNER JOIN art a ON u.id = a.seller_id
        WHERE u.visible = 1 AND a.visible = 1 AND a.is_sold = 0 AND a.status = 'approved'
          AND (a.for_auction = 0 OR a.for_auction IS NULL)
        ORDER BY u.full_name ASC
      `;
    } else if (category === 'other') {
      // Only include authors with at least one visible and approved others product
      query = `
        SELECT DISTINCT
          u.id,
          u.email,
          u.full_name,
          u.slug,
          u.profile_img,
          u.location,
          u.bio,
          u.visible
        FROM users u
        INNER JOIN others o ON u.id = o.seller_id
        WHERE u.visible = 1 AND o.visible = 1 AND o.is_sold = 0 AND o.status = 'approved'
          AND (o.for_auction = 0 OR o.for_auction IS NULL)
        ORDER BY u.full_name ASC
      `;
    } else {
      throw new ApiError(400, 'Categoría inválida', 'Categoría debe ser "art" o "other"');
    }

    const result = await db.execute({
      sql: query,
      args: args,
    });

    res.status(200).json({
      success: true,
      authors: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// Get author by slug
const getAuthorBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const result = await db.execute({
      sql: `
        SELECT
          id,
          email,
          full_name,
          slug,
          profile_img,
          location,
          bio,
          visible
        FROM users
        WHERE slug = ? AND visible = 1
      `,
      args: [slug],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Autor no encontrado', 'Autor no encontrado');
    }

    res.status(200).json({
      success: true,
      author: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// ─── Stripe Connect (Change #1): Update seller fiscal data ──────
// PUT /api/admin/sellers/:id/fiscal
// Body validated by sellerFiscalDataSchema (see api/validators/fiscalSchemas.js).
const updateSellerFiscalData = async (req, res, next) => {
  try {
    const sellerId = parseInt(req.params.id, 10);
    if (!Number.isFinite(sellerId)) {
      throw new ApiError(400, 'Invalid seller id');
    }

    // Ensure target user exists and is a seller.
    const existing = await db.execute({
      sql: `SELECT id FROM users WHERE id = ? AND role = 'seller'`,
      args: [sellerId],
    });
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Seller not found');
    }

    const {
      tax_status,
      tax_id,
      fiscal_full_name,
      fiscal_address_line1,
      fiscal_address_line2,
      fiscal_address_city,
      fiscal_address_postal_code,
      fiscal_address_province,
      fiscal_address_country,
      irpf_retention_rate,
    } = req.body;

    await db.execute({
      sql: `UPDATE users
            SET tax_status = ?,
                tax_id = ?,
                fiscal_full_name = ?,
                fiscal_address_line1 = ?,
                fiscal_address_line2 = ?,
                fiscal_address_city = ?,
                fiscal_address_postal_code = ?,
                fiscal_address_province = ?,
                fiscal_address_country = ?,
                irpf_retention_rate = ?
            WHERE id = ?`,
      args: [
        tax_status,
        tax_id,
        fiscal_full_name,
        fiscal_address_line1,
        fiscal_address_line2 || null,
        fiscal_address_city,
        fiscal_address_postal_code,
        fiscal_address_province,
        fiscal_address_country || 'ES',
        irpf_retention_rate ?? null,
        sellerId,
      ],
    });

    logger.info(
      { sellerId, adminId: req.user?.id },
      '[stripe-connect] seller fiscal data updated'
    );

    return sendSuccess(res, {
      tax_status,
      tax_id,
      fiscal_full_name,
      fiscal_address_line1,
      fiscal_address_line2: fiscal_address_line2 || null,
      fiscal_address_city,
      fiscal_address_postal_code,
      fiscal_address_province,
      fiscal_address_country: fiscal_address_country || 'ES',
      irpf_retention_rate: irpf_retention_rate ?? null,
    });
  } catch (error) {
    next(error);
  }
};

// Serve author profile image by filename
const getAuthorImage = async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Validate filename (allow common image extensions)
    if (!/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/i.test(filename)) {
      throw new ApiError(400, 'Nombre de imagen inválido', 'Solicitud inválida');
    }

    const filePath = path.join(AUTHORS_IMAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Imagen no encontrada', 'Imagen no encontrada');
    }

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVisibleAuthors,
  getAuthorBySlug,
  getAuthorImage,
  updateSellerFiscalData,
};
