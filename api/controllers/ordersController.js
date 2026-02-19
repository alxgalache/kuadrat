const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendPurchaseConfirmation, sendPaymentConfirmation, sendTrackingUpdateEmail, sendItemsSentEmail } = require('../services/emailService');
const { sendBuyerToSellerContactEmail } = require('../services/emailService');
const { updateRevolutOrder } = require('../services/revolutService');
const { updatePaymentIntent, findOrCreateCustomer } = require('../services/stripeService');
const crypto = require('crypto');

// Public site base URL used for product images/links in Revolut payload
const SITE_BASE_URL = process.env.SITE_PUBLIC_BASE_URL || 'https://pre.140d.art';
const SITE_API_URL = process.env.SITE_API_BASE_URL || 'https://api.pre.140d.art';
const REV_LOCATION_ID = process.env.REVOLUT_LOCATION_ID || null;

// Helper to convert rich-text / HTML descriptions from DB into plain text
// suitable for sending to external providers like Revolut.
// - Strips all HTML tags
// - Converts common block/line-break tags into spaces
// - Normalises consecutive whitespace to a single space
// - Trims leading/trailing whitespace
// - Optionally truncates to maxLength characters
const htmlToPlainText = (value, maxLength = 0) => {
  if (!value) return '';

  let text = value.toString();

  // Replace explicit line breaks with spaces (we avoid real newlines to keep payload compact)
  text = text.replace(/<br\s*\/?>/gi, ' ');

  // Insert spaces at the end of common block-level elements so words don't get concatenated
  text = text.replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|tr|td|th)>/gi, ' ');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Normalise whitespace
  text = text.replace(/\s+/g, ' ').trim();

  if (maxLength && typeof maxLength === 'number' && maxLength > 0 && text.length > maxLength) {
    return text.slice(0, maxLength);
  }

  return text;
};

