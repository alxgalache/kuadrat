const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');

const AUTHORS_IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'authors');

// Get all visible authors (users with visible = 1), optionally filtered by category
const getVisibleAuthors = async (req, res, next) => {
  try {
    const category = req.query.category; // 'art' or 'other'

    let query = `
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
    `;
    const args = [];

    // If category is specified, only include authors with at least one visible product in that category
    if (category) {
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
        INNER JOIN products p ON u.id = p.seller_id
        WHERE u.visible = 1 AND p.visible = 1 AND p.sold = 0 AND p.category = ?
      `;
      args.push(category);
    }

    query += ` ORDER BY u.full_name ASC`;

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
};
