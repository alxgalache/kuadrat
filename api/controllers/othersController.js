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
const { attachProductImages, attachVariationThumbnails } = require('../utils/productImages');
const { createBatch } = require('../utils/transaction');

// Get all others products (public) with pagination and optional author filtering
const getAllOthersProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const authorSlug = req.query.author_slug;
    const offset = (page - 1) * limit;

    // Build the query with optional filters
    let query = `
      SELECT
        o.*,
        u.email as seller_email,
        u.full_name as seller_full_name,
        u.slug as seller_slug
      FROM others o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.visible = 1 AND o.is_sold = 0 AND o.status = 'approved' AND o.removed = 0
        AND (o.for_auction = 0 OR o.for_auction IS NULL)
        AND (o.for_draw = 0 OR o.for_draw IS NULL)
    `;
    const args = [];

    // Add author filter if provided
    if (authorSlug) {
      query += ` AND u.slug = ?`;
      args.push(authorSlug);
    }

    query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit + 1, offset); // Fetch one extra to check if there are more

    const result = await db.execute({ sql: query, args });

    // Check if there are more products
    const hasMore = result.rows.length > limit;
    const products = hasMore ? result.rows.slice(0, limit) : result.rows;

    // For each product, get the total stock from all variations
    for (const product of products) {
      const stockResult = await db.execute({
        sql: 'SELECT SUM(stock) as total_stock FROM other_vars WHERE other_id = ?',
        args: [product.id],
      });
      product.stock = stockResult.rows[0]?.total_stock || 0;
    }

    await attachProductImages(products, 'other');
    await attachVariationThumbnails(products);

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

