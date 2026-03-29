const { db } = require('../config/database');
const { ApiError, ValidationError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { imageSize } = require('image-size');
const slugify = require('slugify');
const logger = require('../config/logger');
const { sendNewProductNotificationEmail } = require('../services/emailService');

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

    // Get all variations for this product
    const variationsResult = await db.execute({
      sql: 'SELECT * FROM other_vars WHERE other_id = ? ORDER BY id ASC',
      args: [product.id],
    });

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

    // Validate main image file (always required)
    const mainImageFile = req.files?.['image']?.[0];
    if (!mainImageFile) {
      validationErrors.push({ field: 'image', message: 'El archivo de imagen es obligatorio' });
    }

    // Check if variations have named keys (i.e. real variations, not global stock)
    const hasNamedVariations = parsedVariations.some(v => v.key !== null);
    const variationImageFiles = req.files?.['variation_images'] || [];

    // Validate variation images: required when variations have named keys
    if (hasNamedVariations && variationImageFiles.length !== parsedVariations.length) {
      validationErrors.push({
        field: 'variation_images',
        message: `Se requiere una imagen por cada variación (${parsedVariations.length} variaciones, ${variationImageFiles.length} imágenes proporcionadas)`,
      });
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

    // Validate main image file content (type + dimensions)
    const imageValidationErrors = validateImageFile(mainImageFile, 'image');

    // Validate each variation image file
    for (let i = 0; i < variationImageFiles.length; i++) {
      const varErrors = validateImageFile(variationImageFiles[i], `variation_images[${i}]`);
      imageValidationErrors.push(...varErrors);
    }

    if (imageValidationErrors.length > 0) {
      throw new ValidationError(imageValidationErrors);
    }

    // Ensure uploads directory exists
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

    // Generate basenames and write all image files to disk
    const writtenFiles = [];
    try {
      // Main product image
      const mainBasename = generateUniqueBasename(mainImageFile.mimetype);
      await fs.promises.writeFile(path.join(UPLOADS_DIR, mainBasename), mainImageFile.buffer);
      writtenFiles.push(mainBasename);

      // Variation images
      const variationBasenames = [];
      for (const varFile of variationImageFiles) {
        const varBasename = generateUniqueBasename(varFile.mimetype);
        await fs.promises.writeFile(path.join(UPLOADS_DIR, varBasename), varFile.buffer);
        writtenFiles.push(varBasename);
        variationBasenames.push(varBasename);
      }

      // Prepare weight and dimensions values
      const weightValue = weight ? parseInt(weight, 10) : null;
      const dimensionsValue = dimensions && typeof dimensions === 'string' ? dimensions.trim() : null;

      // Insert others product
      const forAuctionVal = for_auction === '1' || for_auction === 1 ? 1 : 0;
      const aiGeneratedVal = ai_generated === '1' || ai_generated === 1 ? 1 : 0;
      const canCopackVal = can_copack === '0' || can_copack === 0 || can_copack === false ? 0 : 1;
      const result = await db.execute({
        sql: `
          INSERT INTO others (seller_id, name, description, price, basename, slug, weight, dimensions, for_auction, ai_generated, can_copack)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [seller_id, name, description, priceNum, mainBasename, slug, weightValue, dimensionsValue, forAuctionVal, aiGeneratedVal, canCopackVal],
      });

      const productId = result.lastInsertRowid;

      // Insert variations with their basenames
      for (let i = 0; i < parsedVariations.length; i++) {
        const variation = parsedVariations[i];
        const varBasename = variationBasenames[i] || null;
        await db.execute({
          sql: `
            INSERT INTO other_vars (other_id, key, stock, basename)
            VALUES (?, ?, ?, ?)
          `,
          args: [
            productId,
            variation.key || null,
            parseInt(variation.stock, 10),
            varBasename,
          ],
        });
      }

      // Get the created product with variations
      const productResult = await db.execute({
        sql: 'SELECT * FROM others WHERE id = ?',
        args: [productId],
      });

      const variationsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ?',
        args: [productId],
      });

      const product = productResult.rows[0];
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
        product: product,
      });
    } catch (dbError) {
      // Clean up written files if DB operations fail
      for (const writtenBasename of writtenFiles) {
        try {
          await fs.promises.unlink(path.join(UPLOADS_DIR, writtenBasename));
        } catch (unlinkErr) {
          logger.error({ err: unlinkErr, basename: writtenBasename }, 'Failed to clean up image file after DB error');
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

    // Collect all image basenames to delete from disk
    const basenames = [];
    if (product.basename) {
      basenames.push(product.basename);
    }
    const varsResult = await db.execute({
      sql: 'SELECT basename FROM other_vars WHERE other_id = ?',
      args: [id],
    });
    for (const row of varsResult.rows) {
      if (row.basename) {
        basenames.push(row.basename);
      }
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

    // Clean up image files from disk (log errors, don't block)
    for (const basename of basenames) {
      try {
        await fs.promises.unlink(path.join(UPLOADS_DIR, basename));
      } catch (err) {
        logger.error({ err, basename }, 'Failed to delete image file during product deletion');
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

    // For each product, get variations
    const products = [];
    for (const product of result.rows) {
      const variationsResult = await db.execute({
        sql: 'SELECT * FROM other_vars WHERE other_id = ?',
        args: [product.id],
      });
      product.variations = variationsResult.rows;
      products.push(product);
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