// Persist order in DB with status 'pending' for an existing Revolut order
// and PATCH the Revolut order with full details (customer, line_items, shipping).
// POST /api/orders/placeOrder
const placeOrder = async (req, res, next) => {
  try {
    const {
      items,
      guest_email,
      email,
      phone,
      delivery_address,
      invoicing_address,
      customer,
      revolut_order_id,
      revolut_order_token,
      stripe_payment_intent_id,
      payment_provider,
      currency = 'EUR',
      description = 'Pedido realizado en 140d Galería de Arte',
    } = req.body || {};

    const VAT_ES = parseFloat(process.env.TAX_VAT_ES || 0.21);

    // Determine provider: explicit field > env var > default
    const provider = payment_provider || process.env.PAYMENT_PROVIDER || 'revolut';

    if (provider === 'revolut' && !revolut_order_id) {
      throw new ApiError(400, 'Falta revolut_order_id en la solicitud', 'Solicitud inválida');
    }
    if (provider === 'stripe' && !stripe_payment_intent_id) {
      throw new ApiError(400, 'Falta stripe_payment_intent_id en la solicitud', 'Solicitud inválida');
    }

    // Orders are always treated as guest orders; validate buyer email + optional phone
    const buyerEmail = (email || guest_email || (customer && customer.email) || '').trim();
    const buyerPhone = phone || (customer && customer.phone) || null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!buyerEmail || !emailRegex.test(buyerEmail)) {
      throw new ApiError(400, 'Se requiere un email válido para completar el pedido', 'Email inválido');
    }

    // Validate input - items should be array of { type: 'art' | 'other', id, variantId?, shipping? }
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    const itemsWithoutShipping = items.filter((item) => !item.shipping);
    if (itemsWithoutShipping.length > 0) {
      throw new ApiError(400, 'Todos los productos deben tener información de envío', 'Información de envío faltante');
    }

    // Separate art and others items
    const artItems = items.filter((item) => item.type === 'art');
    const othersItems = items.filter((item) => item.type === 'other');

    // Fetch art products
    const artProducts = [];
    if (artItems.length > 0) {
      const artPlaceholders = artItems.map(() => '?').join(',');
      const artIds = artItems.map((item) => item.id);
      const artResult = await db.execute({
        sql: `SELECT * FROM art WHERE id IN (${artPlaceholders})`,
        args: artIds,
      });
      if (artResult.rows.length !== artItems.length) {
        throw new ApiError(404, 'Una o más obras de arte no fueron encontradas', 'Obras no encontradas');
      }
      artProducts.push(...artResult.rows);
      const soldArt = artProducts.filter((p) => p.is_sold === 1);
      if (soldArt.length > 0) {
        throw new ApiError(400, `La obra ${soldArt[0].name} ya ha sido vendida`, 'Obra no disponible');
      }
    }

    // Fetch others products and their variations
    const othersProducts = [];
    const othersVariations = [];
    if (othersItems.length > 0) {
      const uniqueOthersIds = [...new Set(othersItems.map((item) => item.id))];
      const othersPlaceholders = uniqueOthersIds.map(() => '?').join(',');
      const othersResult = await db.execute({
        sql: `SELECT * FROM others WHERE id IN (${othersPlaceholders})`,
        args: uniqueOthersIds,
      });
      if (othersResult.rows.length !== uniqueOthersIds.length) {
        throw new ApiError(404, 'Uno o más productos no fueron encontrados', 'Productos no encontrados');
      }
      othersProducts.push(...othersResult.rows);
      const soldOthers = othersProducts.filter((p) => p.is_sold === 1);
      if (soldOthers.length > 0) {
        throw new ApiError(400, `El producto ${soldOthers[0].name} ya ha sido vendido`, 'Producto no disponible');
      }
      for (const item of othersItems) {
        const varResult = await db.execute({
          sql: 'SELECT * FROM other_vars WHERE id = ? AND other_id = ?',
          args: [item.variantId, item.id],
        });
        if (varResult.rows.length === 0) {
          throw new ApiError(404, 'Variación no encontrada', 'Variación no encontrada');
        }
        const variant = varResult.rows[0];
        const variantQuantity = othersItems.filter(
          (i) => i.id === item.id && i.variantId === item.variantId,
        ).length;
        if (variant.stock < variantQuantity) {
          const product = othersProducts.find((p) => p.id === item.id);
          throw new ApiError(
            400,
            `Stock insuficiente para ${product.name}. Disponible: ${variant.stock}, solicitado: ${variantQuantity}`,
            'Stock insuficiente',
          );
        }
        othersVariations.push(variant);
      }
    }

    // Calculate total price including all products (with duplicates) and shipping costs
    let totalPrice = 0;
    for (const item of artItems) {
      const product = artProducts.find(p => p.id === item.id);
      if (product) {
        totalPrice += product.price + (item.shipping?.cost || 0);
      }
    }
    for (const item of othersItems) {
      const product = othersProducts.find(p => p.id === item.id);
      if (product) {
        totalPrice += product.price + (item.shipping?.cost || 0);
      }
    }

    // Build compact items for Revolut (same grouping as legacy flow)
    const groupKey = (it) => `${it.type}|${it.id}|${it.type === 'other' ? (it.variantId || 'null') : 'na'}`;
    const grouped = new Map();
    for (const it of items) {
      const key = groupKey(it);
      if (!grouped.has(key)) {
        grouped.set(key, { ...it, quantity: 0 });
      }
      const g = grouped.get(key);
      g.quantity += 1;
      if (!g.shipping && it.shipping) g.shipping = it.shipping;
    }
    const compactItems = Array.from(grouped.values()).map((g) => ({
      type: g.type,
      id: g.id,
      ...(g.type === 'other' ? { variantId: g.variantId } : {}),
      quantity: g.quantity,
      shipping: g.shipping,
    }));

    const computeShippingTotal = (cItems) => {
      let shippingTotal = 0;
      for (const it of cItems) {
        const c = it.shipping?.cost || 0;
        shippingTotal += Math.round(c * 100);
      }
      return shippingTotal;
    };

    const artMap = new Map(artProducts.map((p) => [p.id, p]));
    const otherMap = new Map(othersProducts.map((p) => [p.id, p]));
    const lineItems = [];
    let productsTotal = 0;
    for (const it of compactItems) {
      const src = it.type === 'art' ? artMap.get(it.id) : otherMap.get(it.id);
      if (!src) continue;

      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      const totalVat = Math.round(((src.price || 0) * (VAT_ES)) * 100) * qty;
      const unitPriceMinor = Math.round(((src.price || 0) * (1 - VAT_ES)) * 100);
      const unitTotalPriceMinor = Math.round((src.price || 0) * 100);
      const totalMinor = unitTotalPriceMinor * qty;
      productsTotal += totalMinor;

      const imageUrl = it.type === 'art'
        ? `${SITE_API_URL}/api/art/images/${encodeURIComponent(src.basename)}`
        : `${SITE_API_URL}/api/others/images/${encodeURIComponent(src.basename)}`;
      const productUrl = it.type === 'art'
        ? `${SITE_BASE_URL}/galeria/p/${src.slug}`
        : `${SITE_BASE_URL}/galeria/mas/p/${src.slug}`;

      lineItems.push({
        name: src.name,
        type: 'physical',
        quantity: { value: qty },
        unit_price_amount: unitPriceMinor,
        total_amount: totalMinor,
        external_id: src.slug,
        taxes: [{ name: 'IVA', amount: totalVat }],
        image_urls: [imageUrl],
        // Ensure PATCH payloads also use plain-text descriptions
        description: htmlToPlainText(src.description || '', 1000),
        url: productUrl,
      });
    }

    // Build shipping line items from compactItems (one per product line, not grouped by method)
    for (const it of compactItems) {
      if (it.shipping && it.shipping.cost > 0) {
        const shippingCostMinor = Math.round(it.shipping.cost * 100);
        lineItems.push({
          name: `Gastos de envío - ${it.shipping.methodName || 'Envío'}`,
          type: 'service',
          quantity: { value: 1 },
          unit_price_amount: shippingCostMinor,
          total_amount: shippingCostMinor,
          description: htmlToPlainText(it.shipping.methodDescription || '', 500),
        });
      }
    }

    const shippingTotal = computeShippingTotal(compactItems);
    const amountMinor = productsTotal + shippingTotal;
    if (amountMinor <= 0) {
      throw new ApiError(400, 'El importe debe ser mayor que cero', 'Importe inválido');
    }

    const mapAddressToRevolut = (addr) => {
      if (!addr) return null;
      return {
        street_line_1: addr.line1 || '',
        street_line_2: addr.line2 || '',
        region: addr.province || '',
        city: addr.city || '',
        country_code: (addr.country || 'ES').toUpperCase(),
        postcode: addr.postalCode || '',
      };
    };

    let customerBlock = undefined;
    if (customer && (customer.email || customer.full_name || customer.fullName)) {
      customerBlock = {
        email: customer.email,
        full_name: customer.full_name || customer.fullName || '',
        phone: customer.phone,
      };
      if (!customerBlock.phone) {
        throw new ApiError(400, 'El teléfono del cliente es obligatorio', 'Datos del cliente inválidos');
      }
      if (!customerBlock.email) {
        throw new ApiError(400, 'El email del cliente es obligatorio', 'Datos del cliente inválidos');
      }
    }

    const allPickup = compactItems.every((i) => i.shipping?.methodType === 'pickup');
    let shippingBlock = undefined;
    if (allPickup) {
      const addr = mapAddressToRevolut(invoicing_address || delivery_address);
      if (addr && customerBlock) {
        shippingBlock = {
          address: addr,
          contact: { name: customerBlock.full_name, email: customerBlock.email, phone: customerBlock.phone },
        };
      }
    } else {
      const addr = mapAddressToRevolut(delivery_address);
      if (addr && customerBlock) {
        shippingBlock = {
          address: addr,
          contact: { name: customerBlock.full_name, email: customerBlock.email, phone: customerBlock.phone },
        };
      }
    }

    // 1) Persist order in DB with status 'pending' and payment provider info
    const orderResult = await db.execute({
      sql: `INSERT INTO orders (
        email,
        phone,
        guest_email,
        total_price,
        status,
        token,
        delivery_address_line_1,
        delivery_address_line_2,
        delivery_postal_code,
        delivery_city,
        delivery_province,
        delivery_country,
        delivery_lat,
        delivery_lng,
        invoicing_address_line_1,
        invoicing_address_line_2,
        invoicing_postal_code,
        invoicing_city,
        invoicing_province,
        invoicing_country,
        revolut_order_id,
        revolut_order_token,
        payment_provider,
        stripe_payment_intent_id,
        stripe_customer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        buyerEmail,
        buyerPhone ?? null,
        guest_email || null,
        totalPrice ?? 0,
        'pending',
        crypto.randomBytes(24).toString('hex'),
        delivery_address?.line1 ?? null,
        delivery_address?.line2 ?? null,
        delivery_address?.postalCode ?? null,
        delivery_address?.city ?? null,
        delivery_address?.province ?? null,
        delivery_address?.country ?? null,
        delivery_address?.lat ?? null,
        delivery_address?.lng ?? null,
        invoicing_address?.line1 ?? null,
        invoicing_address?.line2 ?? null,
        invoicing_address?.postalCode ?? null,
        invoicing_address?.city ?? null,
        invoicing_address?.province ?? null,
        invoicing_address?.country ?? null,
        revolut_order_id || null,
        revolut_order_token || null,
        provider,
        stripe_payment_intent_id || null,
        null, // stripe_customer_id - populated below after findOrCreateCustomer
      ],
    });

    const orderId = Number(orderResult.lastInsertRowid);

    // 2) Create order item rows (art and others) without altering inventory yet
    const dealerCommissionRate = parseFloat(process.env.DEALER_COMMISSION || 0) / 100;
    
    for (const item of artItems) {
      const product = artProducts.find((p) => p.id === item.id);
      const commissionAmount = product.price * dealerCommissionRate;
      await db.execute({
        sql: `INSERT INTO art_order_items (
          order_id,
          art_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type,
          commission_amount,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
          commissionAmount,
          'pending'
        ],
      });
    }

    for (const item of othersItems) {
      const product = othersProducts.find((p) => p.id === item.id);
      const variant = othersVariations.find((v) => v.id === item.variantId);
      const commissionAmount = product.price * dealerCommissionRate;
      await db.execute({
        sql: `INSERT INTO other_order_items (
          order_id,
          other_id,
          other_var_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type,
          commission_amount,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          variant.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
          commissionAmount,
          'pending'
        ],
      });
    }

    // 3) Enrich payment provider order/intent with customer and shipping data
    if (provider === 'revolut' && revolut_order_id) {
      const revPayload = {
        amount: amountMinor,
        currency,
        capture_mode: 'automatic',
        description,
        merchant_order_ext_ref: `cart-${Date.now()}`,
        line_items: lineItems,
        ...(customerBlock ? { customer: customerBlock } : {}),
        ...(shippingBlock ? { shipping: shippingBlock } : {}),
        ...(REV_LOCATION_ID ? { location_id: REV_LOCATION_ID } : {}),
      };

      await updateRevolutOrder(revolut_order_id, revPayload);
    }

    if (provider === 'stripe' && stripe_payment_intent_id) {
      // Find or create a Stripe Customer so every checkout is linked to a single customer record
      let stripeCustomerId = null;
      try {
        const stripeCustomer = await findOrCreateCustomer({
          email: buyerEmail,
          name: customerBlock?.full_name || undefined,
          phone: buyerPhone || undefined,
        });
        stripeCustomerId = stripeCustomer.id;

        // Persist the Stripe customer ID in our DB order
        await db.execute({
          sql: `UPDATE orders SET stripe_customer_id = ? WHERE id = ?`,
          args: [stripeCustomerId, orderId],
        });
      } catch (custErr) {
        console.warn('Failed to find/create Stripe customer:', custErr.message);
      }

      // Build Stripe shipping object from delivery or invoicing address
      const shippingAddr = delivery_address || invoicing_address;
      const stripeShipping = shippingAddr ? {
        name: customerBlock?.full_name || buyerEmail,
        phone: buyerPhone || undefined,
        address: {
          line1: shippingAddr.line1 || '',
          line2: shippingAddr.line2 || '',
          city: shippingAddr.city || '',
          state: shippingAddr.province || '',
          postal_code: shippingAddr.postalCode || '',
          country: (shippingAddr.country || 'ES').toUpperCase(),
        },
      } : undefined;

      // Build metadata with invoicing address and customer info
      const invAddr = invoicing_address || delivery_address;
      const stripeMetadata = {
        customer_name: customerBlock?.full_name || '',
        customer_email: buyerEmail,
        customer_phone: buyerPhone || '',
        order_id: String(orderId),
        ...(invAddr ? {
          invoicing_line1: invAddr.line1 || '',
          invoicing_line2: invAddr.line2 || '',
          invoicing_city: invAddr.city || '',
          invoicing_province: invAddr.province || '',
          invoicing_postal_code: invAddr.postalCode || '',
          invoicing_country: (invAddr.country || 'ES').toUpperCase(),
        } : {}),
      };

      try {
        await updatePaymentIntent(stripe_payment_intent_id, {
          customer: stripeCustomerId || undefined,
          shipping: stripeShipping,
          receipt_email: buyerEmail,
          description,
          metadata: stripeMetadata,
        });
      } catch (stripeUpdateErr) {
        // Log but don't fail the order - the payment can still proceed
        console.warn('Failed to update Stripe PaymentIntent with customer data:', stripeUpdateErr.message);
      }
    }

    // 4) Load order details (without sending any emails yet)
    const orderDetailsResult = await db.execute({
      sql: `
        SELECT o.*
        FROM orders o
        WHERE o.id = ?
      `,
      args: [orderId],
    });

    const artOrderItemsResult = await db.execute({
      sql: `
        SELECT
          aoi.*,
          a.name,
          a.type,
          a.basename,
          a.seller_id,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        WHERE aoi.order_id = ?
      `,
      args: [orderId],
    });

    const othersOrderItemsResult = await db.execute({
      sql: `
        SELECT
          ooi.*,
          o.name,
          o.basename,
          o.seller_id,
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

    res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// Get all orders for logged-in user (seller view - shows only their products)
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;
    const dateFrom = req.query.date || null; // Optional date filter (format: YYYY-MM-DD)

    // Check if user is a seller
    const userResult = await db.execute({
      sql: 'SELECT role FROM users WHERE id = ?',
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const userRole = userResult.rows[0].role;

    // Build date filter condition
    const dateCondition = dateFrom ? 'AND o.created_at >= ?' : '';
    const dateArgs = dateFrom ? [dateFrom] : [];

    // Get all orders that contain at least one item from this seller
    // We need to find orders where either art items or other items belong to this seller
    const ordersWithSellerItemsResult = await db.execute({
      sql: `
        SELECT DISTINCT o.id, o.total_price, o.status, o.created_at, o.email, o.guest_email
        FROM orders o
        LEFT JOIN art_order_items aoi ON o.id = aoi.order_id
        LEFT JOIN art a ON aoi.art_id = a.id
        LEFT JOIN other_order_items ooi ON o.id = ooi.order_id
        LEFT JOIN others ot ON ooi.other_id = ot.id
        WHERE (a.seller_id = ? OR ot.seller_id = ?) ${dateCondition}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [userId, userId, ...dateArgs, limit, offset],
    });

    // Get total count for pagination
    const countResult = await db.execute({
      sql: `
        SELECT COUNT(DISTINCT o.id) as total
        FROM orders o
        LEFT JOIN art_order_items aoi ON o.id = aoi.order_id
        LEFT JOIN art a ON aoi.art_id = a.id
        LEFT JOIN other_order_items ooi ON o.id = ooi.order_id
        LEFT JOIN others ot ON ooi.other_id = ot.id
        WHERE (a.seller_id = ? OR ot.seller_id = ?) ${dateCondition}
      `,
      args: [userId, userId, ...dateArgs],
    });

    const totalOrders = countResult.rows[0].total;

    // Get items for each order (only seller's items)
    const orders = [];
    for (const order of ordersWithSellerItemsResult.rows) {
      // Get art order items belonging to this seller
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
          WHERE aoi.order_id = ? AND a.seller_id = ?
        `,
        args: [order.id, userId],
      });

      // Get others order items belonging to this seller
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
          WHERE ooi.order_id = ? AND o.seller_id = ?
        `,
        args: [order.id, userId],
      });

      const sellerItems = [...artItemsResult.rows, ...othersItemsResult.rows];

      // Calculate seller's portion of the order
      const sellerTotal = sellerItems.reduce((sum, item) => {
        return sum + item.price_at_purchase + (item.shipping_cost || 0);
      }, 0);

      orders.push({
        ...order,
        items: sellerItems,
        total_price: sellerTotal, // Override with seller's portion
      });
    }

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        hasMore: page < Math.ceil(totalOrders / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get seller stats for current and previous periods (excluding shipping costs)
const getSellerStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const dateFrom = req.query.date || null; // Current period start date (format: YYYY-MM-DD)
    const previousDateFrom = req.query.previousDate || null; // Previous period start date
    const previousDateTo = req.query.previousDateTo || null; // Previous period end date

    // Helper function to calculate stats for a date range
    const calculateStats = async (startDate, endDate = null) => {
      // Build date filter conditions
      let dateCondition = '';
      const dateArgs = [];
      
      if (startDate && endDate) {
        dateCondition = 'AND o.created_at >= ? AND o.created_at < ?';
        dateArgs.push(startDate, endDate);
      } else if (startDate) {
        dateCondition = 'AND o.created_at >= ?';
        dateArgs.push(startDate);
      }

      // Get all order items for this seller within the date range (art items)
      const artItemsResult = await db.execute({
        sql: `
          SELECT 
            aoi.price_at_purchase,
            aoi.commission_amount,
            o.status
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          LEFT JOIN orders o ON aoi.order_id = o.id
          WHERE a.seller_id = ? ${dateCondition}
        `,
        args: [userId, ...dateArgs],
      });

      // Get all order items for this seller within the date range (other items)
      const otherItemsResult = await db.execute({
        sql: `
          SELECT 
            ooi.price_at_purchase,
            ooi.commission_amount,
            o.status
          FROM other_order_items ooi
          LEFT JOIN others ot ON ooi.other_id = ot.id
          LEFT JOIN orders o ON ooi.order_id = o.id
          WHERE ot.seller_id = ? ${dateCondition}
        `,
        args: [userId, ...dateArgs],
      });

      const allItems = [...artItemsResult.rows, ...otherItemsResult.rows];

      // Calculate totals (excluding shipping costs as per requirement, and deducting commission)
      const totals = {
        available: 0,      // Saldo disponible (confirmed orders)
        sales: 0,          // Total de ventas (all orders)
        withdrawn: 0,      // Total retirado (placeholder - no withdrawal system yet)
        pendingIncome: 0,  // Pendiente de ingreso (paid/sent/arrived but not confirmed)
      };

      allItems.forEach((item) => {
        const price = Number(item.price_at_purchase) || 0;
        const commission = Number(item.commission_amount) || 0;
        const sellerEarning = price - commission;
        totals.sales += sellerEarning;

        // Saldo disponible: confirmed orders
        if (item.status === 'confirmed') {
          totals.available += sellerEarning;
        }

        // Pendiente de ingreso: paid/sent/arrived but not confirmed
        if (['paid', 'sent', 'arrived'].includes(item.status)) {
          totals.pendingIncome += sellerEarning;
        }
      });

      return totals;
    };

    // Calculate current period stats
    const currentStats = await calculateStats(dateFrom, null);

    // Calculate previous period stats if dates provided
    let previousStats = null;
    if (previousDateFrom && previousDateTo) {
      previousStats = await calculateStats(previousDateFrom, previousDateTo);
    }

    // Calculate change percentages with business rules:
    // - One decimal precision
    // - Cap at ">1000%" when magnitude exceeds 1000%
    // - When previous === 0 and current > 0 => treat as +100.0%
    // - When previous > 0 and current === 0 => -100.0% (decrease)
    // - When both are 0 => 0%
    const calculateChange = (current, previous) => {
      const cur = Number(current) || 0;
      const prev = Number(previous) || 0;

      // No previous period provided (null/undefined): treat as no change info
      if (previous === null || previous === undefined) {
        return { change: '0%', changeType: 'increase' };
      }

      if (prev === 0) {
        if (cur === 0) {
          // No change at all
          return { change: '0%', changeType: 'increase' };
        }
        // Business decision: when previous is zero and current > 0, show 100.0% increase
        return { change: '100.0%', changeType: 'increase' };
      }

      const diff = cur - prev;
      const percentage = (diff / prev) * 100;
      const absPerc = Math.abs(percentage);

      // Apply cap
      const display = absPerc > 1000 ? '>1000%' : `${absPerc.toFixed(1)}%`;

      return {
        change: display,
        changeType: diff >= 0 ? 'increase' : 'decrease',
      };
    };

    const stats = {
      current: currentStats,
      previous: previousStats,
      changes: previousStats ? {
        available: calculateChange(currentStats.available, previousStats.available),
        sales: calculateChange(currentStats.sales, previousStats.sales),
        withdrawn: calculateChange(currentStats.withdrawn, previousStats.withdrawn),
        pendingIncome: calculateChange(currentStats.pendingIncome, previousStats.pendingIncome),
      } : null,
    };

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

// Public: get order details by token (no authentication). Includes seller contact info per item.
const getOrderByToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const orderResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE token = ?',
      args: [token],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Get art order items with seller info
    const artItemsResult = await db.execute({
      sql: `
        SELECT
          aoi.*,
          a.name,
          a.description,
          a.type,
          a.basename,
          a.seller_id,
          u.full_name as seller_name,
          u.email as seller_email,
          u.email_contact as seller_email_contact,
          u.pickup_address as seller_pickup_address,
          u.pickup_city as seller_pickup_city,
          u.pickup_postal_code as seller_pickup_postal_code,
          u.pickup_country as seller_pickup_country,
          u.pickup_instructions as seller_pickup_instructions,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        LEFT JOIN users u ON a.seller_id = u.id
        WHERE aoi.order_id = ?
      `,
      args: [order.id],
    });

    // Get others order items with seller info
    const othersItemsResult = await db.execute({
      sql: `
        SELECT
          ooi.*,
          o.name,
          o.description,
          o.basename,
          o.seller_id,
          ov.key as variant_key,
          u.full_name as seller_name,
          u.email as seller_email,
          u.email_contact as seller_email_contact,
          u.pickup_address as seller_pickup_address,
          u.pickup_city as seller_pickup_city,
          u.pickup_postal_code as seller_pickup_postal_code,
          u.pickup_country as seller_pickup_country,
          u.pickup_instructions as seller_pickup_instructions,
          'other' as product_type
        FROM other_order_items ooi
        LEFT JOIN others o ON ooi.other_id = o.id
        LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
        LEFT JOIN users u ON o.seller_id = u.id
        WHERE ooi.order_id = ?
      `,
      args: [order.id],
    });

    order.items = [...artItemsResult.rows, ...othersItemsResult.rows];

    res.status(200).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

// Public: send a message from buyer to a specific seller for an order, using order token for authorization
const contactSellerForOrder = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { seller_id, message } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    if (!seller_id) {
      throw new ApiError(400, 'Falta seller_id', 'Solicitud inválida');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new ApiError(400, 'El mensaje no puede estar vacío', 'Solicitud inválida');
    }

    const orderResult = await db.execute({ sql: 'SELECT * FROM orders WHERE token = ?', args: [token] });
    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }
    const order = orderResult.rows[0];

    // Load items to ensure seller is part of this order and to build context
    const itemsResult = await db.execute({
      sql: `
        SELECT * FROM (
          SELECT aoi.id, aoi.order_id, aoi.art_id as product_id, aoi.price_at_purchase, aoi.shipping_cost, aoi.shipping_method_name, aoi.shipping_method_type,
                 a.name, a.description, a.type, a.basename, a.seller_id, 'art' as product_type
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          WHERE aoi.order_id = ?
          UNION ALL
          SELECT ooi.id, ooi.order_id, ooi.other_id as product_id, ooi.price_at_purchase, ooi.shipping_cost, ooi.shipping_method_name, ooi.shipping_method_type,
                 o.name, o.description, NULL as type, o.basename, o.seller_id, 'other' as product_type
          FROM other_order_items ooi
          LEFT JOIN others o ON ooi.other_id = o.id
          WHERE ooi.order_id = ?
        ) t
        WHERE seller_id = ?
      `,
      args: [order.id, order.id, seller_id],
    });

    if (itemsResult.rows.length === 0) {
      throw new ApiError(404, 'No se encontró un producto de este vendedor en el pedido', 'Vendedor inválido');
    }

    const sellerRes = await db.execute({ sql: 'SELECT email, full_name, email_contact FROM users WHERE id = ?', args: [seller_id] });
    if (sellerRes.rows.length === 0) {
      throw new ApiError(404, 'Vendedor no encontrado', 'Vendedor no encontrado');
    }
    const seller = sellerRes.rows[0];
    const recipient = seller.email_contact || seller.email;
    if (!recipient) {
      throw new ApiError(400, 'El vendedor no tiene email de contacto configurado', 'Contacto no disponible');
    }

    const buyerEmail = order.email || order.guest_email || null;
    const buyerPhone = order.phone || null;

    await sendBuyerToSellerContactEmail({
      sellerEmail: recipient,
      sellerName: seller.full_name || 'Vendedor',
      buyerEmail,
      buyerPhone,
      orderId: order.id,
      orderToken: order.token,
      items: itemsResult.rows,
      message: message.trim(),
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Get single order by ID (seller view - shows only seller's products)
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

    // Check if this order contains any items from this seller
    const sellerItemCheckResult = await db.execute({
      sql: `
        SELECT COUNT(*) as count
        FROM (
          SELECT aoi.id
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          WHERE aoi.order_id = ? AND a.seller_id = ?
          UNION
          SELECT ooi.id
          FROM other_order_items ooi
          LEFT JOIN others o ON ooi.other_id = o.id
          WHERE ooi.order_id = ? AND o.seller_id = ?
        )
      `,
      args: [id, userId, id, userId],
    });

    if (sellerItemCheckResult.rows[0].count === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    // Get art order items (only seller's items)
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
        WHERE aoi.order_id = ? AND a.seller_id = ?
      `,
      args: [id, userId],
    });

    // Get others order items (only seller's items)
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
        WHERE ooi.order_id = ? AND o.seller_id = ?
      `,
      args: [id, userId],
    });

    const sellerItems = [...artItemsResult.rows, ...othersItemsResult.rows];

    // Calculate seller's portion of the order
    const sellerTotal = sellerItems.reduce((sum, item) => {
      return sum + item.price_at_purchase + (item.shipping_cost || 0);
    }, 0);

    order.items = sellerItems;
    order.total_price = sellerTotal; // Override with seller's portion

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// Get all orders (admin only) - with pagination and filters
const getAllOrdersAdmin = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions = [];
    const args = [];

    if (req.query.email) {
      conditions.push('(o.email LIKE ? OR o.guest_email LIKE ?)');
      const emailPattern = `%${req.query.email}%`;
      args.push(emailPattern, emailPattern);
    }

    if (req.query.status) {
      conditions.push('o.status = ?');
      args.push(req.query.status);
    }

    if (req.query.date_from) {
      conditions.push('o.created_at >= ?');
      args.push(req.query.date_from);
    }

    if (req.query.date_to) {
      conditions.push('o.created_at <= ?');
      args.push(req.query.date_to + ' 23:59:59');
    }

    if (req.query.seller) {
      const sellerPattern = `%${req.query.seller}%`;
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM art_order_items aoi
          JOIN art a ON aoi.art_id = a.id
          JOIN users u ON a.seller_id = u.id
          WHERE aoi.order_id = o.id AND u.full_name LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM other_order_items ooi
          JOIN others ot ON ooi.other_id = ot.id
          JOIN users u ON ot.seller_id = u.id
          WHERE ooi.order_id = o.id AND u.full_name LIKE ?
        )
      )`);
      args.push(sellerPattern, sellerPattern);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      args: [...args],
    });
    const total = countResult.rows[0].total;

    // Get paginated orders
    const ordersResult = await db.execute({
      sql: `SELECT o.* FROM orders o ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    // Get items for each order with seller info
    const orders = [];
    for (const order of ordersResult.rows) {
      const artItemsResult = await db.execute({
        sql: `
          SELECT
            aoi.*,
            a.name,
            a.type,
            a.basename,
            a.seller_id,
            u.full_name as seller_name,
            'art' as product_type
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          LEFT JOIN users u ON a.seller_id = u.id
          WHERE aoi.order_id = ?
        `,
        args: [order.id],
      });

      const othersItemsResult = await db.execute({
        sql: `
          SELECT
            ooi.*,
            o.name,
            o.basename,
            o.seller_id,
            ov.key as variant_key,
            u.full_name as seller_name,
            'other' as product_type
          FROM other_order_items ooi
          LEFT JOIN others o ON ooi.other_id = o.id
          LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
          LEFT JOIN users u ON o.seller_id = u.id
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
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
};

// Get single order by ID (admin only)
const getOrderByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const orderResult = await db.execute({
      sql: `
        SELECT o.*
        FROM orders o
        WHERE o.id = ?
      `,
      args: [id],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Get art order items with seller info
    const artItemsResult = await db.execute({
      sql: `
        SELECT
          aoi.*,
          a.name,
          a.description,
          a.type,
          a.basename,
          a.seller_id,
          u.full_name as seller_name,
          u.email as seller_email,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        LEFT JOIN users u ON a.seller_id = u.id
        WHERE aoi.order_id = ?
      `,
      args: [id],
    });

    // Get others order items with seller info
    const othersItemsResult = await db.execute({
      sql: `
        SELECT
          ooi.*,
          o.name,
          o.description,
          o.basename,
          o.seller_id,
          ov.key as variant_key,
          u.full_name as seller_name,
          u.email as seller_email,
          'other' as product_type
        FROM other_order_items ooi
        LEFT JOIN others o ON ooi.other_id = o.id
        LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
        LEFT JOIN users u ON o.seller_id = u.id
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

// Helper function to check if all items in an order are sent and update order status
const checkAndUpdateOrderStatus = async (orderId) => {
  try {
    // Get all items in the order (from all sellers)
    const allArtItemsResult = await db.execute({
      sql: 'SELECT status FROM art_order_items WHERE order_id = ?',
      args: [orderId],
    });

    const allOtherItemsResult = await db.execute({
      sql: 'SELECT status FROM other_order_items WHERE order_id = ?',
      args: [orderId],
    });

    const allItems = [...allArtItemsResult.rows, ...allOtherItemsResult.rows];

    // Check if all items have 'sent' status
    const allSent = allItems.length > 0 && allItems.every(item => item.status === 'sent');

    if (allSent) {
      // Update order status to 'sent'
      await db.execute({
        sql: 'UPDATE orders SET status = ? WHERE id = ?',
        args: ['sent', orderId],
      });
      console.log(`Order #${orderId} status updated to 'sent' - all items have been sent`);
    }
  } catch (error) {
    console.error('Error checking and updating order status:', error);
    // Don't throw - this is a background operation
  }
};

// Update tracking number for an order item
const updateItemTracking = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { tracking, product_type } = req.body;
    const userId = req.user.id;

    if (!tracking || typeof tracking !== 'string' || tracking.trim().length === 0) {
      throw new ApiError(400, 'El número de seguimiento no puede estar vacío', 'Solicitud inválida');
    }

    if (!product_type || !['art', 'other'].includes(product_type)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    // Verify the seller owns this item in this order
    const table = product_type === 'art' ? 'art_order_items' : 'other_order_items';
    const idColumn = product_type === 'art' ? 'art_id' : 'other_id';
    const productTable = product_type === 'art' ? 'art' : 'others';

    const itemCheckResult = await db.execute({
      sql: `
        SELECT i.id
        FROM ${table} i
        LEFT JOIN ${productTable} p ON i.${idColumn} = p.id
        WHERE i.id = ? AND i.order_id = ? AND p.seller_id = ?
      `,
      args: [itemId, orderId, userId],
    });

    if (itemCheckResult.rows.length === 0) {
      throw new ApiError(404, 'Item no encontrado', 'Item no encontrado');
    }

    // Update tracking number
    await db.execute({
      sql: `UPDATE ${table} SET tracking = ? WHERE id = ?`,
      args: [tracking.trim(), itemId],
    });

    // Get updated order data to return
    const orderResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE id = ?',
      args: [orderId],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Get art order items (only seller's items)
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
        WHERE aoi.order_id = ? AND a.seller_id = ?
      `,
      args: [orderId, userId],
    });

    // Get others order items (only seller's items)
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
        WHERE ooi.order_id = ? AND o.seller_id = ?
      `,
      args: [orderId, userId],
    });

    const sellerItems = [...artItemsResult.rows, ...othersItemsResult.rows];

    // Calculate seller's portion of the order
    const sellerTotal = sellerItems.reduce((sum, item) => {
      return sum + item.price_at_purchase + (item.shipping_cost || 0);
    }, 0);

    // Send email notification to buyer (only if not admin)
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      // Find the updated item in the seller items
      const updatedItem = sellerItems.find(item => item.id === parseInt(itemId));
      if (updatedItem) {
        try {
          await sendTrackingUpdateEmail(order, [updatedItem]);
        } catch (emailError) {
          console.error('Error sending tracking update email:', emailError);
          // Don't fail the request if email fails
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Número de seguimiento actualizado correctamente',
      order: {
        ...order,
        items: sellerItems,
        total_price: sellerTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update status for an order item
const updateItemStatus = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, product_type, tracking } = req.body;
    const userId = req.user.id;

    if (!status || typeof status !== 'string') {
      throw new ApiError(400, 'Estado inválido', 'Solicitud inválida');
    }

    if (!product_type || !['art', 'other'].includes(product_type)) {
      throw new ApiError(400, 'Tipo de producto inválido', 'Solicitud inválida');
    }

    // Get order to check status
    const orderResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE id = ?',
      args: [orderId],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Validate order status is 'paid' before allowing status change to 'sent'
    if (status === 'sent' && order.status !== 'paid') {
      throw new ApiError(400, 'Solo se pueden marcar como enviados los pedidos que estén en estado "pagado"', 'Estado no válido');
    }

    // Verify the seller owns this item in this order
    const table = product_type === 'art' ? 'art_order_items' : 'other_order_items';
    const idColumn = product_type === 'art' ? 'art_id' : 'other_id';
    const productTable = product_type === 'art' ? 'art' : 'others';

    const itemCheckResult = await db.execute({
      sql: `
        SELECT i.id
        FROM ${table} i
        LEFT JOIN ${productTable} p ON i.${idColumn} = p.id
        WHERE i.id = ? AND i.order_id = ? AND p.seller_id = ?
      `,
      args: [itemId, orderId, userId],
    });

    if (itemCheckResult.rows.length === 0) {
      throw new ApiError(404, 'Item no encontrado', 'Item no encontrado');
    }

    // Update item status and tracking (if provided)
    if (tracking && tracking.trim().length > 0) {
      await db.execute({
        sql: `UPDATE ${table} SET status = ?, tracking = ? WHERE id = ?`,
        args: [status, tracking.trim(), itemId],
      });
    } else {
      await db.execute({
        sql: `UPDATE ${table} SET status = ? WHERE id = ?`,
        args: [status, itemId],
      });
    }

    // Get art order items (only seller's items)
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
        WHERE aoi.order_id = ? AND a.seller_id = ?
      `,
      args: [orderId, userId],
    });

    // Get others order items (only seller's items)
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
        WHERE ooi.order_id = ? AND o.seller_id = ?
      `,
      args: [orderId, userId],
    });

    const sellerItems = [...artItemsResult.rows, ...othersItemsResult.rows];

    // Calculate seller's portion of the order
    const sellerTotal = sellerItems.reduce((sum, item) => {
      return sum + item.price_at_purchase + (item.shipping_cost || 0);
    }, 0);

    // Send email notification to buyer (only if status is 'sent' and not admin)
    const isAdmin = req.user.role === 'admin';
    if (status === 'sent' && !isAdmin) {
      // Find the updated item in the seller items
      const updatedItem = sellerItems.find(item => item.id === parseInt(itemId));
      if (updatedItem) {
        try {
          await sendItemsSentEmail(order, [updatedItem]);
        } catch (emailError) {
          console.error('Error sending items sent email:', emailError);
          // Don't fail the request if email fails
        }
      }
    }

    // Check if all items in the order are now 'sent' and update order status if needed
    if (status === 'sent') {
      await checkAndUpdateOrderStatus(orderId);
    }

    res.status(200).json({
      success: true,
      message: 'Estado actualizado correctamente',
      order: {
        ...order,
        items: sellerItems,
        total_price: sellerTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update order status - marks all seller's items (or all items if admin) as sent
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, tracking } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!status || typeof status !== 'string') {
      throw new ApiError(400, 'Estado inválido', 'Solicitud inválida');
    }

    // Only allow marking as 'sent' for now
    if (status !== 'sent') {
      throw new ApiError(400, 'Solo se puede actualizar el estado a "sent"', 'Solicitud inválida');
    }

    // Get order to check status
    const orderResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE id = ?',
      args: [orderId],
    });

    if (orderResult.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }

    const order = orderResult.rows[0];

    // Validate order status is 'paid'
    if (order.status !== 'paid') {
      throw new ApiError(400, 'Solo se pueden marcar como enviados los pedidos que estén en estado "pagado"', 'Estado no válido');
    }

    // Check if this order contains any items from this seller (if not admin)
    if (!isAdmin) {
      const sellerItemCheckResult = await db.execute({
        sql: `
          SELECT COUNT(*) as count
          FROM (
            SELECT aoi.id
            FROM art_order_items aoi
            LEFT JOIN art a ON aoi.art_id = a.id
            WHERE aoi.order_id = ? AND a.seller_id = ?
            UNION
            SELECT ooi.id
            FROM other_order_items ooi
            LEFT JOIN others o ON ooi.other_id = o.id
            WHERE ooi.order_id = ? AND o.seller_id = ?
          )
        `,
        args: [orderId, userId, orderId, userId],
      });

      if (sellerItemCheckResult.rows[0].count === 0) {
        throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
      }
    }

    // Update item statuses to 'sent' and tracking (if provided)
    const hasTracking = tracking && tracking.trim().length > 0;

    if (isAdmin) {
      // Admin: Update ALL items
      if (hasTracking) {
        await db.execute({
          sql: 'UPDATE art_order_items SET status = ?, tracking = ? WHERE order_id = ?',
          args: ['sent', tracking.trim(), orderId],
        });
        await db.execute({
          sql: 'UPDATE other_order_items SET status = ?, tracking = ? WHERE order_id = ?',
          args: ['sent', tracking.trim(), orderId],
        });
      } else {
        await db.execute({
          sql: 'UPDATE art_order_items SET status = ? WHERE order_id = ?',
          args: ['sent', orderId],
        });
        await db.execute({
          sql: 'UPDATE other_order_items SET status = ? WHERE order_id = ?',
          args: ['sent', orderId],
        });
      }
    } else {
      // Seller: Update only their items
      if (hasTracking) {
        await db.execute({
          sql: `
            UPDATE art_order_items
            SET status = ?, tracking = ?
            WHERE order_id = ? AND art_id IN (
              SELECT id FROM art WHERE seller_id = ?
            )
          `,
          args: ['sent', tracking.trim(), orderId, userId],
        });
        await db.execute({
          sql: `
            UPDATE other_order_items
            SET status = ?, tracking = ?
            WHERE order_id = ? AND other_id IN (
              SELECT id FROM others WHERE seller_id = ?
            )
          `,
          args: ['sent', tracking.trim(), orderId, userId],
        });
      } else {
        await db.execute({
          sql: `
            UPDATE art_order_items
            SET status = ?
            WHERE order_id = ? AND art_id IN (
              SELECT id FROM art WHERE seller_id = ?
            )
          `,
          args: ['sent', orderId, userId],
        });
        await db.execute({
          sql: `
            UPDATE other_order_items
            SET status = ?
            WHERE order_id = ? AND other_id IN (
              SELECT id FROM others WHERE seller_id = ?
            )
          `,
          args: ['sent', orderId, userId],
        });
      }
    }

    // Get art order items (only seller's items, or all if admin)
    const artItemsResult = await db.execute({
      sql: isAdmin ? `
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
      ` : `
        SELECT
          aoi.*,
          a.name,
          a.description,
          a.type,
          a.basename,
          'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        WHERE aoi.order_id = ? AND a.seller_id = ?
      `,
      args: isAdmin ? [orderId] : [orderId, userId],
    });

    // Get others order items (only seller's items, or all if admin)
    const othersItemsResult = await db.execute({
      sql: isAdmin ? `
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
      ` : `
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
        WHERE ooi.order_id = ? AND o.seller_id = ?
      `,
      args: isAdmin ? [orderId] : [orderId, userId],
    });

    const sellerItems = [...artItemsResult.rows, ...othersItemsResult.rows];

    // Calculate seller's portion of the order
    const sellerTotal = sellerItems.reduce((sum, item) => {
      return sum + item.price_at_purchase + (item.shipping_cost || 0);
    }, 0);

    // Send email notification to buyer (only if not admin)
    if (!isAdmin && sellerItems.length > 0) {
      try {
        await sendItemsSentEmail(order, sellerItems);
      } catch (emailError) {
        console.error('Error sending items sent email:', emailError);
        // Don't fail the request if email fails
      }
    }

    // Check if all items in the order are now 'sent' and update order status if needed
    await checkAndUpdateOrderStatus(orderId);

    res.status(200).json({
      success: true,
      message: 'Estado del pedido actualizado correctamente',
      order: {
        ...order,
        items: sellerItems,
        total_price: sellerTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  placeOrder,
  confirmOrderPayment,
  getUserOrders,
  getOrderById,
  getSellerStats,
  updateItemTracking,
  updateItemStatus,
  updateOrderStatus,
  getAllOrdersAdmin,
  getOrderByIdAdmin,
  getOrderByToken,
  contactSellerForOrder,
};

// Confirm order payment (PUT /api/orders)
// Body: { order_id: number, payment_id: string, provider?: string }
async function confirmOrderPayment(req, res, next) {
  try {
    const { order_id, payment_id, provider: reqProvider } = req.body || {};

    // Require fields explicitly
    if (!order_id || !payment_id) {
      throw new ApiError(400, 'Faltan parámetros requeridos: order_id y payment_id son obligatorios', 'Solicitud inválida');
    }

    // Load order
    const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [order_id] });
    if (orderRes.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }
    const order = orderRes.rows[0];
    const provider = reqProvider || order.payment_provider || 'revolut';

    // If already paid, validate idempotency: IDs must match
    if (order.status === 'paid') {
      if (provider === 'stripe') {
        if (order.stripe_payment_intent_id && order.stripe_payment_intent_id !== payment_id) {
          throw new ApiError(409, 'El pedido ya está pagado con otro identificador de pago', 'Conflicto de pago');
        }
        await db.execute({
          sql: 'UPDATE orders SET stripe_payment_method_id = COALESCE(stripe_payment_method_id, ?) WHERE id = ?',
          args: [payment_id, order_id],
        });
      } else {
        if (order.revolut_payment_id && order.revolut_payment_id !== payment_id) {
          throw new ApiError(409, 'El pedido ya está pagado con otro identificador de pago de Revolut', 'Conflicto de pago');
        }
        await db.execute({
          sql: 'UPDATE orders SET revolut_payment_id = COALESCE(revolut_payment_id, ?) WHERE id = ?',
          args: [payment_id, order_id],
        });
      }
      return res.status(200).json({ success: true, order: { id: order_id, status: 'paid' } });
    }

    // Store payment ID and mark as paid
    if (provider === 'stripe') {
      await db.execute({
        sql: 'UPDATE orders SET status = ?, stripe_payment_method_id = ? WHERE id = ?',
        args: ['paid', payment_id, order_id],
      });
    } else {
      await db.execute({
        sql: 'UPDATE orders SET status = ?, revolut_payment_id = ? WHERE id = ?',
        args: ['paid', payment_id, order_id],
      });
    }

    // Update order items status to 'paid'
    await db.execute({
      sql: 'UPDATE art_order_items SET status = ? WHERE order_id = ?',
      args: ['paid', order_id],
    });
    await db.execute({
      sql: 'UPDATE other_order_items SET status = ? WHERE order_id = ?',
      args: ['paid', order_id],
    });

    // Inventory updates
    // 1) Mark art items as sold
    const artItemsRes = await db.execute({
      sql: 'SELECT aoi.art_id FROM art_order_items aoi WHERE aoi.order_id = ?',
      args: [order_id],
    });
    const uniqueArtIds = [...new Set(artItemsRes.rows.map(r => r.art_id))];
    for (const artId of uniqueArtIds) {
      await db.execute({ sql: 'UPDATE art SET is_sold = 1 WHERE id = ?', args: [artId] });
    }

    // 2) Decrement others variants stock and mark product as sold if out of stock
    const otherItemsRes = await db.execute({
      sql: 'SELECT other_var_id FROM other_order_items WHERE order_id = ?',
      args: [order_id],
    });
    const counts = new Map();
    for (const row of otherItemsRes.rows) {
      counts.set(row.other_var_id, (counts.get(row.other_var_id) || 0) + 1);
    }
    for (const [variantId, qty] of counts.entries()) {
      // Get current stock and other_id
      const varRes = await db.execute({ sql: 'SELECT id, stock, other_id FROM other_vars WHERE id = ?', args: [variantId] });
      if (varRes.rows.length) {
        const v = varRes.rows[0];
        const newStock = Math.max(0, (v.stock || 0) - qty);
        await db.execute({ sql: 'UPDATE other_vars SET stock = ? WHERE id = ?', args: [newStock, variantId] });
        // Check if total stock for this product is zero
        const totalRes = await db.execute({ sql: 'SELECT SUM(stock) as total_stock FROM other_vars WHERE other_id = ?', args: [v.other_id] });
        if ((totalRes.rows[0]?.total_stock || 0) <= 0) {
          await db.execute({ sql: 'UPDATE others SET is_sold = 1 WHERE id = ?', args: [v.other_id] });
        }
      }
    }

    // Send order confirmation email now (after payment success)
    try {
      // Reload order details
      const orderDetailsResult = await db.execute({
        sql: `
          SELECT o.*
          FROM orders o
          WHERE o.id = ?
        `,
        args: [order_id],
      });
      const orderRow = orderDetailsResult.rows[0] || order;

      // Get items with seller info
      const artOrderItemsResult = await db.execute({
        sql: `
          SELECT
            aoi.*, a.name, a.type, a.basename, a.seller_id, 'art' as product_type
          FROM art_order_items aoi
          LEFT JOIN art a ON aoi.art_id = a.id
          WHERE aoi.order_id = ?
        `,
        args: [order_id],
      });
      const othersOrderItemsResult = await db.execute({
        sql: `
          SELECT
            ooi.*, o.name, o.basename, o.seller_id, ov.key as variant_key, 'other' as product_type
          FROM other_order_items ooi
          LEFT JOIN others o ON ooi.other_id = o.id
          LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
          WHERE ooi.order_id = ?
        `,
        args: [order_id],
      });
      const items = [...artOrderItemsResult.rows, ...othersOrderItemsResult.rows];

      // Unique sellers
      const sellersInfo = [];
      for (const item of items) {
        if (item.seller_id && !sellersInfo.find(s => s.id === item.seller_id)) {
          const sellerResult = await db.execute({ sql: 'SELECT email, full_name FROM users WHERE id = ?', args: [item.seller_id] });
          if (sellerResult.rows.length > 0) {
            const seller = sellerResult.rows[0];
            sellersInfo.push({ email: seller.email, name: seller.full_name, id: item.seller_id });
          }
        }
      }

      const buyerEmail = orderRow.email || orderRow.guest_email || null;
      const buyerPhone = orderRow.phone || null;

      if (buyerEmail) {
        await sendPurchaseConfirmation({
          orderId: order_id,
          orderToken: orderRow.token,
          items,
          totalPrice: orderRow.total_price,
          buyerEmail,
          buyerPhone,
          sellers: sellersInfo,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send order confirmation email after payment:', emailErr);
      // Do not fail the request
    }

    return res.status(200).json({ success: true, order: { id: order_id, status: 'paid' } });
  } catch (error) {
    next(error);
  }
}
