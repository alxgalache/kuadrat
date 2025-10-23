const { db } = require('../config/database');
const { ApiError, ValidationError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const sizeOf = require('image-size');
const slugify = require('slugify');

// Get all art products (public) with pagination and optional author filtering
const getAllArtProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const authorSlug = req.query.author_slug;
    const offset = (page - 1) * limit;

    // Build the query with optional filters
    let query = `
      SELECT
        a.*,
        u.email as seller_email,
        u.full_name as seller_full_name,
        u.slug as seller_slug
      FROM art a
      LEFT JOIN users u ON a.seller_id = u.id
      WHERE a.visible = 1 AND a.is_sold = 0 AND a.status = 'approved'
    `;
    const args = [];

    // Add author filter if provided
    if (authorSlug) {
      query += ` AND u.slug = ?`;
      args.push(authorSlug);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit + 1, offset); // Fetch one extra to check if there are more

    const result = await db.execute({ sql: query, args });

    // Check if there are more products
    const hasMore = result.rows.length > limit;
    const products = hasMore ? result.rows.slice(0, limit) : result.rows;

    res.status(200).json({
      success: true,
      products: products,
      hasMore: hasMore,
      page: page,
    });
  } catch (error) {
    next(error);
  }
};

// Get single art product by ID or slug (public)
const getArtProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Auto-detect if it's an ID (numeric) or slug (string)
    const isNumeric = /^\d+$/.test(id);

    let result;
    if (isNumeric) {
      // Query by ID
      result = await db.execute({
        sql: `
          SELECT
            a.*,
            u.email as seller_email,
            u.full_name as seller_full_name,
            u.slug as seller_slug
          FROM art a
          LEFT JOIN users u ON a.seller_id = u.id
          WHERE a.id = ? AND a.visible = 1 AND a.status = 'approved'
        `,
        args: [parseInt(id, 10)],
      });
    } else {
      // Query by slug
      result = await db.execute({
        sql: `
          SELECT
            a.*,
            u.email as seller_email,
            u.full_name as seller_full_name,
            u.slug as seller_slug
          FROM art a
          LEFT JOIN users u ON a.seller_id = u.id
          WHERE a.slug = ? AND a.visible = 1 AND a.status = 'approved'
        `,
        args: [id],
      });
    }

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada');
    }

    res.status(200).json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// Create new art product (seller only)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'art');

