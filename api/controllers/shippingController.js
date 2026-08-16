const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { postcodeValidator } = require('postcode-validator');
const { resolveShippingOptions } = require('../services/shipping/zoneResolver');

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
          sz.product_id,
          sz.product_type,
          sz.created_at,
          sz.updated_at,
          u.full_name as seller_name,
          u.email as seller_email,
          u.profile_img as seller_profile_img,
          CASE
            WHEN sz.product_type = 'art' THEN a.name
            WHEN sz.product_type = 'other' THEN o.name
            ELSE NULL
          END as product_name
        FROM shipping_zones sz
        INNER JOIN users u ON sz.seller_id = u.id
        LEFT JOIN art a ON sz.product_id = a.id AND sz.product_type = 'art'
        LEFT JOIN others o ON sz.product_id = o.id AND sz.product_type = 'other'
        WHERE sz.shipping_method_id = ?
        ORDER BY u.full_name ASC, sz.country ASC
      `,
      args: [methodId],
    });

    // Get postal refs for all zones in this method
    const refsResult = await db.execute({
      sql: `
        SELECT
          szpc.shipping_zone_id,
          szpc.ref_type,
          szpc.postal_code_id,
          szpc.ref_value,
          pc.postal_code,
          pc.city,
          pc.province,
          pc.country as pc_country
        FROM shipping_zones_postal_codes szpc
        LEFT JOIN postal_codes pc ON szpc.postal_code_id = pc.id AND szpc.ref_type = 'postal_code'
        INNER JOIN shipping_zones sz ON szpc.shipping_zone_id = sz.id
        WHERE sz.shipping_method_id = ?
        ORDER BY szpc.ref_type ASC, pc.postal_code ASC
      `,
      args: [methodId],
    });

    // Group refs by zone_id
    const refsByZone = {};
    for (const row of refsResult.rows) {
      if (!refsByZone[row.shipping_zone_id]) {
        refsByZone[row.shipping_zone_id] = [];
      }
      if (row.ref_type === 'postal_code') {
        refsByZone[row.shipping_zone_id].push({
          ref_type: 'postal_code',
          id: row.postal_code_id,
          postal_code: row.postal_code,
          city: row.city,
          province: row.province,
          country: row.pc_country,
        });
      } else {
        refsByZone[row.shipping_zone_id].push({
          ref_type: row.ref_type,
          ref_value: row.ref_value,
        });
      }
    }

    // Attach postal refs to each zone
    const zones = zonesResult.rows.map(zone => ({
      ...zone,
      postal_refs: refsByZone[zone.id] || [],
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
// Accepts postal_refs array for the junction table
const createShippingZone = async (req, res, next) => {
  try {
    const { methodId } = req.params;
    const { seller_id, country, postal_refs, cost, product_id, product_type } = req.body;

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
          product_id,
          product_type,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [methodId, seller_id, country || null, cost, product_id || null, product_type || null],
    });

    const zoneId = result.lastInsertRowid.toString();

    // Insert postal ref associations
    if (postal_refs && postal_refs.length > 0) {
      for (const ref of postal_refs) {
        await db.execute({
          sql: 'INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value) VALUES (?, ?, ?, ?)',
          args: [
            zoneId,
            ref.ref_type || 'postal_code',
            ref.ref_type === 'postal_code' ? (ref.postal_code_id || ref.id) : null,
            ref.ref_type !== 'postal_code' ? ref.ref_value : null,
          ],
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
    const { seller_id, country, postal_refs, cost, product_id, product_type } = req.body;

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

    // product_id and product_type: always sent together (or both null to clear)
    if (product_id !== undefined) {
      updates.push('product_id = ?');
      args.push(product_id || null);
    }

    if (product_type !== undefined) {
      updates.push('product_type = ?');
      args.push(product_type || null);
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

    // Update postal ref associations if provided
    if (postal_refs !== undefined) {
      // Remove existing associations
      await db.execute({
        sql: 'DELETE FROM shipping_zones_postal_codes WHERE shipping_zone_id = ?',
        args: [zoneId],
      });

      // Insert new associations
      if (postal_refs && postal_refs.length > 0) {
        for (const ref of postal_refs) {
          await db.execute({
            sql: 'INSERT INTO shipping_zones_postal_codes (shipping_zone_id, ref_type, postal_code_id, ref_value) VALUES (?, ?, ?, ?)',
            args: [
              zoneId,
              ref.ref_type || 'postal_code',
              ref.ref_type === 'postal_code' ? (ref.postal_code_id || ref.id) : null,
              ref.ref_type !== 'postal_code' ? ref.ref_value : null,
            ],
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
//
// Thin wrapper over the shared zone resolver: this endpoint owns the HTTP
// contract (its own 'art' | 'others' vocabulary, postal code format checks and
// the snake_case response shape) and nothing else. Which zone applies to which
// product and destination lives in one place only — see
// api/services/shipping/zoneResolver.js for why.
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

    // Postal code format is an input concern, so it stays on the HTTP edge.
    if (country && postalCode) {
      const isValid = postcodeValidator(postalCode, country);
      if (!isValid) {
        throw new ApiError(400, `Código postal inválido para ${country}`, 'Código postal inválido');
      }
    }

    const { pickup, delivery } = await resolveShippingOptions({
      productId,
      productType,
      country,
      postalCode,
    });

    res.status(200).json({
      success: true,
      pickup: pickup.map((option) => ({
        id: option.methodId,
        name: option.name,
        description: option.description,
        type: option.methodType,
        cost: option.cost,
        max_articles: option.maxArticles,
        estimated_delivery_days: option.estimatedDeliveryDays,
        pickup_address: option.pickupAddress,
        pickup_city: option.pickupCity,
        pickup_postal_code: option.pickupPostalCode,
        pickup_country: option.pickupCountry,
        pickup_instructions: option.pickupInstructions,
      })),
      delivery: delivery.map((option) => ({
        id: option.methodId,
        name: option.name,
        description: option.description,
        type: option.methodType,
        cost: option.cost,
        max_articles: option.maxArticles,
        estimated_delivery_days: option.estimatedDeliveryDays,
      })),
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
