const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { postcodeValidator } = require('postcode-validator');

// =====================================
// SHIPPING METHODS CRUD
// =====================================

// Get all shipping methods (Admin only)
const getAllShippingMethods = async (req, res, next) => {
  try {
    const result = await db.execute(`
      SELECT
        id,
        name,
        description,
        type,
        article_type,
        max_weight,
        max_dimensions,
        max_articles,
        estimated_delivery_days,
        is_active,
        created_at,
        updated_at
      FROM shipping_methods
      ORDER BY name ASC
    `);

    res.status(200).json({
      success: true,
      methods: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// Get a single shipping method by ID (Admin only)
const getShippingMethodById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.execute({
      sql: `
        SELECT
          id,
          name,
          description,
          type,
          article_type,
          max_weight,
          max_dimensions,
          max_articles,
          estimated_delivery_days,
          is_active,
          created_at,
          updated_at
        FROM shipping_methods
        WHERE id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Método de envío no encontrado', 'Método de envío no encontrado');
    }

    res.status(200).json({
      success: true,
      method: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// Create a new shipping method (Admin only)
const createShippingMethod = async (req, res, next) => {
  try {
    const {
      name,
      description,
      type,
      article_type = 'all',
      max_weight,
      max_dimensions,
      max_articles = 1,
      estimated_delivery_days,
      is_active = 1,
    } = req.body;

    // Validate required fields
    if (!name || !type) {
      throw new ApiError(400, 'Nombre y tipo son obligatorios', 'Campos obligatorios faltantes');
    }

    // Validate type
    if (!['delivery', 'pickup'].includes(type)) {
      throw new ApiError(400, 'Tipo debe ser "delivery" o "pickup"', 'Tipo inválido');
    }

    // Validate article_type
    if (!['art', 'others', 'all'].includes(article_type)) {
      throw new ApiError(400, 'article_type debe ser "art", "others" o "all"', 'article_type inválido');
    }

    // Validate dimensions format if provided
    if (max_dimensions) {
      const dimensionPattern = /^\d+x\d+x\d+$/;
      if (!dimensionPattern.test(max_dimensions)) {
        throw new ApiError(
          400,
          'Dimensiones máximas deben estar en formato "AnchoxLargoxAlto" (e.g., "100x80x60")',
          'Formato de dimensiones inválido'
        );
      }
    }

    const result = await db.execute({
      sql: `
        INSERT INTO shipping_methods (
          name,
          description,
          type,
          article_type,
          max_weight,
          max_dimensions,
          max_articles,
          estimated_delivery_days,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [
        name,
        description || null,
        type,
        article_type,
        max_weight || null,
        max_dimensions || null,
        max_articles || 1,
        estimated_delivery_days || null,
        is_active,
      ],
    });

    res.status(201).json({
      success: true,
      message: 'Método de envío creado exitosamente',
      shippingMethodId: result.lastInsertRowid.toString(),
    });
  } catch (error) {
    next(error);
  }
};

// Update a shipping method (Admin only)
const updateShippingMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      article_type,
      max_weight,
      max_dimensions,
      max_articles,
      estimated_delivery_days,
      is_active,
    } = req.body;

    // Check if method exists
    const existing = await db.execute({
      sql: 'SELECT id FROM shipping_methods WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Método de envío no encontrado', 'Método de envío no encontrado');
    }

    // Validate type if provided
    if (type && !['delivery', 'pickup'].includes(type)) {
      throw new ApiError(400, 'Tipo debe ser "delivery" o "pickup"', 'Tipo inválido');
    }

    // Validate article_type if provided
    if (article_type && !['art', 'others', 'all'].includes(article_type)) {
      throw new ApiError(400, 'article_type debe ser "art", "others" o "all"', 'article_type inválido');
    }

    // Validate dimensions format if provided
    if (max_dimensions) {
      const dimensionPattern = /^\d+x\d+x\d+$/;
      if (!dimensionPattern.test(max_dimensions)) {
        throw new ApiError(
          400,
          'Dimensiones máximas deben estar en formato "AnchoxLargoxAlto" (e.g., "100x80x60")',
          'Formato de dimensiones inválido'
        );
      }
    }

    // Validate max_articles if provided
    if (max_articles !== undefined) {
      const parsed = parseInt(max_articles, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new ApiError(400, 'max_articles debe ser un entero mayor o igual a 1', 'max_articles inválido');
      }
    }

    await db.execute({
      sql: `
        UPDATE shipping_methods
        SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          type = COALESCE(?, type),
          article_type = COALESCE(?, article_type),
          max_weight = COALESCE(?, max_weight),
          max_dimensions = COALESCE(?, max_dimensions),
          max_articles = COALESCE(?, max_articles),
          estimated_delivery_days = COALESCE(?, estimated_delivery_days),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [
        name || null,
        description !== undefined ? description : null,
        type || null,
        article_type || null,
        max_weight !== undefined ? max_weight : null,
        max_dimensions !== undefined ? max_dimensions : null,
        max_articles !== undefined ? max_articles : null,
        estimated_delivery_days !== undefined ? estimated_delivery_days : null,
        is_active !== undefined ? is_active : null,
        id,
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Método de envío actualizado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// Delete a shipping method (Admin only)
const deleteShippingMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if method exists
    const existing = await db.execute({
      sql: 'SELECT id FROM shipping_methods WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Método de envío no encontrado', 'Método de envío no encontrado');
    }

    // Delete the method (zones will be cascade deleted)
    await db.execute({
      sql: 'DELETE FROM shipping_methods WHERE id = ?',
      args: [id],
    });

    res.status(200).json({
      success: true,
      message: 'Método de envío eliminado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================
// SHIPPING ZONES CRUD
// =====================================

// Get all zones for a shipping method (Admin only)
// Returns zones with their associated postal codes from the junction table
const getShippingZones = async (req, res, next) => {
  try {
    const { methodId } = req.params;

    // Get all zones for this method
    const zonesResult = await db.execute({
      sql: `
        SELECT
          sz.id,
          sz.shipping_method_id,
          sz.seller_id,
          sz.country,
          sz.cost,
          sz.created_at,
          sz.updated_at,
          u.full_name as seller_name,
          u.email as seller_email,
          u.profile_img as seller_profile_img
        FROM shipping_zones sz
        INNER JOIN users u ON sz.seller_id = u.id
        WHERE sz.shipping_method_id = ?
        ORDER BY u.full_name ASC, sz.country ASC
      `,
      args: [methodId],
    });

    // Get postal codes for all zones in this method
    const postalCodesResult = await db.execute({
      sql: `
        SELECT
          szpc.shipping_zone_id,
          pc.id,
          pc.postal_code,
          pc.city,
          pc.province,
          pc.country as pc_country
        FROM shipping_zones_postal_codes szpc
        INNER JOIN postal_codes pc ON szpc.postal_code_id = pc.id
        INNER JOIN shipping_zones sz ON szpc.shipping_zone_id = sz.id
        WHERE sz.shipping_method_id = ?
        ORDER BY pc.postal_code ASC
      `,
      args: [methodId],
    });

    // Group postal codes by zone_id
    const postalCodesByZone = {};
    for (const pc of postalCodesResult.rows) {
      if (!postalCodesByZone[pc.shipping_zone_id]) {
        postalCodesByZone[pc.shipping_zone_id] = [];
      }
      postalCodesByZone[pc.shipping_zone_id].push({
        id: pc.id,
        postal_code: pc.postal_code,
        city: pc.city,
        province: pc.province,
        country: pc.pc_country,
      });
    }

    // Attach postal codes to each zone
    const zones = zonesResult.rows.map(zone => ({
      ...zone,
      postal_codes: postalCodesByZone[zone.id] || [],
    }));

    res.status(200).json({
      success: true,
      zones,
    });
  } catch (error) {
    next(error);
  }
};

// Create a new shipping zone (Admin only)
// Accepts postal_code_ids array for the junction table
const createShippingZone = async (req, res, next) => {
  try {
    const { methodId } = req.params;
    const { seller_id, country, postal_code_ids, cost } = req.body;

    // Validate required fields
    if (!seller_id || cost === undefined || cost === null) {
      throw new ApiError(400, 'Vendedor y costo son obligatorios', 'Campos obligatorios faltantes');
    }

    // Check if shipping method exists
    const methodExists = await db.execute({
      sql: 'SELECT id, type FROM shipping_methods WHERE id = ?',
      args: [methodId],
    });

    if (methodExists.rows.length === 0) {
      throw new ApiError(404, 'Método de envío no encontrado', 'Método de envío no encontrado');
    }

    const methodType = methodExists.rows[0].type;

    // For pickup methods, cost must be 0
    if (methodType === 'pickup') {
      if (parseFloat(cost) !== 0) {
        throw new ApiError(400, 'El costo de recogida debe ser 0', 'Costo de recogida inválido');
      }
    }

    // For delivery methods, country is required
    if (methodType === 'delivery' && !country) {
      throw new ApiError(400, 'País es obligatorio para métodos de entrega', 'País requerido');
    }

    // Check if seller exists
    const sellerExists = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ? AND role = ?',
      args: [seller_id, 'seller'],
    });

    if (sellerExists.rows.length === 0) {
      throw new ApiError(404, 'Vendedor no encontrado', 'Vendedor no encontrado');
    }

    // Insert the zone
    const result = await db.execute({
      sql: `
        INSERT INTO shipping_zones (
          shipping_method_id,
          seller_id,
          country,
          cost,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [methodId, seller_id, country || null, cost],
    });

    const zoneId = result.lastInsertRowid.toString();

    // Insert postal code associations
    if (postal_code_ids && postal_code_ids.length > 0) {
      for (const pcId of postal_code_ids) {
        await db.execute({
          sql: 'INSERT INTO shipping_zones_postal_codes (shipping_zone_id, postal_code_id) VALUES (?, ?)',
          args: [zoneId, pcId],
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Zona de envío creada exitosamente',
      zoneId,
    });
  } catch (error) {
    next(error);
  }
};

// Update a shipping zone (Admin only)
const updateShippingZone = async (req, res, next) => {
  try {
    const { zoneId } = req.params;
    const { seller_id, country, postal_code_ids, cost } = req.body;

    // Check if zone exists and get method type
    const existing = await db.execute({
      sql: `
        SELECT sz.id, sm.type as method_type
        FROM shipping_zones sz
        INNER JOIN shipping_methods sm ON sz.shipping_method_id = sm.id
        WHERE sz.id = ?
      `,
      args: [zoneId],
    });

    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Zona de envío no encontrada', 'Zona de envío no encontrada');
    }

    const methodType = existing.rows[0].method_type;

    // For pickup methods, cost must be 0
    if (methodType === 'pickup' && cost !== undefined && parseFloat(cost) !== 0) {
      throw new ApiError(400, 'El costo de recogida debe ser 0', 'Costo de recogida inválido');
    }

    // Build update query dynamically
    const updates = [];
    const args = [];

    if (seller_id !== undefined) {
      updates.push('seller_id = ?');
      args.push(seller_id);
    }

    if (country !== undefined) {
      updates.push('country = ?');
      args.push(country);
    }

    if (cost !== undefined) {
      updates.push('cost = ?');
      args.push(cost);
    }

    // Always update timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    // Only execute if there are fields to update
    if (updates.length > 1) { // > 1 because updated_at is always included
      args.push(zoneId);

      await db.execute({
        sql: `
          UPDATE shipping_zones
          SET ${updates.join(', ')}
          WHERE id = ?
        `,
        args,
      });
    }

    // Update postal code associations if provided
    if (postal_code_ids !== undefined) {
      // Remove existing associations
      await db.execute({
        sql: 'DELETE FROM shipping_zones_postal_codes WHERE shipping_zone_id = ?',
        args: [zoneId],
      });

      // Insert new associations
      if (postal_code_ids && postal_code_ids.length > 0) {
        for (const pcId of postal_code_ids) {
          await db.execute({
            sql: 'INSERT INTO shipping_zones_postal_codes (shipping_zone_id, postal_code_id) VALUES (?, ?)',
            args: [zoneId, pcId],
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Zona de envío actualizada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// Delete a shipping zone (Admin only)
const deleteShippingZone = async (req, res, next) => {
  try {
    const { zoneId } = req.params;

    // Check if zone exists
    const existing = await db.execute({
      sql: 'SELECT id FROM shipping_zones WHERE id = ?',
      args: [zoneId],
    });

    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Zona de envío no encontrada', 'Zona de envío no encontrada');
    }

    // Junction table records are auto-deleted via ON DELETE CASCADE
    await db.execute({
      sql: 'DELETE FROM shipping_zones WHERE id = ?',
      args: [zoneId],
    });

    res.status(200).json({
      success: true,
      message: 'Zona de envío eliminada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================
// BUYER-FACING ENDPOINTS
// =====================================

// Get available shipping methods for a product
const getAvailableShipping = async (req, res, next) => {
  try {
    const { productId, productType, country, postalCode } = req.query;

    // Validate required params
    if (!productId || !productType) {
      throw new ApiError(400, 'ID y tipo de producto son obligatorios', 'Parámetros faltantes');
    }

    if (!['art', 'others'].includes(productType)) {
      throw new ApiError(400, 'Tipo de producto debe ser "art" o "others"', 'Tipo inválido');
    }

    // Get product details including seller_id, weight, and dimensions
    let productQuery;
    if (productType === 'art') {
      productQuery = 'SELECT seller_id, weight, dimensions FROM art WHERE id = ? AND visible = 1';
    } else {
      productQuery = 'SELECT seller_id, weight, dimensions FROM others WHERE id = ? AND visible = 1';
    }

    const productResult = await db.execute({
      sql: productQuery,
      args: [productId],
    });

    if (productResult.rows.length === 0) {
      throw new ApiError(404, 'Producto no encontrado', 'Producto no encontrado');
    }

    const product = productResult.rows[0];
    const sellerId = product.seller_id;
    const productWeight = product.weight;
    const productDimensions = product.dimensions;

    // Helper function to check if product fits within shipping method limits
    const checkProductFits = (maxWeight, maxDimensions) => {
      // Check weight
      if (maxWeight && productWeight && productWeight > maxWeight) {
        return false;
      }

      // Check dimensions (sorted comparison: largest to largest, middle to middle, smallest to smallest)
      if (maxDimensions && productDimensions) {
        const productDims = productDimensions
          .split('x')
          .map(Number)
          .sort((a, b) => b - a);
        const maxDims = maxDimensions
          .split('x')
          .map(Number)
          .sort((a, b) => b - a);

        for (let i = 0; i < 3; i++) {
          if (productDims[i] > maxDims[i]) {
            return false;
          }
        }
      }

      return true;
    };

    // Get pickup methods for this seller
    const pickupResult = await db.execute({
      sql: `
        SELECT DISTINCT
          sm.id,
          sm.name,
          sm.description,
          sm.type,
          sm.article_type,
          sm.max_weight,
          sm.max_dimensions,
          sm.max_articles,
          sm.estimated_delivery_days,
          sz.cost,
          u.pickup_address,
          u.pickup_city,
          u.pickup_postal_code,
          u.pickup_country,
          u.pickup_instructions
        FROM shipping_methods sm
        INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
        INNER JOIN users u ON sz.seller_id = u.id
        WHERE sm.type = 'pickup'
          AND sm.is_active = 1
          AND (sm.article_type = 'all' OR sm.article_type = ?)
          AND sz.seller_id = ?
      `,
      args: [productType, sellerId],
    });

    const pickupMethods = pickupResult.rows
      .filter((method) => checkProductFits(method.max_weight, method.max_dimensions))
      .map((method) => ({
        id: method.id,
        name: method.name,
        description: method.description,
        type: method.type,
        cost: method.cost,
        max_articles: method.max_articles,
        estimated_delivery_days: method.estimated_delivery_days,
        pickup_address: method.pickup_address,
        pickup_city: method.pickup_city,
        pickup_postal_code: method.pickup_postal_code,
        pickup_country: method.pickup_country,
        pickup_instructions: method.pickup_instructions,
      }));

    // Get delivery methods
    let deliveryMethods = [];

    if (country) {
      // Validate postal code if provided
      if (postalCode) {
        const isValid = postcodeValidator(postalCode, country);
        if (!isValid) {
          throw new ApiError(400, `Código postal inválido para ${country}`, 'Código postal inválido');
        }
      }

      // Find delivery methods for this seller+country.
      // A zone matches if:
      //   1. It has no postal codes (applies to entire country), OR
      //   2. It has postal codes and one of them matches the buyer's postal code
      //
      // We prefer a specific postal code match over a country-wide zone.
      if (postalCode) {
        // Query zones that either have a matching postal code or have no postal codes (country-wide)
        const deliveryResult = await db.execute({
          sql: `
            SELECT
              sm.id,
              sm.name,
              sm.description,
              sm.type,
              sm.article_type,
              sm.max_weight,
              sm.max_dimensions,
              sm.max_articles,
              sm.estimated_delivery_days,
              sz.cost,
              sz.id as zone_id,
              pc.postal_code as matched_postal_code
            FROM shipping_methods sm
            INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
            LEFT JOIN shipping_zones_postal_codes szpc ON sz.id = szpc.shipping_zone_id
            LEFT JOIN postal_codes pc ON szpc.postal_code_id = pc.id AND pc.postal_code = ?
            WHERE sm.type = 'delivery'
              AND sm.is_active = 1
              AND (sm.article_type = 'all' OR sm.article_type = ?)
              AND sz.seller_id = ?
              AND sz.country = ?
              AND (
                szpc.id IS NULL
                OR pc.id IS NOT NULL
              )
          `,
          args: [postalCode, productType, sellerId, country],
        });

        // Check which zones have postal codes at all (to distinguish country-wide from specific)
        const zoneIds = [...new Set(deliveryResult.rows.map(r => r.zone_id))];
        const zoneHasPostalCodes = {};

        if (zoneIds.length > 0) {
          for (const zid of zoneIds) {
            const countResult = await db.execute({
              sql: 'SELECT COUNT(*) as cnt FROM shipping_zones_postal_codes WHERE shipping_zone_id = ?',
              args: [zid],
            });
            zoneHasPostalCodes[zid] = countResult.rows[0].cnt > 0;
          }
        }

        // Group by method, preferring specific postal code match over country-wide
        const groupedByMethod = {};
        for (const row of deliveryResult.rows) {
          const hasSpecificMatch = row.matched_postal_code !== null;
          const isCountryWide = !zoneHasPostalCodes[row.zone_id];

          if (!groupedByMethod[row.id]) {
            groupedByMethod[row.id] = { ...row, _isSpecific: hasSpecificMatch };
          } else if (hasSpecificMatch && !groupedByMethod[row.id]._isSpecific) {
            // Prefer specific match over country-wide
            groupedByMethod[row.id] = { ...row, _isSpecific: true };
          }
        }

        deliveryMethods = Object.values(groupedByMethod)
          .filter((method) => checkProductFits(method.max_weight, method.max_dimensions))
          .map((method) => ({
            id: method.id,
            name: method.name,
            description: method.description,
            type: method.type,
            cost: method.cost,
            max_articles: method.max_articles,
            estimated_delivery_days: method.estimated_delivery_days,
          }));
      } else {
        // No postal code provided — only return country-wide zones (zones with no postal codes)
        const deliveryResult = await db.execute({
          sql: `
            SELECT DISTINCT
              sm.id,
              sm.name,
              sm.description,
              sm.type,
              sm.article_type,
              sm.max_weight,
              sm.max_dimensions,
              sm.max_articles,
              sm.estimated_delivery_days,
              sz.cost
            FROM shipping_methods sm
            INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
            WHERE sm.type = 'delivery'
              AND sm.is_active = 1
              AND (sm.article_type = 'all' OR sm.article_type = ?)
              AND sz.seller_id = ?
              AND sz.country = ?
              AND NOT EXISTS (
                SELECT 1 FROM shipping_zones_postal_codes szpc
                WHERE szpc.shipping_zone_id = sz.id
              )
          `,
          args: [productType, sellerId, country],
        });

        deliveryMethods = deliveryResult.rows
          .filter((method) => checkProductFits(method.max_weight, method.max_dimensions))
          .map((method) => ({
            id: method.id,
            name: method.name,
            description: method.description,
            type: method.type,
            cost: method.cost,
            max_articles: method.max_articles,
            estimated_delivery_days: method.estimated_delivery_days,
          }));
      }
    }

    res.status(200).json({
      success: true,
      pickup: pickupMethods,
      delivery: deliveryMethods,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Shipping Methods
  getAllShippingMethods,
  getShippingMethodById,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  // Shipping Zones
  getShippingZones,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
  // Buyer-facing
  getAvailableShipping,
};