// Get single others product by ID or slug (public)
const getOthersProductById = async (req, res, next) => {
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
            o.*,
            u.email as seller_email,
            u.full_name as seller_full_name,
            u.slug as seller_slug
          FROM others o
          LEFT JOIN users u ON o.seller_id = u.id
          WHERE o.id = ? AND o.visible = 1 AND o.status = 'approved' AND o.removed = 0
        `,
        args: [parseInt(id, 10)],
      });
    } else {
      // Query by slug
      result = await db.execute({
        sql: `
          SELECT
            o.*,
            u.email as seller_email,
            u.full_name as seller_full_name,
            u.slug as seller_slug
          FROM others o
          LEFT JOIN users u ON o.seller_id = u.id
          WHERE o.slug = ? AND o.visible = 1 AND o.status = 'approved' AND o.removed = 0
        `,
        args: [id],
      });
    }

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'Producto no encontrado');
    }

    const product = result.rows[0];
    await attachProductImages([product], 'other');

    // Get all variations for this product
    const variationsResult = await db.execute({
      sql: 'SELECT * FROM other_vars WHERE other_id = ? ORDER BY id ASC',
      args: [product.id],
    });
    await attachProductImages(variationsResult.rows, 'other_var');

    product.variations = variationsResult.rows;

    // Calculate total stock
    const totalStock = variationsResult.rows.reduce((sum, v) => sum + (v.stock || 0), 0);
    product.stock = totalStock;

    res.status(200).json({
      success: true,
      product: product,
    });
  } catch (error) {
    next(error);
  }
};

// Create new others product (seller only)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'others');

// Helper: get file extension from mime type
const getFileExtension = (mimetype) => {
  switch (mimetype) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return null;
  }
};

// Helper: validate a single image file (type + dimensions)
const validateImageFile = (file, fieldName) => {
  const errors = [];
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    errors.push({ field: fieldName, message: 'Solo se permiten imágenes PNG, JPG y WEBP' });
  }

  try {
    const dims = imageSize(file.buffer);
    if (!dims || dims.width < 600 || dims.height < 600) {
      errors.push({ field: fieldName, message: 'La imagen debe tener al menos 600x600 píxeles' });
    }
  } catch (e) {
    errors.push({ field: fieldName, message: 'Archivo de imagen inválido' });
  }

  return errors;
};

// Helper: generate unique basename for an image file
const generateUniqueBasename = (mimetype) => {
  const ext = getFileExtension(mimetype);
  if (!ext) throw new ApiError(400, 'Formato de imagen no soportado', 'Imagen inválida');
  return `${randomUUID()}.${ext}`;
};

const createOthersProduct = async (req, res, next) => {
  try {
    const { name, description, price, variations, weight, dimensions, for_auction, ai_generated, can_copack } = req.body;
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

    // Validate weight (mandatory when Sendcloud is enabled, otherwise optional)
    const { isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory');
    if (isSendcloudEnabled('other')) {
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

    // Validate variations
    let parsedVariations = [];
    if (variations) {
      try {
        parsedVariations = typeof variations === 'string' ? JSON.parse(variations) : variations;

        if (!Array.isArray(parsedVariations) || parsedVariations.length === 0) {
          validationErrors.push({ field: 'variations', message: 'Debe proporcionar al menos una variación o stock global' });
        } else {
          // Validate each variation
          parsedVariations.forEach((v, index) => {
            if (v.key !== null && (!v.key || typeof v.key !== 'string')) {
              validationErrors.push({ field: `variations[${index}].key`, message: 'La clave de variación debe ser una cadena válida' });
            }
            const stock = parseInt(v.stock, 10);
            if (!Number.isInteger(stock) || stock < 0) {
              validationErrors.push({ field: `variations[${index}].stock`, message: 'El stock debe ser un número entero positivo o cero' });
            }
          });
        }
      } catch (e) {
        validationErrors.push({ field: 'variations', message: 'Formato de variaciones inválido' });
      }
    } else {
      validationErrors.push({ field: 'variations', message: 'Debe proporcionar variaciones o stock global' });
    }

    // Detect whether the seller declared named variations. When any variation
    // has a non-null key, the product is in "variations mode" → per-variation
    // image is required, global image is optional. Otherwise the legacy rule
    // stands: global image required.
    const hasNamedVariations = parsedVariations.some(
      (v) => v.key != null && String(v.key).trim() !== '',
    );

    // Validate global product images (max 3 always; min 1 only when no named variations)
    const globalImageFiles = req.files?.['images'] || [];
    if (!hasNamedVariations && globalImageFiles.length === 0) {
      validationErrors.push({ field: 'images', message: 'El archivo de imagen es obligatorio' });
    } else if (globalImageFiles.length > 3) {
      validationErrors.push({ field: 'images', message: 'Se permiten como máximo 3 imágenes globales' });
    }

    // Per-variation images: cap at 3; require ≥1 for each named variation.
    const variationImageFilesByIndex = parsedVariations.map((_, i) => req.files?.[`variation_${i}_images`] || []);
    variationImageFilesByIndex.forEach((files, i) => {
      if (files.length > 3) {
        validationErrors.push({
          field: `variation_${i}_images`,
          message: `Variación ${i + 1}: se permiten como máximo 3 imágenes`,
        });
      }
      if (hasNamedVariations && parsedVariations[i]?.key != null && files.length === 0) {
        const label = String(parsedVariations[i].key).trim() || String(i + 1);
        validationErrors.push({
          field: `variation_${i}_images[0]`,
          message: `La variación ${label} debe tener al menos una imagen`,
        });
      }
    });

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
      throw new ApiError(400, 'El nombre del producto debe contener caracteres válidos', 'Nombre de producto inválido');
    }

    // Check if slug already exists
    const existingSlug = await db.execute({
      sql: 'SELECT id FROM others WHERE slug = ?',
      args: [slug],
    });

    if (existingSlug.rows.length > 0) {
      throw new ApiError(400, 'Ya existe un producto con este nombre. Por favor, elige un nombre diferente.', 'Nombre de producto duplicado');
    }

    // Per-file validation (MIME + dimensions) for global and variation images
    const imageValidationErrors = [];
    globalImageFiles.forEach((file, i) => {
      imageValidationErrors.push(...validateImageFile(file, `images[${i}]`));
    });
    variationImageFilesByIndex.forEach((files, varIdx) => {
      files.forEach((file, slotIdx) => {
        imageValidationErrors.push(...validateImageFile(file, `variation_${varIdx}_images[${slotIdx}]`));
      });
    });

    if (imageValidationErrors.length > 0) {
      throw new ValidationError(imageValidationErrors);
    }

    // Pre-generate basenames so we can roll back files cleanly on error
    const globalEntries = globalImageFiles.map((file) => ({
      file,
      basename: generateUniqueBasename(file.mimetype),
    }));
    const variationEntriesByIndex = variationImageFilesByIndex.map((files) =>
      files.map((file) => ({ file, basename: generateUniqueBasename(file.mimetype) })),
    );

    // Write all files to storage; track for cleanup on later failure
    const writtenFiles = [];
    try {
      if (!config.useS3) {
        await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
      }
      const writeOne = async ({ file, basename }) => {
        if (config.useS3) {
          await s3Service.uploadFile(`others/${basename}`, file.buffer, file.mimetype);
        } else {
          await fs.promises.writeFile(path.join(UPLOADS_DIR, basename), file.buffer);
        }
        writtenFiles.push(basename);
      };
      for (const entry of globalEntries) await writeOne(entry);
      for (const list of variationEntriesByIndex) {
        for (const entry of list) await writeOne(entry);
      }

      // Prepare values
      const weightValue = weight ? parseInt(weight, 10) : null;
      const dimensionsValue = dimensions && typeof dimensions === 'string' ? dimensions.trim() : null;
      const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0;
      const aiGeneratedVal = ai_generated === '1' || ai_generated === 1 ? 1 : 0;
      const canCopackVal = can_copack === '0' || can_copack === 0 || can_copack === false ? 0 : 1;

      // Insert the others row to get its id
      const insertResult = await db.execute({
        sql: `
          INSERT INTO others (seller_id, name, description, price, slug, weight, dimensions, for_auction, ai_generated, can_copack)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [seller_id, name, description, priceNum, slug, weightValue, dimensionsValue, forAuctionVal, aiGeneratedVal, canCopackVal],
      });
      const productId = insertResult.lastInsertRowid;

      // Insert variations one-by-one to capture each id, then batch insert their images
      const variationIds = [];
      for (let i = 0; i < parsedVariations.length; i++) {
        const variation = parsedVariations[i];
        const varInsert = await db.execute({
          sql: `INSERT INTO other_vars (other_id, key, stock) VALUES (?, ?, ?)`,
          args: [productId, variation.key || null, parseInt(variation.stock, 10)],
        });
        variationIds.push(varInsert.lastInsertRowid);
      }

      // Batch insert all product_images rows: globals + per-variation images
      const batch = createBatch();
      globalEntries.forEach((entry, i) => {
        batch.add(
          'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
          ['other', productId, entry.basename, i],
        );
      });
      variationEntriesByIndex.forEach((list, varIdx) => {
        const varId = variationIds[varIdx];
        list.forEach((entry, slotIdx) => {
          batch.add(
            'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
            ['other_var', varId, entry.basename, slotIdx],
          );
        });
      });
      if (batch.size() > 0) await batch.execute();

      // Fetch the created product and its variations, attaching images to both
      const productResult = await db.execute({
        sql: 'SELECT * FROM others WHERE id = ?',
        args: [productId],
      });
      const product = productResult.rows[0];
      await attachProductImages([product], 'other');

      const variationsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ? ORDER BY id ASC',
        args: [productId],
      });
      await attachProductImages(variationsResult.rows, 'other_var');
      product.variations = variationsResult.rows;

      // Notify admin about new product (fire-and-forget)
      sendNewProductNotificationEmail({
        sellerName: req.user.full_name,
        productName: name,
        productType: 'others',
        productId: productId,
      }).catch(err => logger.error({ err }, 'Failed to send new product notification email'));

      res.status(201).json({
        success: true,
        product,
      });
    } catch (dbError) {
      // Clean up any files written so far
      for (const writtenBasename of writtenFiles) {
        if (config.useS3) {
          await s3Service.deleteFile(`others/${writtenBasename}`).catch((err) =>
            logger.error({ err, basename: writtenBasename }, 'Failed to clean up image file after DB error'),
          );
        } else {
          try {
            await fs.promises.unlink(path.join(UPLOADS_DIR, writtenBasename));
          } catch (unlinkErr) {
            logger.error({ err: unlinkErr, basename: writtenBasename }, 'Failed to clean up image file after DB error');
          }
        }
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
};

// Serve others product image by basename
const getOthersProductImage = async (req, res, next) => {
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

// Delete others product (seller only, own products)
const deleteOthersProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if product exists and belongs to the user
    const productResult = await db.execute({
      sql: 'SELECT * FROM others WHERE id = ?',
      args: [id],
    });

    if (productResult.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'Producto no encontrado');
    }

    const product = productResult.rows[0];

    if (product.seller_id !== userId) {
      throw new ApiError(403, 'Solo puedes eliminar tus propios productos', 'Acceso denegado');
    }

    if (product.is_sold === 1) {
      throw new ApiError(400, 'No se puede eliminar un producto vendido', 'No se puede eliminar el producto');
    }

    // Collect basenames for the global product images and its variations' images
    const variationIdsResult = await db.execute({
      sql: 'SELECT id FROM other_vars WHERE other_id = ?',
      args: [id],
    });
    const variationIds = variationIdsResult.rows.map((r) => r.id);

    const basenames = [];

    const globalImagesResult = await db.execute({
      sql: 'SELECT basename FROM product_images WHERE product_type = ? AND product_id = ?',
      args: ['other', id],
    });
    for (const row of globalImagesResult.rows) basenames.push(row.basename);

    if (variationIds.length > 0) {
      const placeholders = variationIds.map(() => '?').join(',');
      const varImagesResult = await db.execute({
        sql: `SELECT basename FROM product_images WHERE product_type = 'other_var' AND product_id IN (${placeholders})`,
        args: variationIds,
      });
      for (const row of varImagesResult.rows) basenames.push(row.basename);
    }

    // Delete product_images rows first, then variations, then the product
    await db.execute({
      sql: 'DELETE FROM product_images WHERE product_type = ? AND product_id = ?',
      args: ['other', id],
    });
    if (variationIds.length > 0) {
      const placeholders = variationIds.map(() => '?').join(',');
      await db.execute({
        sql: `DELETE FROM product_images WHERE product_type = 'other_var' AND product_id IN (${placeholders})`,
        args: variationIds,
      });
    }

    // Delete variations (CASCADE should handle this, but being explicit)
    await db.execute({
      sql: 'DELETE FROM other_vars WHERE other_id = ?',
      args: [id],
    });

    // Delete product
    await db.execute({
      sql: 'DELETE FROM others WHERE id = ?',
      args: [id],
    });

    // Clean up image files from S3 or disk (log errors, don't block)
    for (const basename of basenames) {
      if (config.useS3) {
        await s3Service.deleteFile(`others/${basename}`).catch((err) =>
          logger.error({ err, basename }, 'Failed to delete image file during product deletion'),
        );
      } else {
        try {
          await fs.promises.unlink(path.join(UPLOADS_DIR, basename));
        } catch (err) {
          logger.error({ err, basename }, 'Failed to delete image file during product deletion');
        }
      }
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Get all others products for logged-in seller
const getSellerOthersProducts = async (req, res, next) => {
  try {
    const seller_id = req.user.id;

    const result = await db.execute({
      sql: 'SELECT * FROM others WHERE seller_id = ? AND visible = 1 AND removed = 0 ORDER BY created_at DESC',
      args: [seller_id],
    });

    const products = result.rows;
    await attachProductImages(products, 'other');
    await attachVariationThumbnails(products);

    // For each product, get variations
    for (const product of products) {
      const variationsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ?',
        args: [product.id],
      });
      await attachProductImages(variationsResult.rows, 'other_var');
      product.variations = variationsResult.rows;
    }

    res.status(200).json({
      success: true,
      products: products,
    });
  } catch (error) {
    next(error);
  }
};

// Get all others products by author slug (public)
const getOthersProductsByAuthorSlug = async (req, res, next) => {
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

    // Get all visible others products for this author
    const productsResult = await db.execute({
      sql: `
        SELECT
          o.*,
          u.email as seller_email,
          u.full_name as seller_name
        FROM others o
        LEFT JOIN users u ON o.seller_id = u.id
        WHERE o.seller_id = ? AND o.visible = 1 AND o.is_sold = 0 AND o.status = 'approved' AND o.removed = 0
          AND (o.for_auction = 0 OR o.for_auction IS NULL)
        ORDER BY o.created_at DESC
      `,
      args: [author.id],
    });
    await attachProductImages(productsResult.rows, 'other');
    await attachVariationThumbnails(productsResult.rows);

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
  getAllOthersProducts,
  getOthersProductById,
  createOthersProduct,
  deleteOthersProduct,
  getSellerOthersProducts,
  getOthersProductImage,
  getOthersProductsByAuthorSlug,
};
