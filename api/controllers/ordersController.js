const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendPurchaseConfirmation } = require('../services/emailService');

// Create new order
const createOrder = async (req, res, next) => {
  try {
    const { items } = req.body;
    const buyer_id = req.user.id;

    // Validate input - items should be array of { type: 'art' | 'other', id, variantId? }
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    // Separate art and others items
    const artItems = items.filter(item => item.type === 'art');
    const othersItems = items.filter(item => item.type === 'other');

    // Fetch art products
    const artProducts = [];
    if (artItems.length > 0) {
      const artPlaceholders = artItems.map(() => '?').join(',');
      const artIds = artItems.map(item => item.id);
      const artResult = await db.execute({
        sql: `SELECT * FROM art WHERE id IN (${artPlaceholders})`,
        args: artIds,
      });

      if (artResult.rows.length !== artItems.length) {
        throw new ApiError(404, 'Una o más obras de arte no fueron encontradas', 'Obras no encontradas');
      }

      artProducts.push(...artResult.rows);

      // Check if any art is already sold
      const soldArt = artProducts.filter(p => p.is_sold === 1);
      if (soldArt.length > 0) {
        throw new ApiError(400, `La obra ${soldArt[0].name} ya ha sido vendida`, 'Obra no disponible');
      }
    }

    // Fetch others products and their variations
    const othersProducts = [];
    const othersVariations = [];
    if (othersItems.length > 0) {
      const othersPlaceholders = othersItems.map(() => '?').join(',');
      const othersIds = othersItems.map(item => item.id);
      const othersResult = await db.execute({
        sql: `SELECT * FROM others WHERE id IN (${othersPlaceholders})`,
        args: othersIds,
      });

      if (othersResult.rows.length !== othersItems.length) {
        throw new ApiError(404, 'Uno o más productos no fueron encontrados', 'Productos no encontrados');
      }

      othersProducts.push(...othersResult.rows);

      // Check if any other product is sold
      const soldOthers = othersProducts.filter(p => p.is_sold === 1);
      if (soldOthers.length > 0) {
        throw new ApiError(400, `El producto ${soldOthers[0].name} ya ha sido vendido`, 'Producto no disponible');
      }

      // Fetch variations and validate stock
      for (const item of othersItems) {
        const varResult = await db.execute({
          sql: 'SELECT * FROM other_vars WHERE id = ? AND other_id = ?',
          args: [item.variantId, item.id],
        });

        if (varResult.rows.length === 0) {
          throw new ApiError(404, 'Variación no encontrada', 'Variación no encontrada');
        }

        const variant = varResult.rows[0];

        // Count how many times this variant is in the order
        const variantQuantity = othersItems.filter(
          i => i.id === item.id && i.variantId === item.variantId
        ).length;

        if (variant.stock < variantQuantity) {
          const product = othersProducts.find(p => p.id === item.id);
          throw new ApiError(
            400,
            `Stock insuficiente para ${product.name}. Disponible: ${variant.stock}, solicitado: ${variantQuantity}`,
            'Stock insuficiente'
          );
        }

        othersVariations.push(variant);
      }
    }

    // Calculate total price
    let totalPrice = 0;
    totalPrice += artProducts.reduce((sum, product) => sum + product.price, 0);
    totalPrice += othersProducts.reduce((sum, product) => sum + product.price, 0);

    // Create order
    const orderResult = await db.execute({
      sql: 'INSERT INTO orders (buyer_id, total_price, status) VALUES (?, ?, ?)',
      args: [buyer_id, totalPrice, 'completed'],
    });

    const orderId = orderResult.lastInsertRowid;

    // Create art order items and mark as sold
    const processedArt = {};
    for (const item of artItems) {
      const product = artProducts.find(p => p.id === item.id);

      // Insert art order item
      await db.execute({
        sql: 'INSERT INTO art_order_items (order_id, art_id, price_at_purchase) VALUES (?, ?, ?)',
        args: [orderId, product.id, product.price],
      });

      // Mark as sold (once per unique art product)
      if (!processedArt[product.id]) {
        processedArt[product.id] = true;
        await db.execute({
          sql: 'UPDATE art SET is_sold = 1 WHERE id = ?',
          args: [product.id],
        });
      }
    }

    // Create others order items and update stock
    const processedOthersVariants = {};
    for (const item of othersItems) {
      const product = othersProducts.find(p => p.id === item.id);
      const variant = othersVariations.find(v => v.id === item.variantId);

      // Insert other order item
      await db.execute({
        sql: 'INSERT INTO other_order_items (order_id, other_id, other_var_id, price_at_purchase) VALUES (?, ?, ?, ?)',
        args: [orderId, product.id, variant.id, product.price],
      });

      // Track variant stock updates
      if (!processedOthersVariants[variant.id]) {
        processedOthersVariants[variant.id] = 0;
      }
      processedOthersVariants[variant.id]++;
    }

    // Update stock for each variant
    for (const [variantId, quantity] of Object.entries(processedOthersVariants)) {
      const variant = othersVariations.find(v => v.id === parseInt(variantId));
      const newStock = variant.stock - quantity;

      await db.execute({
        sql: 'UPDATE other_vars SET stock = ? WHERE id = ?',
        args: [newStock, variantId],
      });

      // Check if all variants for this product are out of stock
      const allVariantsResult = await db.execute({
        sql: 'SELECT SUM(stock) as total_stock FROM other_vars WHERE other_id = ?',
        args: [variant.other_id],
      });

      if (allVariantsResult.rows[0]?.total_stock === 0) {
        // Mark product as sold
        await db.execute({
          sql: 'UPDATE others SET is_sold = 1 WHERE id = ?',
          args: [variant.other_id],
        });
      }
    }

    // Get complete order details
    const orderDetailsResult = await db.execute({
      sql: `
        SELECT
          o.*,
          u.email as buyer_email
        FROM orders o
        LEFT JOIN users u ON o.buyer_id = u.id
        WHERE o.id = ?
      `,
      args: [orderId],
    });

    // Get art order items
    const artOrderItemsResult = await db.execute({
      sql: `
        SELECT
          aoi.*,
          a.name,
          a.type,
          a.basename,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        WHERE aoi.order_id = ?
      `,
      args: [orderId],
    });

    // Get others order items
    const othersOrderItemsResult = await db.execute({
      sql: `
        SELECT
          ooi.*,
          o.name,
          o.basename,
          ov.key as variant_key,
          'other' as product_type
        FROM other_order_items ooi
        LEFT JOIN others o ON ooi.other_id = o.id
        LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
        WHERE ooi.order_id = ?
      `,
      args: [orderId],
    });

    const order = orderDetailsResult.rows[0];
    order.items = [...artOrderItemsResult.rows, ...othersOrderItemsResult.rows];

    // Send purchase confirmation email
    try {
      await sendPurchaseConfirmation(req.user.email, {
        orderId,
        items: order.items,
        totalPrice,
        buyerEmail: req.user.email,
      });
    } catch (emailError) {
      console.error('Failed to send purchase confirmation email:', emailError);
      // Don't fail the order if email fails
    }

    res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// Get all orders for logged-in user
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const ordersResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC',
      args: [userId],
    });

    // Get items for each order
    const orders = [];
    for (const order of ordersResult.rows) {
      // Get art order items
      const artItemsResult = await db.execute({
        sql: `
          SELECT
            aoi.*,
            a.name,
            a.type,
            a.basename,
            'art' as product_type
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          WHERE aoi.order_id = ?
        `,
        args: [order.id],
      });

      // Get others order items
      const othersItemsResult = await db.execute({
        sql: `
          SELECT
            ooi.*,
            o.name,
            o.basename,
            ov.key as variant_key,
            'other' as product_type
          FROM other_order_items ooi
          LEFT JOIN others o ON ooi.other_id = o.id
          LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
          WHERE ooi.order_id = ?
        `,
        args: [order.id],
      });

      orders.push({
        ...order,
        items: [...artItemsResult.rows, ...othersItemsResult.rows],
      });
    }

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

// Get single order by ID (must be the buyer)
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const orderResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE id = ?',
      args: [id],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Check if user is the buyer
    if (order.buyer_id !== userId) {
      throw new ApiError(403, 'Solo puedes ver tus propios pedidos', 'Acceso denegado');
    }

    // Get art order items
    const artItemsResult = await db.execute({
      sql: `
        SELECT
          aoi.*,
          a.name,
          a.description,
          a.type,
          a.basename,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        WHERE aoi.order_id = ?
      `,
      args: [id],
    });

    // Get others order items
    const othersItemsResult = await db.execute({
      sql: `
        SELECT
          ooi.*,
          o.name,
          o.description,
          o.basename,
          ov.key as variant_key,
          'other' as product_type
        FROM other_order_items ooi
        LEFT JOIN others o ON ooi.other_id = o.id
        LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
        WHERE ooi.order_id = ?
      `,
      args: [id],
    });

    order.items = [...artItemsResult.rows, ...othersItemsResult.rows];

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
};
