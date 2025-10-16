const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendPurchaseConfirmation } = require('../services/emailService');

// Create new order
const createOrder = async (req, res, next) => {
  try {
    const { productIds } = req.body;
    const buyer_id = req.user.id;

    // Validate input
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw new ApiError(400, 'productIds debe ser un array no vacío', 'Solicitud inválida');
    }

    // Get products and verify they're available
    const placeholders = productIds.map(() => '?').join(',');
    const productsResult = await db.execute({
      sql: `SELECT * FROM products WHERE id IN (${placeholders})`,
      args: productIds,
    });

    if (productsResult.rows.length !== productIds.length) {
      throw new ApiError(404, 'Una o más obras no fueron encontradas', 'Obras no encontradas');
    }

    // Check if any product is already sold
    const soldProducts = productsResult.rows.filter(p => p.is_sold === 1);
    if (soldProducts.length > 0) {
      throw new ApiError(400, `La obra ${soldProducts[0].name} ya ha sido vendida`, 'Obra no disponible');
    }

    // Calculate total price
    const totalPrice = productsResult.rows.reduce((sum, product) => sum + product.price, 0);

    // Begin transaction-like operations
    // Create order
    const orderResult = await db.execute({
      sql: 'INSERT INTO orders (buyer_id, total_price, status) VALUES (?, ?, ?)',
      args: [buyer_id, totalPrice, 'completed'],
    });

    const orderId = orderResult.lastInsertRowid;

    // Create order items and mark products as sold
    for (const product of productsResult.rows) {
      // Insert order item
      await db.execute({
        sql: 'INSERT INTO order_items (order_id, product_id, price_at_purchase) VALUES (?, ?, ?)',
        args: [orderId, product.id, product.price],
      });

      // Mark product as sold
      await db.execute({
        sql: 'UPDATE products SET is_sold = 1 WHERE id = ?',
        args: [product.id],
      });
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

    const orderItemsResult = await db.execute({
      sql: `
        SELECT
          oi.*,
          p.name,
          p.type,
          p.basename
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `,
      args: [orderId],
    });

    const order = orderDetailsResult.rows[0];
    order.items = orderItemsResult.rows;

    // Send purchase confirmation email
    try {
      await sendPurchaseConfirmation(req.user.email, {
        orderId,
        items: orderItemsResult.rows,
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
      const itemsResult = await db.execute({
        sql: `
          SELECT
            oi.*,
            p.name,
            p.type,
            p.basename
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `,
        args: [order.id],
      });

      orders.push({
        ...order,
        items: itemsResult.rows,
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

    // Get order items
    const itemsResult = await db.execute({
      sql: `
        SELECT
          oi.*,
          p.name,
          p.description,
          p.type,
          p.basename
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `,
      args: [id],
    });

    order.items = itemsResult.rows;

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
