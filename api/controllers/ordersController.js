const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { sendPurchaseConfirmation, sendPaymentConfirmation } = require('../services/emailService');
const { createRevolutOrder, updateRevolutOrder } = require('../services/revolutService');

// Public site base URL used for product images/links in Revolut payload
const SITE_BASE_URL = process.env.SITE_PUBLIC_BASE_URL || 'https://140d.art';
const REV_LOCATION_ID = process.env.REVOLUT_LOCATION_ID || null;

// Create new order (legacy popup flow: creates Revolut order first, then persists DB order)
const createOrder = async (req, res, next) => {
  try {
    const { items, guest_email, contact, contact_type, delivery_address, invoicing_address, customer } = req.body;

    // Check if user is authenticated or guest
    const isAuthenticated = req.user && req.user.id;
    const isGuest = !isAuthenticated;

    // Validate contact info (new flow) or guest_email (legacy)
    if (isGuest) {
      // Check for new contact flow
      if (contact && contact_type) {
        // Validate contact based on type
        if (contact_type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(contact)) {
            throw new ApiError(400, 'Formato de email inválido', 'Email inválido');
          }
        } else if (contact_type === 'whatsapp') {
          // Phone should be in format: +34600123456
          const phoneRegex = /^\+\d{1,4}\d{6,15}$/;
          if (!phoneRegex.test(contact)) {
            throw new ApiError(400, 'Formato de teléfono inválido', 'Teléfono inválido');
          }
        } else {
          throw new ApiError(400, 'Tipo de contacto inválido', 'Tipo de contacto inválido');
        }
      } else if (guest_email) {
        // Legacy flow - validate guest email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(guest_email)) {
          throw new ApiError(400, 'Formato de email inválido', 'Email inválido');
        }
      } else {
        throw new ApiError(400, 'Se requiere información de contacto para compra como invitado', 'Contacto requerido');
      }
    }

    // Get buyer_id (authenticated user or system guest user)
    let buyer_id;
    let buyer_email;
    let buyer_contact;
    let buyer_contact_type;

    if (isAuthenticated) {
      buyer_id = req.user.id;
      buyer_email = req.user.email;
      // For authenticated users, contact defaults to email
      buyer_contact = contact || req.user.email;
      buyer_contact_type = contact_type || 'email';
    } else {
      // Get system GUEST user
      const guestUserResult = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: ['SYSTEM_GUEST@kuadrat.internal'],
      });

      if (guestUserResult.rows.length === 0) {
        throw new ApiError(500, 'Sistema de invitados no configurado', 'Error del servidor');
      }

      buyer_id = guestUserResult.rows[0].id;

      // Use new contact flow if available, otherwise legacy guest_email
      if (contact && contact_type) {
        buyer_contact = contact;
        buyer_contact_type = contact_type;
        // If contact is email, also set buyer_email for email sending
        if (contact_type === 'email') {
          buyer_email = contact;
        }
      } else {
        // Legacy flow
        buyer_email = guest_email;
        buyer_contact = guest_email;
        buyer_contact_type = 'email';
      }
    }

    // Validate input - items should be array of { type: 'art' | 'other', id, variantId?, shipping? }
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    // Validate that all items have shipping info
    const itemsWithoutShipping = items.filter(item => !item.shipping);
    if (itemsWithoutShipping.length > 0) {
      throw new ApiError(400, 'Todos los productos deben tener información de envío', 'Información de envío faltante');
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
      // Get unique product IDs to avoid duplicate queries
      const uniqueOthersIds = [...new Set(othersItems.map(item => item.id))];
      const othersPlaceholders = uniqueOthersIds.map(() => '?').join(',');
      const othersResult = await db.execute({
        sql: `SELECT * FROM others WHERE id IN (${othersPlaceholders})`,
        args: uniqueOthersIds,
      });

      // Check if all unique products were found
      if (othersResult.rows.length !== uniqueOthersIds.length) {
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

    // Calculate total price (products only; shipping is tracked per item rows)
    let totalPrice = 0;
    totalPrice += artProducts.reduce((sum, product) => sum + product.price, 0);
    totalPrice += othersProducts.reduce((sum, product) => sum + product.price, 0);

    // ==========================
    // Revolut Order (pop-up flow)
    // ==========================
    // Build compact items (grouped by product+variant) with quantity and one shipping block per cart line
    const groupKey = (it) => `${it.type}|${it.id}|${it.type === 'other' ? (it.variantId || 'null') : 'na'}`;
    const grouped = new Map();
    for (const it of items) {
      const key = groupKey(it);
      if (!grouped.has(key)) {
        grouped.set(key, { ...it, quantity: 0 });
      }
      const g = grouped.get(key);
      g.quantity += 1;
      // ensure we keep the first shipping object as the line's shipping (charge once per line)
      if (!g.shipping && it.shipping) g.shipping = it.shipping;
    }
    const compactItems = Array.from(grouped.values()).map((g) => ({
      type: g.type,
      id: g.id,
      ...(g.type === 'other' ? { variantId: g.variantId } : {}),
      quantity: g.quantity,
      shipping: g.shipping,
    }));

    // Helper: compute shipping total (once per line)
    const computeShippingTotal = (cItems) => {
      let shippingTotal = 0;
      for (const it of cItems) {
        const c = it.shipping?.cost || 0;
        shippingTotal += Math.round(c * 100);
      }
      return shippingTotal;
    };

    // Build Revolut line_items and totals using already-fetched product rows
    const artMap = new Map(artProducts.map((p) => [p.id, p]));
    const otherMap = new Map(othersProducts.map((p) => [p.id, p]));
    const lineItems = [];
    let productsTotal = 0;
    for (const it of compactItems) {
      const src = it.type === 'art' ? artMap.get(it.id) : otherMap.get(it.id);
      if (!src) continue;
      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      const unitPriceMinor = Math.round((src.price || 0) * 100);
      const totalMinor = unitPriceMinor * qty;
      productsTotal += totalMinor;

      const imageUrl = it.type === 'art'
        ? `${SITE_BASE_URL}/api/art/images/${encodeURIComponent(src.basename)}`
        : `${SITE_BASE_URL}/api/others/images/${encodeURIComponent(src.basename)}`;
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
        taxes: [],
        image_urls: [imageUrl],
        description: (src.description || '').toString().slice(0, 1000),
        url: productUrl,
      });
    }

    const shippingTotal = computeShippingTotal(compactItems);
    const amountMinor = productsTotal + shippingTotal;
    if (amountMinor <= 0) {
      throw new ApiError(400, 'El importe debe ser mayor que cero', 'Importe inválido');
    }

    // Map addresses for Revolut shipping block
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

    // Customer block (mandatory phone as per spec)
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

    // Shipping block rules
    const allPickup = compactItems.every(i => i.shipping?.methodType === 'pickup');
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

    // Create Revolut order first; if this fails, abort without creating DB order
    const currency = 'EUR';
    const description = 'Pedido realizado en 140d Galería de Arte';
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

    const revOrder = await createRevolutOrder(revPayload);

    // Create order with address information (status pending_payment)
    const orderResult = await db.execute({
      sql: `INSERT INTO orders (
        buyer_id,
        total_price,
        status,
        guest_email,
        contact,
        contact_type,
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
        invoicing_country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        buyer_id ?? null,
        totalPrice ?? 0,
        'pending_payment',
        isGuest ? (guest_email || null) : null, // Ensure null, not undefined
        buyer_contact ?? null,
        buyer_contact_type ?? null,
        // Delivery address
        delivery_address?.line1 ?? null,
        delivery_address?.line2 ?? null,
        delivery_address?.postalCode ?? null,
        delivery_address?.city ?? null,
        delivery_address?.province ?? null,
        delivery_address?.country ?? null,
        delivery_address?.lat ?? null,
        delivery_address?.lng ?? null,
        // Invoicing address
        invoicing_address?.line1 ?? null,
        invoicing_address?.line2 ?? null,
        invoicing_address?.postalCode ?? null,
        invoicing_address?.city ?? null,
        invoicing_address?.province ?? null,
        invoicing_address?.country ?? null,
      ],
    });

    const orderId = Number(orderResult.lastInsertRowid);

    // Persist Revolut order id in our DB record
    try {
      await db.execute({ sql: 'UPDATE orders SET revolut_order_id = ? WHERE id = ?', args: [revOrder.id, orderId] });
    } catch (e) {
      // Non-fatal; continue, but the order will lack the revolut id
      console.error('Failed to store revolut_order_id for order', orderId, e);
    }

    // Create art order items (do NOT mark as sold yet; this will be done after payment confirmation)
    const processedArt = {};
    for (const item of artItems) {
      const product = artProducts.find(p => p.id === item.id);

      // Insert art order item with shipping info
      await db.execute({
        sql: `INSERT INTO art_order_items (
          order_id,
          art_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
        ],
      });

      // Do not mark as sold at this stage
    }

    // Create others order items (do NOT update stock yet; this will be done after payment confirmation)
    const processedOthersVariants = {};
    for (const item of othersItems) {
      const product = othersProducts.find(p => p.id === item.id);
      const variant = othersVariations.find(v => v.id === item.variantId);

      // Insert other order item with shipping info
      await db.execute({
        sql: `INSERT INTO other_order_items (
          order_id,
          other_id,
          other_var_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          variant.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
        ],
      });

      // Track variant stock updates
      if (!processedOthersVariants[variant.id]) {
        processedOthersVariants[variant.id] = 0;
      }
      processedOthersVariants[variant.id]++;
    }

    // Stock updates will be performed after payment confirmation

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

    // Get art order items with seller info
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

    // Get others order items with seller info
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

    // New workflow: DO NOT send order confirmation email at creation time

    res.status(201).json({
      success: true,
      order,
      revolut: {
        token: revOrder.token,
        amount: revOrder.amount,
        currency: revOrder.currency,
        state: revOrder.state,
      },
    });
  } catch (error) {
    next(error);
  }
};

// New flow: persist order in DB with status 'pending' for an existing Revolut order
// and PATCH the Revolut order with full details (customer, line_items, shipping).
// POST /api/orders/placeOrder
const placeOrder = async (req, res, next) => {
  try {
    const {
      items,
      guest_email,
      contact,
      contact_type,
      delivery_address,
      invoicing_address,
      customer,
      revolut_order_id,
      currency = 'EUR',
      description = 'Pedido realizado en 140d Galería de Arte',
    } = req.body || {};

    if (!revolut_order_id) {
      throw new ApiError(400, 'Falta revolut_order_id en la solicitud', 'Solicitud inválida');
    }

    // Check if user is authenticated or guest (same logic as createOrder)
    const isAuthenticated = req.user && req.user.id;
    const isGuest = !isAuthenticated;

    // Validate contact info (new flow) or guest_email (legacy)
    if (isGuest) {
      if (contact && contact_type) {
        if (contact_type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(contact)) {
            throw new ApiError(400, 'Formato de email inválido', 'Email inválido');
          }
        } else if (contact_type === 'whatsapp') {
          const phoneRegex = /^\+\d{1,4}\d{6,15}$/;
          if (!phoneRegex.test(contact)) {
            throw new ApiError(400, 'Formato de teléfono inválido', 'Teléfono inválido');
          }
        } else {
          throw new ApiError(400, 'Tipo de contacto inválido', 'Tipo de contacto inválido');
        }
      } else if (guest_email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(guest_email)) {
          throw new ApiError(400, 'Formato de email inválido', 'Email inválido');
        }
      } else {
        throw new ApiError(400, 'Se requiere información de contacto para compra como invitado', 'Contacto requerido');
      }
    }

    // Get buyer_id (authenticated user or system guest user)
    let buyer_id;
    let buyer_email;
    let buyer_contact;
    let buyer_contact_type;

    if (isAuthenticated) {
      buyer_id = req.user.id;
      buyer_email = req.user.email;
      buyer_contact = contact || req.user.email;
      buyer_contact_type = contact_type || 'email';
    } else {
      const guestUserResult = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: ['SYSTEM_GUEST@kuadrat.internal'],
      });
      if (guestUserResult.rows.length === 0) {
        throw new ApiError(500, 'Sistema de invitados no configurado', 'Error del servidor');
      }
      buyer_id = guestUserResult.rows[0].id;

      if (contact && contact_type) {
        buyer_contact = contact;
        buyer_contact_type = contact_type;
        if (contact_type === 'email') {
          buyer_email = contact;
        }
      } else {
        buyer_email = guest_email;
        buyer_contact = guest_email;
        buyer_contact_type = 'email';
      }
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

    // Calculate total price (products only; shipping tracked separately per item)
    let totalPrice = 0;
    totalPrice += artProducts.reduce((sum, product) => sum + product.price, 0);
    totalPrice += othersProducts.reduce((sum, product) => sum + product.price, 0);

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
      const unitPriceMinor = Math.round((src.price || 0) * 100);
      const totalMinor = unitPriceMinor * qty;
      productsTotal += totalMinor;

      const imageUrl = it.type === 'art'
        ? `${SITE_BASE_URL}/api/art/images/${encodeURIComponent(src.basename)}`
        : `${SITE_BASE_URL}/api/others/images/${encodeURIComponent(src.basename)}`;
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
        taxes: [],
        image_urls: [imageUrl],
        description: (src.description || '').toString().slice(0, 1000),
        url: productUrl,
      });
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

    // 1) Persist order in DB with status 'pending' and revolut_order_id
    const orderResult = await db.execute({
      sql: `INSERT INTO orders (
        buyer_id,
        total_price,
        status,
        guest_email,
        contact,
        contact_type,
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
        revolut_order_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        buyer_id ?? null,
        totalPrice ?? 0,
        'pending',
        isGuest ? (guest_email || null) : null,
        buyer_contact ?? null,
        buyer_contact_type ?? null,
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
        revolut_order_id,
      ],
    });

    const orderId = Number(orderResult.lastInsertRowid);

    // 2) Create order item rows (art and others) without altering inventory yet
    for (const item of artItems) {
      const product = artProducts.find((p) => p.id === item.id);
      await db.execute({
        sql: `INSERT INTO art_order_items (
          order_id,
          art_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
        ],
      });
    }

    for (const item of othersItems) {
      const product = othersProducts.find((p) => p.id === item.id);
      const variant = othersVariations.find((v) => v.id === item.variantId);
      await db.execute({
        sql: `INSERT INTO other_order_items (
          order_id,
          other_id,
          other_var_id,
          price_at_purchase,
          shipping_method_id,
          shipping_cost,
          shipping_method_name,
          shipping_method_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          orderId,
          product.id,
          variant.id,
          product.price,
          item.shipping?.methodId || null,
          item.shipping?.cost || 0,
          item.shipping?.methodName || null,
          item.shipping?.methodType || null,
        ],
      });
    }

    // 3) PATCH Revolut order with full payload (amount, currency, description, line_items, customer, shipping, location)
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

    // 4) Load order details (without sending any emails yet)
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

    // Check if user is a seller
    const userResult = await db.execute({
      sql: 'SELECT role FROM users WHERE id = ?',
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'Usuario no encontrado');
    }

    const userRole = userResult.rows[0].role;

    // Get all orders that contain at least one item from this seller
    // We need to find orders where either art items or other items belong to this seller
    const ordersWithSellerItemsResult = await db.execute({
      sql: `
        SELECT DISTINCT o.id, o.buyer_id, o.total_price, o.status, o.created_at, o.guest_email
        FROM orders o
        LEFT JOIN art_order_items aoi ON o.id = aoi.order_id
        LEFT JOIN art a ON aoi.art_id = a.id
        LEFT JOIN other_order_items ooi ON o.id = ooi.order_id
        LEFT JOIN others ot ON ooi.other_id = ot.id
        WHERE a.seller_id = ? OR ot.seller_id = ?
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [userId, userId, limit, offset],
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
        WHERE a.seller_id = ? OR ot.seller_id = ?
      `,
      args: [userId, userId],
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

// Get all orders (admin only)
const getAllOrdersAdmin = async (req, res, next) => {
  try {
    // Get all orders with buyer info
    const ordersResult = await db.execute({
      sql: `
        SELECT
          o.*,
          u.email as buyer_email,
          u.full_name as buyer_name
        FROM orders o
        LEFT JOIN users u ON o.buyer_id = u.id
        ORDER BY o.created_at DESC
      `,
      args: [],
    });

    // Get items for each order with seller info
    const orders = [];
    for (const order of ordersResult.rows) {
      // Get art order items with seller info
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

      // Get others order items with seller info
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
        SELECT
          o.*,
          u.email as buyer_email,
          u.full_name as buyer_name
        FROM orders o
        LEFT JOIN users u ON o.buyer_id = u.id
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

module.exports = {
  createOrder,
  placeOrder,
  confirmOrderPayment,
  getUserOrders,
  getOrderById,
  getAllOrdersAdmin,
  getOrderByIdAdmin,
};

// Confirm order payment (PUT /api/orders)
// Body: { order_id: number, payment_id: string }
async function confirmOrderPayment(req, res, next) {
  try {
    const { order_id, payment_id } = req.body || {};

    // Require fields explicitly (revolut_order_id is already stored at creation)
    if (!order_id || !payment_id) {
      throw new ApiError(400, 'Faltan parámetros requeridos: order_id y payment_id son obligatorios', 'Solicitud inválida');
    }

    // Load order
    const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [order_id] });
    if (orderRes.rows.length === 0) {
      throw new ApiError(404, 'Pedido no encontrado', 'Pedido no encontrado');
    }
    const order = orderRes.rows[0];

    // If already paid, validate idempotency: IDs must match
    if (order.status === 'paid') {
      if (order.revolut_payment_id && order.revolut_payment_id !== payment_id) {
        throw new ApiError(409, 'El pedido ya está pagado con otro identificador de pago de Revolut', 'Conflicto de pago');
      }
      // Ensure IDs are persisted if they were null previously
      await db.execute({
        sql: 'UPDATE orders SET revolut_payment_id = COALESCE(revolut_payment_id, ?) WHERE id = ?',
        args: [payment_id, order_id],
      });
      return res.status(200).json({ success: true, order: { id: order_id, status: 'paid' } });
    }

    // Store Revolut ids and mark as paid (no remote verification per spec)
    await db.execute({
      sql: 'UPDATE orders SET status = ?, revolut_payment_id = ? WHERE id = ?',
      args: ['paid', payment_id, order_id],
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
      // Reload order details including buyer email
      const orderDetailsResult = await db.execute({
        sql: `
          SELECT o.*, u.email as buyer_email
          FROM orders o
          LEFT JOIN users u ON o.buyer_id = u.id
          WHERE o.id = ?
        `,
        args: [order_id],
      });
      const orderRow = orderDetailsResult.rows[0] || order;

      // Get items with seller info (same shape as in createOrder)
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

      const buyerEmail = orderRow.buyer_email || orderRow.guest_email || (orderRow.contact_type === 'email' ? orderRow.contact : null);
      const buyerContact = orderRow.contact || buyerEmail || null;
      const contactType = orderRow.contact_type || (buyerEmail ? 'email' : null);

      if (buyerEmail) {
        await sendPurchaseConfirmation({
          orderId: order_id,
          items,
          totalPrice: orderRow.total_price,
          buyerEmail,
          buyerContact,
          contactType,
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