const createArtProduct = async (req, res, next) => {
  try {
    const { name, description, price, type } = req.body;
    const seller_id = req.user.id;

    // Collect all validation errors
    const validationErrors = [];

    // Validate name
    if (!name || typeof name !== 'string') {
      validationErrors.push({ field: 'name', message: 'El nombre es obligatorio' });
    } else if (name.trim().length < 5) {
      validationErrors.push({ field: 'name', message: 'El nombre debe tener al menos 5 caracteres' });
    } else if (name.trim().length > 200) {
      validationErrors.push({ field: 'name', message: 'El nombre no debe exceder 200 caracteres' });
    }

    // Validate description
    if (!description || typeof description !== 'string') {
      validationErrors.push({ field: 'description', message: 'La descripción es obligatoria' });
    } else if (description.trim().length < 100) {
      validationErrors.push({ field: 'description', message: 'La descripción debe tener al menos 100 caracteres' });
    } else if (description.trim().length > 1000) {
      validationErrors.push({ field: 'description', message: 'La descripción no debe exceder 1000 caracteres' });
    }

    // Validate price
    if (!price) {
      validationErrors.push({ field: 'price', message: 'El precio es obligatorio' });
    } else {
      const priceNum = parseFloat(price);
      if (!Number.isFinite(priceNum)) {
        validationErrors.push({ field: 'price', message: 'El precio debe ser un número válido' });
      } else if (priceNum < 10) {
        validationErrors.push({ field: 'price', message: 'El precio debe ser al menos €10' });
      } else if (priceNum > 10000) {
        validationErrors.push({ field: 'price', message: 'El precio no debe exceder €10,000' });
      }
    }

    // Validate type (soporte/media)
    if (!type || typeof type !== 'string') {
      validationErrors.push({ field: 'type', message: 'El soporte es obligatorio' });
    } else if (type.trim().length < 3) {
      validationErrors.push({ field: 'type', message: 'El soporte debe tener al menos 3 caracteres' });
    } else if (type.trim().length > 100) {
      validationErrors.push({ field: 'type', message: 'El soporte no debe exceder 100 caracteres' });
    }

    // Validate image file
    if (!req.file) {
      validationErrors.push({ field: 'image', message: 'El archivo de imagen es obligatorio' });
    }

    // If there are validation errors, throw them all at once
    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors);
    }

    const priceNum = parseFloat(price);

    // Generate slug from name
    const slug = slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g,
    });

    if (!slug) {
      throw new ApiError(400, 'El nombre de la obra debe contener caracteres válidos', 'Nombre de obra inválido');
    }

    // Check if slug already exists
    const existingSlug = await db.execute({
      sql: 'SELECT id FROM art WHERE slug = ?',
      args: [slug],
    });

    if (existingSlug.rows.length > 0) {
      throw new ApiError(400, 'Ya existe una obra con este nombre. Por favor, elige un nombre diferente.', 'Nombre de obra duplicado');
    }

    // File validation (additional checks beyond multer)
    const imageValidationErrors = [];

    if (req.file) {
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        imageValidationErrors.push({ field: 'image', message: 'Solo se permiten imágenes PNG, JPG y WEBP' });
      }

      // Validate image dimensions (>= 600x600)
      let dimensions;
      try {
        dimensions = sizeOf(req.file.buffer);
        if (!dimensions || dimensions.width < 600 || dimensions.height < 600) {
          imageValidationErrors.push({ field: 'image', message: 'La imagen debe tener al menos 600x600 píxeles' });
        }
      } catch (e) {
        imageValidationErrors.push({ field: 'image', message: 'Archivo de imagen inválido' });
      }
    }

    // If there are image validation errors, throw them
    if (imageValidationErrors.length > 0) {
      throw new ValidationError(imageValidationErrors);
    }

    // Determine file extension based on mime type
    let fileExtension;
    switch (req.file.mimetype) {
      case 'image/png':
        fileExtension = 'png';
        break;
      case 'image/jpeg':
        fileExtension = 'jpg';
        break;
      case 'image/webp':
        fileExtension = 'webp';
        break;
      default:
        throw new ApiError(400, 'Formato de imagen no soportado', 'Imagen inválida');
    }

    // Ensure uploads directory exists
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

    // Generate unique basename (uuid.ext) and ensure uniqueness in DB
    let basename;
    while (true) {
      basename = `${randomUUID()}.${fileExtension}`;
      const existing = await db.execute({
        sql: 'SELECT id FROM art WHERE basename = ?',
        args: [basename],
      });
      if (existing.rows.length === 0) break;
    }

    const filePath = path.join(UPLOADS_DIR, basename);
    await fs.promises.writeFile(filePath, req.file.buffer);

    // Insert art product
    const result = await db.execute({
      sql: `
        INSERT INTO art (seller_id, name, description, price, type, basename, slug)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [seller_id, name, description, priceNum, type, basename, slug],
    });

    // Get the created product
    const productResult = await db.execute({
      sql: 'SELECT * FROM art WHERE id = ?',
      args: [result.lastInsertRowid],
    });

    res.status(201).json({
      success: true,
      product: productResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// Serve art product image by basename
const getArtProductImage = async (req, res, next) => {
  try {
    const { basename } = req.params;
    if (!/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(basename)) {
      throw new ApiError(400, 'Nombre de imagen inválido', 'Solicitud inválida');
    }
    const filePath = path.join(UPLOADS_DIR, basename);
    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Imagen no encontrada', 'Imagen no encontrada');
    }
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

// Delete art product (seller only, own products)
const deleteArtProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if product exists and belongs to the user
    const productResult = await db.execute({
      sql: 'SELECT * FROM art WHERE id = ?',
      args: [id],
    });

    if (productResult.rows.length === 0) {
      throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada');
    }

    const product = productResult.rows[0];

    if (product.seller_id !== userId) {
      throw new ApiError(403, 'Solo puedes eliminar tus propias obras', 'Acceso denegado');
    }

    if (product.is_sold === 1) {
      throw new ApiError(400, 'No se puede eliminar una obra vendida', 'No se puede eliminar la obra');
    }

    // Delete product
    await db.execute({
      sql: 'DELETE FROM art WHERE id = ?',
      args: [id],
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Get all art products for logged-in seller
const getSellerArtProducts = async (req, res, next) => {
  try {
    const seller_id = req.user.id;

    const result = await db.execute({
      sql: 'SELECT * FROM art WHERE seller_id = ? AND visible = 1 ORDER BY created_at DESC',
      args: [seller_id],
    });

    res.status(200).json({
      success: true,
      products: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// Get all art products by author slug (public)
const getArtProductsByAuthorSlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    // First, get the user by slug
    const userResult = await db.execute({
      sql: 'SELECT id, full_name FROM users WHERE slug = ? AND visible = 1',
      args: [slug],
    });

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'Autor no encontrado', 'Autor no encontrado');
    }

    const author = userResult.rows[0];

    // Get all visible art products for this author
    const productsResult = await db.execute({
      sql: `
        SELECT
          a.*,
          u.email as seller_email,
          u.full_name as seller_name
        FROM art a
        LEFT JOIN users u ON a.seller_id = u.id
        WHERE a.seller_id = ? AND a.visible = 1 AND a.is_sold = 0 AND a.status = 'approved'
        ORDER BY a.created_at DESC
      `,
      args: [author.id],
    });

    res.status(200).json({
      success: true,
      author: author,
      products: productsResult.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllArtProducts,
  getArtProductById,
  createArtProduct,
  deleteArtProduct,
  getSellerArtProducts,
  getArtProductImage,
  getArtProductsByAuthorSlug,
};
