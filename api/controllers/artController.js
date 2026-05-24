const { db } = require('../config/database');
const { ApiError, ValidationError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { imageSize } = require('image-size');
const slugify = require('slugify');
const logger = require('../config/logger');
const config = require('../config/env');
const s3Service = require('../services/s3Service');
const { sendNewProductNotificationEmail } = require('../services/emailService');
const { attachProductImages } = require('../utils/productImages');

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
      WHERE a.visible = 1 AND a.is_sold = 0 AND a.status = 'approved' AND a.removed = 0
        AND (a.for_auction = 0 OR a.for_auction IS NULL)
        AND (a.for_draw = 0 OR a.for_draw IS NULL)
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
    await attachProductImages(products, 'art');

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
          WHERE a.id = ? AND a.visible = 1 AND a.status = 'approved' AND a.removed = 0
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
          WHERE a.slug = ? AND a.visible = 1 AND a.status = 'approved' AND a.removed = 0
        `,
        args: [id],
      });
    }

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Obra no encontrada', 'Obra no encontrada');
    }

    const product = result.rows[0];
    await attachProductImages([product], 'art');

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
};

// Create new art product (seller only)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'art');

const createArtProduct = async (req, res, next) => {
  try {
    const { name, description, price, type, weight, dimensions, for_auction, ai_generated } = req.body;
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

    // Validate weight (mandatory when Sendcloud is enabled, otherwise optional)
    const { isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory');
    if (isSendcloudEnabled('art')) {
      if (!weight || !weight.toString().trim()) {
        validationErrors.push({ field: 'weight', message: 'El peso es obligatorio para poder calcular el envío' });
      } else {
        const weightNum = parseInt(weight, 10);
        if (!Number.isInteger(weightNum) || weightNum <= 0) {
          validationErrors.push({ field: 'weight', message: 'El peso debe ser un número entero mayor que 0' });
        }
      }
    } else if (weight) {
      const weightNum = parseInt(weight, 10);
      if (!Number.isInteger(weightNum) || weightNum <= 0) {
        validationErrors.push({ field: 'weight', message: 'El peso debe ser un número entero mayor que 0' });
      }
    }

    // Validate dimensions (optional, but if provided must follow format WxLxH)
    if (dimensions && typeof dimensions === 'string') {
      const dimensionsRegex = /^\d+x\d+x\d+$/;
      if (!dimensionsRegex.test(dimensions.trim())) {
        validationErrors.push({ field: 'dimensions', message: 'Las dimensiones deben estar en formato "LxWxH" (ej: 30x20x10)' });
      }
    }

    // Validate image files (at least 1, max 3)
    const imageFiles = req.files?.['images'] || [];
    if (imageFiles.length === 0) {
      validationErrors.push({ field: 'images', message: 'El archivo de imagen es obligatorio' });
    } else if (imageFiles.length > 3) {
      validationErrors.push({ field: 'images', message: 'Se permiten como máximo 3 imágenes' });
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

    // Per-file validation (MIME + dimensions)
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const imageValidationErrors = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const fieldName = `images[${i}]`;
      if (!allowedMimeTypes.includes(file.mimetype)) {
        imageValidationErrors.push({ field: fieldName, message: 'Solo se permiten imágenes PNG, JPG y WEBP' });
        continue;
      }
      try {
        const dims = imageSize(file.buffer);
        if (!dims || dims.width < 600 || dims.height < 600) {
          imageValidationErrors.push({ field: fieldName, message: 'La imagen debe tener al menos 600x600 píxeles' });
        }
      } catch (e) {
        imageValidationErrors.push({ field: fieldName, message: 'Archivo de imagen inválido' });
      }
    }

    if (imageValidationErrors.length > 0) {
      throw new ValidationError(imageValidationErrors);
    }

    // Map mime type to file extension
    const extFromMime = (mt) => {
      switch (mt) {
        case 'image/png': return 'png';
        case 'image/jpeg': return 'jpg';
        case 'image/webp': return 'webp';
        default: return null;
      }
    };

    // Generate unique basenames for each image
    const fileEntries = imageFiles.map((file) => {
      const ext = extFromMime(file.mimetype);
      if (!ext) {
        throw new ApiError(400, 'Formato de imagen no soportado', 'Imagen inválida');
      }
      return { file, basename: `${randomUUID()}.${ext}` };
    });

    // Write all files to storage; track written ones for cleanup on later failure
    const writtenBasenames = [];
    try {
      if (config.useS3) {
        for (const entry of fileEntries) {
          await s3Service.uploadFile(`art/${entry.basename}`, entry.file.buffer, entry.file.mimetype);
          writtenBasenames.push(entry.basename);
        }
      } else {
        await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
        for (const entry of fileEntries) {
          await fs.promises.writeFile(path.join(UPLOADS_DIR, entry.basename), entry.file.buffer);
          writtenBasenames.push(entry.basename);
        }
      }

      // Prepare values
      const weightValue = weight ? parseInt(weight, 10) : null;
      const dimensionsValue = dimensions && typeof dimensions === 'string' ? dimensions.trim() : null;
      const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0;
      const aiGeneratedVal = ai_generated === '1' || ai_generated === 1 ? 1 : 0;

      // Insert the art row first (we need its id for product_images)
      const insertResult = await db.execute({
        sql: `
          INSERT INTO art (seller_id, name, description, price, type, slug, weight, dimensions, for_auction, ai_generated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [seller_id, name, description, priceNum, type, slug, weightValue, dimensionsValue, forAuctionVal, aiGeneratedVal],
      });

      const artId = insertResult.lastInsertRowid;

      // Insert product_images rows in a batch (atomic with respect to each other)
      const { createBatch } = require('../utils/transaction');
      const batch = createBatch();
      fileEntries.forEach((entry, i) => {
        batch.add(
          'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
          ['art', artId, entry.basename, i],
        );
      });
      await batch.execute();

      // Fetch the created product and attach images
      const productResult = await db.execute({
        sql: 'SELECT * FROM art WHERE id = ?',
        args: [artId],
      });
      const product = productResult.rows[0];
      await attachProductImages([product], 'art');

      // Notify admin about new product (fire-and-forget)
      sendNewProductNotificationEmail({
        sellerName: req.user.full_name,
        productName: name,
        productType: 'art',
        productId: artId,
      }).catch(err => logger.error({ err }, 'Failed to send new product notification email'));

      res.status(201).json({
        success: true,
        product,
      });
    } catch (dbError) {
      // Clean up any files written so far
      for (const written of writtenBasenames) {
        if (config.useS3) {
          await s3Service.deleteFile(`art/${written}`).catch((err) =>
            logger.error({ err, basename: written }, 'Failed to clean up art image file after DB error'),
          );
        } else {
          try {
            await fs.promises.unlink(path.join(UPLOADS_DIR, written));
          } catch (unlinkErr) {
            logger.error({ err: unlinkErr, basename: written }, 'Failed to clean up art image file after DB error');
          }
        }
      }
      throw dbError;
    }
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

    // Collect all image basenames associated with this art product
    const imagesResult = await db.execute({
      sql: 'SELECT basename FROM product_images WHERE product_type = ? AND product_id = ?',
      args: ['art', id],
    });
    const basenames = imagesResult.rows.map((r) => r.basename);

    // Delete product_images rows first, then the art row
    await db.execute({
      sql: 'DELETE FROM product_images WHERE product_type = ? AND product_id = ?',
      args: ['art', id],
    });
    await db.execute({
      sql: 'DELETE FROM art WHERE id = ?',
      args: [id],
    });

    // Delete image files (best-effort; log failures, do not abort)
    for (const basename of basenames) {
      if (config.useS3) {
        await s3Service.deleteFile(`art/${basename}`).catch((err) =>
          logger.error({ err, basename }, 'Failed to delete art image file'),
        );
      } else {
        try {
          await fs.promises.unlink(path.join(UPLOADS_DIR, basename));
        } catch (err) {
          logger.error({ err, basename }, 'Failed to delete art image file');
        }
      }
    }

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
      sql: 'SELECT * FROM art WHERE seller_id = ? AND visible = 1 AND removed = 0 ORDER BY created_at DESC',
      args: [seller_id],
    });
    await attachProductImages(result.rows, 'art');

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
        WHERE a.seller_id = ? AND a.visible = 1 AND a.is_sold = 0 AND a.status = 'approved' AND a.removed = 0
          AND (a.for_auction = 0 OR a.for_auction IS NULL)
        ORDER BY a.created_at DESC
      `,
      args: [author.id],
    });
    await attachProductImages(productsResult.rows, 'art');

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
