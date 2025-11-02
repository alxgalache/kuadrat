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
        max_weight,
        max_dimensions,
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
          max_weight,
          max_dimensions,
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
      max_weight,
      max_dimensions,
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
          max_weight,
          max_dimensions,
          estimated_delivery_days,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [
        name,
        description || null,
        type,
        max_weight || null,
        max_dimensions || null,
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
      max_weight,
      max_dimensions,
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

    await db.execute({
      sql: `
        UPDATE shipping_methods
        SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          type = COALESCE(?, type),
          max_weight = COALESCE(?, max_weight),
          max_dimensions = COALESCE(?, max_dimensions),
          estimated_delivery_days = COALESCE(?, estimated_delivery_days),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [
        name || null,
        description !== undefined ? description : null,
        type || null,
        max_weight !== undefined ? max_weight : null,
        max_dimensions !== undefined ? max_dimensions : null,
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
const getShippingZones = async (req, res, next) => {
  try {
    const { methodId } = req.params;

    const result = await db.execute({
      sql: `
        SELECT
          sz.id,
          sz.shipping_method_id,
          sz.seller_id,
          sz.country,
          sz.postal_code,
          sz.cost,
          sz.created_at,
          sz.updated_at,
          u.full_name as seller_name,
          u.email as seller_email,
          u.profile_img as seller_profile_img
        FROM shipping_zones sz
        INNER JOIN users u ON sz.seller_id = u.id
        WHERE sz.shipping_method_id = ?
        ORDER BY u.full_name ASC, sz.country ASC, sz.postal_code ASC
      `,
      args: [methodId],
    });

    res.status(200).json({
      success: true,
      zones: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

// Create a new shipping zone (Admin only)
const createShippingZone = async (req, res, next) => {
  try {
    const { methodId } = req.params;
    const { seller_id, country, postal_code, cost } = req.body;

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
    // Country and postal_code are optional - if postal_code is empty, applies to whole country
    if (methodType === 'pickup') {
      if (parseFloat(cost) !== 0) {
        throw new ApiError(400, 'El costo de recogida debe ser 0', 'Costo de recogida inválido');
      }
      // Validate postal code format if both country and postal_code are provided
      if (country && postal_code) {
        const isValid = postcodeValidator(postal_code, country);
        if (!isValid) {
          throw new ApiError(
            400,
            `Código postal inválido para ${country}`,
            'Código postal inválido'
          );
        }
      }
    }

    // For delivery methods, validate country and postal code
    if (methodType === 'delivery') {
      if (!country) {
        throw new ApiError(400, 'País es obligatorio para métodos de entrega', 'País requerido');
      }

      // Validate postal code format if provided
      if (postal_code) {
        const isValid = postcodeValidator(postal_code, country);
        if (!isValid) {
          throw new ApiError(
            400,
            `Código postal inválido para ${country}`,
            'Código postal inválido'
          );
        }
      }
    }

    // Check if seller exists
    const sellerExists = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ? AND role = ?',
      args: [seller_id, 'seller'],
    });

    if (sellerExists.rows.length === 0) {
      throw new ApiError(404, 'Vendedor no encontrado', 'Vendedor no encontrado');
    }

    // Check for duplicate zone
    const duplicate = await db.execute({
      sql: `
        SELECT id FROM shipping_zones
        WHERE shipping_method_id = ?
          AND seller_id = ?
          AND (country = ? OR (country IS NULL AND ? IS NULL))
          AND (postal_code = ? OR (postal_code IS NULL AND ? IS NULL))
      `,
      args: [
        methodId,
        seller_id,
        country || null,
        country || null,
        postal_code || null,
        postal_code || null,
      ],
    });

    if (duplicate.rows.length > 0) {
      throw new ApiError(409, 'Esta zona de envío ya existe', 'Zona de envío duplicada');
    }

    const result = await db.execute({
      sql: `
        INSERT INTO shipping_zones (
          shipping_method_id,
          seller_id,
          country,
          postal_code,
          cost,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [methodId, seller_id, country || null, postal_code || null, cost],
    });

    res.status(201).json({
      success: true,
      message: 'Zona de envío creada exitosamente',
      zoneId: result.lastInsertRowid.toString(),
    });
  } catch (error) {
    next(error);
  }
};

// Update a shipping zone (Admin only)
const updateShippingZone = async (req, res, next) => {
  try {
    const { zoneId } = req.params;
    const { seller_id, country, postal_code, cost } = req.body;

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

    // Validate postal code if provided for delivery
    if (methodType === 'delivery' && postal_code && country) {
      const isValid = postcodeValidator(postal_code, country);
      if (!isValid) {
        throw new ApiError(400, `Código postal inválido para ${country}`, 'Código postal inválido');
      }
    }

    await db.execute({
      sql: `
        UPDATE shipping_zones
        SET
          seller_id = COALESCE(?, seller_id),
          country = COALESCE(?, country),
          postal_code = COALESCE(?, postal_code),
          cost = COALESCE(?, cost),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [
        seller_id || null,
        country !== undefined ? country : null,
        postal_code !== undefined ? postal_code : null,
        cost !== undefined ? cost : null,
        zoneId,
      ],
    });

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
          sm.max_weight,
          sm.max_dimensions,
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
          AND sz.seller_id = ?
      `,
      args: [sellerId],
    });

    const pickupMethods = pickupResult.rows
      .filter((method) => checkProductFits(method.max_weight, method.max_dimensions))
      .map((method) => ({
        id: method.id,
        name: method.name,
        description: method.description,
        type: method.type,
        cost: method.cost,
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

      // First, try to find postal code specific rate
      let deliveryQuery;
      let deliveryArgs;

      if (postalCode) {
        deliveryQuery = `
          SELECT DISTINCT
            sm.id,
            sm.name,
            sm.description,
            sm.type,
            sm.max_weight,
            sm.max_dimensions,
            sm.estimated_delivery_days,
            sz.cost,
            sz.postal_code
          FROM shipping_methods sm
          INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
          WHERE sm.type = 'delivery'
            AND sm.is_active = 1
            AND sz.seller_id = ?
            AND sz.country = ?
            AND (sz.postal_code = ? OR sz.postal_code IS NULL)
          ORDER BY sz.postal_code DESC
        `;
        deliveryArgs = [sellerId, country, postalCode];
      } else {
        deliveryQuery = `
          SELECT DISTINCT
            sm.id,
            sm.name,
            sm.description,
            sm.type,
            sm.max_weight,
            sm.max_dimensions,
            sm.estimated_delivery_days,
            sz.cost,
            sz.postal_code
          FROM shipping_methods sm
          INNER JOIN shipping_zones sz ON sm.id = sz.shipping_method_id
          WHERE sm.type = 'delivery'
            AND sm.is_active = 1
            AND sz.seller_id = ?
            AND sz.country = ?
            AND sz.postal_code IS NULL
        `;
        deliveryArgs = [sellerId, country];
      }

      const deliveryResult = await db.execute({
        sql: deliveryQuery,
        args: deliveryArgs,
      });

      // Filter by postal code specificity (prefer postal code match over country-wide)
      const groupedByMethod = {};
      deliveryResult.rows.forEach((row) => {
        if (!groupedByMethod[row.id] || row.postal_code) {
          groupedByMethod[row.id] = row;
        }
      });

      deliveryMethods = Object.values(groupedByMethod)
        .filter((method) => checkProductFits(method.max_weight, method.max_dimensions))
        .map((method) => ({
          id: method.id,
          name: method.name,
          description: method.description,
          type: method.type,
          cost: method.cost,
          estimated_delivery_days: method.estimated_delivery_days,
        }));
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
