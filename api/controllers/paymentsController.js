const crypto = require('crypto');
const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const {
  createRevolutOrder,
  getRevolutOrder,
  getRevolutOrderPayments,
  getRevolutPayment,
  cancelRevolutOrder,
} = require('../services/revolutService');
const { sendPurchaseConfirmation } = require('../services/emailService');
// Shared helpers (also used by stripePaymentsController)
const {
  computeCartTotal: sharedComputeCartTotal,
  loadProductsDetails: sharedLoadProductsDetails,
  buildLineItems: sharedBuildLineItems,
  computeShippingTotal: sharedComputeShippingTotal,
  verifyShippingCosts: sharedVerifyShippingCosts,
} = require('../utils/paymentHelpers');

const SITE_BASE_URL = process.env.SITE_PUBLIC_BASE_URL || 'https://pre.140d.art';
const SITE_API_URL = process.env.SITE_API_BASE_URL || 'https://api.pre.140d.art';
const REV_LOCATION_ID = process.env.REVOLUT_LOCATION_ID || null;
const REVOLUT_WEBHOOK_SECRET = process.env.REVOLUT_WEBHOOK_SECRET || '';

// Helper: compute total amount (products + shipping) from expanded items
// items: [{ type: 'art'|'other', id, variantId?, shipping: { cost, ... } }]
async function computeCartTotal(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
  }

  const artItems = items.filter(i => i.type === 'art');
  const othersItems = items.filter(i => i.type === 'other');

  let total = 0;

  if (artItems.length > 0) {
    const ids = artItems.map(i => i.id);
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.execute({ sql: `SELECT id, price, is_sold FROM art WHERE id IN (${placeholders})`, args: ids });
    if (res.rows.length !== artItems.length) throw new ApiError(404, 'Una o más obras no encontradas', 'Obras no encontradas');
    // Ensure none is sold
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Alguna obra ya ha sido vendida', 'Obra no disponible');
    total += res.rows.reduce((s, r) => s + r.price, 0);
  }

  if (othersItems.length > 0) {
    // Get unique others ids
    const uniqueIds = [...new Set(othersItems.map(i => i.id))];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const res = await db.execute({ sql: `SELECT id, price, is_sold FROM others WHERE id IN (${placeholders})`, args: uniqueIds });
    if (res.rows.length !== uniqueIds.length) throw new ApiError(404, 'Uno o más productos no encontrados', 'Productos no encontrados');
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Algún producto ya ha sido vendido', 'Producto no disponible');
    // Sum product prices according to count occurrences in items
    for (const item of othersItems) {
      const product = res.rows.find(r => r.id === item.id);
      total += product.price;
    }
    // Validate variants stock (basic check)
    for (const item of othersItems) {
      const varRes = await db.execute({ sql: 'SELECT id, stock FROM other_vars WHERE id = ? AND other_id = ?', args: [item.variantId, item.id] });
      if (varRes.rows.length === 0) throw new ApiError(404, 'Variación no encontrada', 'Variación no encontrada');
    }
  }

  // Add shipping from items
  for (const item of items) {
    const shipCost = item.shipping?.cost || 0;
    total += shipCost;
  }

  return total;
}

// Helper: load product data for line_items
async function loadProductsDetails(compactItems) {
  // compactItems: [{ type:'art'|'other', id, variantId?, quantity, shipping }]
  const artIds = [...new Set(compactItems.filter(i => i.type === 'art').map(i => i.id))];
  const otherIds = [...new Set(compactItems.filter(i => i.type === 'other').map(i => i.id))];

  const artMap = new Map();
  const otherMap = new Map();

  if (artIds.length) {
    const placeholders = artIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT id, name, price, slug, basename, description, is_sold FROM art WHERE id IN (${placeholders})`,
      args: artIds,
    });
    for (const row of res.rows) {
      artMap.set(row.id, row);
    }
    if (res.rows.length !== artIds.length) {
      throw new ApiError(404, 'Una o más obras no encontradas', 'Obras no encontradas');
    }
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Alguna obra ya ha sido vendida', 'Obra no disponible');
  }

  if (otherIds.length) {
    const placeholders = otherIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT id, name, price, slug, basename, description, is_sold FROM others WHERE id IN (${placeholders})`,
      args: otherIds,
    });
    for (const row of res.rows) {
      otherMap.set(row.id, row);
    }
    if (res.rows.length !== otherIds.length) {
      throw new ApiError(404, 'Uno o más productos no encontrados', 'Productos no encontrados');
    }
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Algún producto ya ha sido vendido', 'Producto no disponible');
  }

  return { artMap, otherMap };
}

// Build Revolut line_items from compact items and DB details
function buildLineItems({ compactItems, artMap, otherMap }) {
  const lineItems = [];
  let productsTotal = 0; // products sum only, exclude shipping

  for (const item of compactItems) {
    const src = item.type === 'art' ? artMap.get(item.id) : otherMap.get(item.id);
    if (!src) continue;
    const name = src.name;
    const slug = src.slug;
    const desc = (src.description || '').toString().slice(0, 1000);
    const unitPriceMinor = Math.round((src.price || 0) * 100);
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));
    const totalMinor = unitPriceMinor * qty;
    productsTotal += totalMinor;

    const imageUrl = item.type === 'art'
      ? `${SITE_API_URL}/api/art/images/${encodeURIComponent(src.basename)}`
      : `${SITE_API_URL}/api/others/images/${encodeURIComponent(src.basename)}`;
    const productUrl = item.type === 'art'
      ? `${SITE_BASE_URL}/galeria/p/${slug}`
      : `${SITE_BASE_URL}/galeria/mas/p/${slug}`;

    lineItems.push({
      name,
      type: 'physical',
      quantity: { value: qty },
      unit_price_amount: unitPriceMinor,
      total_amount: totalMinor,
      external_id: slug,
      taxes: [],
      image_urls: [imageUrl],
      description: desc,
      url: productUrl,
    });
  }

  return { lineItems, productsTotal };
}

// Compute total shipping cost from compact items
function computeShippingTotal(compactItems) {
  let shippingTotal = 0;
  for (const item of compactItems) {
    const c = item.shipping?.cost || 0;
    shippingTotal += Math.round(c * 100);
  }
  return shippingTotal;
}

// Map our address model to Revolut
function mapAddressToRevolut(addr) {
  if (!addr) return null;
  return {
    street_line_1: addr.line1 || '',
    street_line_2: addr.line2 || '',
    region: addr.province || '',
    city: addr.city || '',
    country_code: (addr.country || 'ES').toUpperCase(),
    postcode: addr.postalCode || '',
  };
}

// POST /api/payments/revolut/init-order
// New flow: create a minimal Revolut order using only { amount, currency }.
// The full payload (customer, line_items, shipping, description, location_id)
// will be PATCHed later from the /api/orders/placeOrder endpoint once the
// buyer has filled in all personal and address information.
const initRevolutOrderEndpoint = async (req, res, next) => {
  try {
    const {
      // compactItems: [{ type:'art'|'other', id, variantId?, quantity, shipping }]
      items: compactItems,
      currency = 'EUR',
    } = req.body || {};

    if (!Array.isArray(compactItems) || compactItems.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    // Load products from DB
    const { artMap, otherMap } = await loadProductsDetails(compactItems);

    // Verify shipping costs server-side before computing total
    await sharedVerifyShippingCosts(compactItems, artMap, otherMap);

    const { lineItems, productsTotal } = buildLineItems({ compactItems, artMap, otherMap });
    const shippingTotal = computeShippingTotal(compactItems);
    const amountMinor = productsTotal + shippingTotal;

    if (amountMinor <= 0) {
      throw new ApiError(400, 'El importe debe ser mayor que cero', 'Importe inválido');
    }

    // Minimal payload for initial order creation per spec: only amount and currency.
    // All descriptive/customer/shipping data will be PATCHed later.
    const payload = {
      amount: amountMinor,
      currency,
      ...(REV_LOCATION_ID ? { location_id: REV_LOCATION_ID } : {}),
    };

    const revOrder = await createRevolutOrder(payload);

    return res.status(200).json({
      success: true,
      token: revOrder.token,
      revolut_order_id: revOrder.id,
      amount: revOrder.amount,
      currency: revOrder.currency,
      state: revOrder.state,
    });
  } catch (err) {
    next(err);
  }
};

// Helper: Verify Revolut webhook signature
// Revolut uses HMAC-SHA256 with the signing secret
// Format: payload_to_sign = "v1.{timestamp}.{raw_payload}"
// Signature header format: "v1={hex_signature}" (may contain multiple comma-separated)
function verifyRevolutWebhookSignature(rawPayload, signatureHeader, timestampHeader, secret) {
  if (!secret) {
    logger.warn('REVOLUT_WEBHOOK_SECRET not configured, skipping signature verification');
    return true;
  }
  if (!signatureHeader) {
    logger.warn('Missing Revolut-Signature header');
    return false;
  }
  if (!timestampHeader) {
    logger.warn('Missing Revolut-Request-Timestamp header');
    return false;
  }

  // Validate timestamp is within 5 minutes to prevent replay attacks
  const timestamp = parseInt(timestampHeader, 10);
  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;
  if (Math.abs(now - timestamp) > fiveMinutesMs) {
    logger.warn({ timestamp, now }, 'Webhook timestamp outside 5-minute tolerance');
    return false;
  }

  // Build the payload to sign: v1.{timestamp}.{raw_payload}
  const payloadToSign = `v1.${timestampHeader}.${rawPayload}`;

  // Compute expected signature
  const expectedSignature = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(payloadToSign, 'utf8')
    .digest('hex');

  // Revolut-Signature header may contain multiple signatures (comma-separated)
  // e.g., "v1=abc123,v1=def456" if signing secrets were rotated
  const signatures = signatureHeader.split(',').map(s => s.trim());

  // Check if any signature matches
  for (const sig of signatures) {
    try {
      if (sig.length === expectedSignature.length &&
          crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
        return true;
      }
    } catch (e) {
      // Length mismatch or other error, continue checking
      continue;
    }
  }

  logger.warn('No matching signature found');
  return false;
}

/**
 * After payment confirmation, create Sendcloud shipments for order items
 * that use the Sendcloud provider. Stores shipment IDs and tracking on order items.
 */
async function createSendcloudShipmentsForOrder(orderId) {
  const { isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory');
  const sendcloudProvider = require('../services/shipping/sendcloudProvider');
  const { sendSellerNewOrderEmail } = require('../services/emailService');

  // Load order
  const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [orderId] });
  if (orderRes.rows.length === 0) return;
  const order = orderRes.rows[0];

  // Load art order items with Sendcloud-managed products
  const artItems = isSendcloudEnabled('art') ? (await db.execute({
    sql: `SELECT aoi.id, aoi.art_id, aoi.price_at_purchase, aoi.shipping_method_name,
          aoi.sendcloud_shipping_option_code, aoi.sendcloud_service_point_id,
          a.name, a.weight, a.dimensions, a.seller_id
          FROM art_order_items aoi
          JOIN art a ON aoi.art_id = a.id
          WHERE aoi.order_id = ?`,
    args: [orderId],
  })).rows : [];

  // Load other order items with Sendcloud-managed products
  const otherItems = isSendcloudEnabled('other') ? (await db.execute({
    sql: `SELECT ooi.id, ooi.other_id, ooi.other_var_id, ooi.price_at_purchase,
          ooi.shipping_method_name, ooi.sendcloud_shipping_option_code,
          ooi.sendcloud_service_point_id, ot.name, ot.weight, ot.dimensions,
          ot.seller_id, ot.can_copack
          FROM other_order_items ooi
          JOIN others ot ON ooi.other_id = ot.id
          WHERE ooi.order_id = ?`,
    args: [orderId],
  })).rows : [];

  if (artItems.length === 0 && otherItems.length === 0) return;

  // Group by seller
  const sellerMap = new Map();
  const allItems = [
    ...artItems.map(i => ({ ...i, itemType: 'art', productType: 'art', itemId: i.id })),
    ...otherItems.map(i => ({ ...i, itemType: 'other', productType: 'other', itemId: i.id })),
  ];

  for (const item of allItems) {
    // Skip items without a Sendcloud shipping option code (legacy shipping)
    if (!item.sendcloud_shipping_option_code) continue;

    if (!sellerMap.has(item.seller_id)) {
      sellerMap.set(item.seller_id, { sellerId: item.seller_id, items: [], shippingOptionCode: null, servicePointId: null });
    }
    const group = sellerMap.get(item.seller_id);
    group.items.push(item);
    if (!group.shippingOptionCode) {
      group.shippingOptionCode = item.sendcloud_shipping_option_code;
    }
    if (!group.servicePointId && item.sendcloud_service_point_id) {
      group.servicePointId = item.sendcloud_service_point_id;
    }
  }

  // Build item groups for Sendcloud
  const itemGroups = [];
  for (const [sellerId, group] of sellerMap) {
    const parcels = [];

    // Art: each is a separate parcel
    for (const item of group.items.filter(i => i.productType === 'art')) {
      parcels.push({
        weight: item.weight || 1000,
        dimensions: item.dimensions || null,
        totalValue: item.price_at_purchase || 0,
        items: [{ id: item.art_id, name: item.name, weight: item.weight, price: item.price_at_purchase, quantity: 1 }],
        itemIds: [{ itemId: item.itemId, itemType: 'art' }],
      });
    }

    // Others: group co-packable into one parcel
    const others = group.items.filter(i => i.productType === 'other');
    const copackable = others.filter(i => i.can_copack !== 0);
    const nonCopackable = others.filter(i => i.can_copack === 0);

    if (copackable.length > 0) {
      let totalWeight = 0;
      let totalValue = 0;
      const items = [];
      const itemIds = [];
      for (const item of copackable) {
        totalWeight += item.weight || 0;
        totalValue += item.price_at_purchase || 0;
        items.push({ id: item.other_id, name: item.name, weight: item.weight, price: item.price_at_purchase, quantity: 1 });
        itemIds.push({ itemId: item.itemId, itemType: 'other' });
      }
      parcels.push({ weight: totalWeight || 1000, dimensions: null, totalValue, items, itemIds });
    }

    for (const item of nonCopackable) {
      parcels.push({
        weight: item.weight || 1000,
        dimensions: item.dimensions || null,
        totalValue: item.price_at_purchase || 0,
        items: [{ id: item.other_id, name: item.name, weight: item.weight, price: item.price_at_purchase, quantity: 1 }],
        itemIds: [{ itemId: item.itemId, itemType: 'other' }],
      });
    }

    if (parcels.length > 0 && group.shippingOptionCode) {
      itemGroups.push({
        sellerId,
        parcels,
        shippingOptionCode: group.shippingOptionCode,
        servicePointId: group.servicePointId || null,
      });
    }
  }

  if (itemGroups.length === 0) return;

  const results = await sendcloudProvider.createShipments({
    order: {
      id: orderId,
      deliveryAddress: {
        addressLine1: order.delivery_address_line_1 || '',
        addressLine2: order.delivery_address_line_2 || '',
        postalCode: order.delivery_postal_code || '',
        city: order.delivery_city || '',
        country: order.delivery_country || 'ES',
      },
      buyerName: order.full_name || '',
      buyerEmail: order.email || order.guest_email || '',
      buyerPhone: order.phone || '',
    },
    itemGroups,
  });

  // Update order items with shipment data
  for (const result of results) {
    if (!result.sendcloudShipmentId) continue;

    for (const itemRef of result.itemIds || []) {
      const table = itemRef.itemType === 'art' ? 'art_order_items' : 'other_order_items';
      await db.execute({
        sql: `UPDATE ${table} SET
              sendcloud_shipment_id = ?,
              sendcloud_parcel_id = ?,
              tracking = ?,
              sendcloud_tracking_url = ?,
              sendcloud_carrier_code = ?
              WHERE id = ?`,
        args: [
          result.sendcloudShipmentId,
          result.sendcloudParcelId || null,
          result.trackingNumber || null,
          result.trackingUrl || null,
          result.carrierCode || null,
          itemRef.itemId,
        ],
      });
    }
  }

  // Notify sellers
  const sellerIds = [...sellerMap.keys()];
  for (const sellerId of sellerIds) {
    try {
      const sellerRes = await db.execute({
        sql: 'SELECT email, full_name FROM users WHERE id = ?',
        args: [sellerId],
      });
      if (sellerRes.rows.length > 0 && sellerRes.rows[0].email) {
        await sendSellerNewOrderEmail({
          sellerEmail: sellerRes.rows[0].email,
          sellerName: sellerRes.rows[0].full_name,
          orderId,
        });
      }
    } catch (emailErr) {
      logger.error({ err: emailErr, sellerId, orderId }, 'Failed to send seller order notification');
    }
  }

  logger.info({ orderId, shipmentCount: results.filter(r => r.sendcloudShipmentId).length },
    'Sendcloud shipments created for order');
}

// Helper: Process order confirmation (shared between webhook and manual confirmation)
// This marks the order as paid, updates inventory, and sends emails.
// Provider-aware: stores the payment ID in the correct column based on payment_provider.
async function processOrderConfirmation(orderId, paymentId) {
  // Load order
  const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [orderId] });
  if (orderRes.rows.length === 0) {
    throw new Error(`Order not found: ${orderId}`);
  }
  const order = orderRes.rows[0];
  const provider = order.payment_provider || 'revolut';

  // If already paid, validate idempotency: IDs must match
  if (order.status === 'paid') {
    if (provider === 'stripe') {
      if (order.stripe_payment_intent_id && order.stripe_payment_intent_id !== paymentId) {
        throw new Error(`Order ${orderId} already paid with different Stripe payment ID`);
      }
      await db.execute({
        sql: 'UPDATE orders SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?) WHERE id = ?',
        args: [paymentId, orderId],
      });
    } else {
      if (order.revolut_payment_id && order.revolut_payment_id !== paymentId) {
        throw new Error(`Order ${orderId} already paid with different payment ID`);
      }
      await db.execute({
        sql: 'UPDATE orders SET revolut_payment_id = COALESCE(revolut_payment_id, ?) WHERE id = ?',
        args: [paymentId, orderId],
      });
    }
    return { success: true, order: { id: orderId, status: 'paid' }, alreadyPaid: true };
  }

  // Store payment ID in the correct column and mark as paid
  if (provider === 'stripe') {
    await db.execute({
      sql: 'UPDATE orders SET status = ?, stripe_payment_intent_id = ? WHERE id = ?',
      args: ['paid', paymentId, orderId],
    });
  } else {
    await db.execute({
      sql: 'UPDATE orders SET status = ?, revolut_payment_id = ? WHERE id = ?',
      args: ['paid', paymentId, orderId],
    });
  }

  // Payment amount verification: re-compute the expected total from order items
  // and compare against the recorded total. Flag mismatches for review.
  try {
    const artItemsForVerify = await db.execute({
      sql: 'SELECT price_at_purchase, shipping_cost FROM art_order_items WHERE order_id = ?',
      args: [orderId],
    });
    const otherItemsForVerify = await db.execute({
      sql: 'SELECT price_at_purchase, shipping_cost FROM other_order_items WHERE order_id = ?',
      args: [orderId],
    });
    let expectedTotal = 0;
    for (const row of artItemsForVerify.rows) {
      expectedTotal += (row.price_at_purchase || 0) + (row.shipping_cost || 0);
    }
    for (const row of otherItemsForVerify.rows) {
      expectedTotal += (row.price_at_purchase || 0) + (row.shipping_cost || 0);
    }
    const recordedTotal = order.total_price || 0;
    // Allow 1 cent tolerance for rounding
    if (Math.abs(expectedTotal - recordedTotal) > 0.01) {
      logger.warn(
        { orderId, expectedTotal, recordedTotal, paymentId, diff: Math.abs(expectedTotal - recordedTotal) },
        'Payment amount mismatch detected',
      );
      await db.execute({
        sql: 'UPDATE orders SET payment_mismatch = 1 WHERE id = ?',
        args: [orderId],
      });
    }
  } catch (verifyErr) {
    logger.error({ err: verifyErr, orderId }, 'Failed to verify payment amount');
  }

  // Inventory updates: placeOrder already reserves inventory (is_sold=1, stock-=qty)
  // via atomic conditional UPDATEs. Here we only need to verify consistency
  // and handle edge cases (e.g., orders created before the reservation system).
  const { createBatch } = require('../utils/transaction');
  const inventoryBatch = createBatch();

  // 1) Ensure art items are marked as sold (idempotent — already set by placeOrder)
  const artItemsRes = await db.execute({
    sql: 'SELECT aoi.art_id FROM art_order_items aoi WHERE aoi.order_id = ?',
    args: [orderId],
  });
  const uniqueArtIds = [...new Set(artItemsRes.rows.map(r => r.art_id))];
  for (const artId of uniqueArtIds) {
    inventoryBatch.add('UPDATE art SET is_sold = 1 WHERE id = ?', [artId]);
  }

  // 2) Decrement others variants stock — only if order was NOT reserved by placeOrder
  // (i.e., legacy orders without reserved_at). For reserved orders, stock was already decremented.
  const otherItemsRes = await db.execute({
    sql: 'SELECT other_var_id FROM other_order_items WHERE order_id = ?',
    args: [orderId],
  });
  const counts = new Map();
  for (const row of otherItemsRes.rows) {
    counts.set(row.other_var_id, (counts.get(row.other_var_id) || 0) + 1);
  }

  // Pre-load all variant data in a single query
  const variantIds = [...counts.keys()];
  if (variantIds.length > 0) {
    const varPlaceholders = variantIds.map(() => '?').join(',');
    const allVarsRes = await db.execute({
      sql: `SELECT id, stock, other_id FROM other_vars WHERE id IN (${varPlaceholders})`,
      args: variantIds,
    });

    // Track which parent products need stock check
    const parentProductIds = new Set();

    // Only decrement stock if this order was NOT already reserved (legacy orders)
    if (!order.reserved_at) {
      for (const v of allVarsRes.rows) {
        const qty = counts.get(v.id) || 0;
        const newStock = Math.max(0, (v.stock || 0) - qty);
        inventoryBatch.add('UPDATE other_vars SET stock = ? WHERE id = ?', [newStock, v.id]);
        parentProductIds.add(v.other_id);
      }
    } else {
      // Stock already decremented by placeOrder — just track parent IDs for is_sold check
      for (const v of allVarsRes.rows) {
        parentProductIds.add(v.other_id);
      }
    }

    // Execute all inventory updates atomically
    if (inventoryBatch.size() > 0) {
      await inventoryBatch.execute();
    }

    // Check if parent products are now out of stock (separate reads after batch)
    for (const otherId of parentProductIds) {
      const totalRes = await db.execute({
        sql: 'SELECT SUM(stock) as total_stock FROM other_vars WHERE other_id = ?',
        args: [otherId],
      });
      if ((totalRes.rows[0]?.total_stock || 0) <= 0) {
        await db.execute({ sql: 'UPDATE others SET is_sold = 1 WHERE id = ?', args: [otherId] });
      }
    }
  } else if (inventoryBatch.size() > 0) {
    // Only art items, no variants — still execute the batch
    await inventoryBatch.execute();
  }

  // Send order confirmation email
  try {
    const orderDetailsResult = await db.execute({
      sql: 'SELECT * FROM orders WHERE id = ?',
      args: [orderId],
    });
    const orderRow = orderDetailsResult.rows[0] || order;

    const artOrderItemsResult = await db.execute({
      sql: `
        SELECT aoi.*, a.name, a.type, a.basename, a.seller_id, 'art' as product_type
        FROM art_order_items aoi
        LEFT JOIN art a ON aoi.art_id = a.id
        WHERE aoi.order_id = ?
      `,
      args: [orderId],
    });
    const othersOrderItemsResult = await db.execute({
      sql: `
        SELECT ooi.*, o.name, o.basename, o.seller_id, ov.key as variant_key, 'other' as product_type
        FROM other_order_items ooi
        LEFT JOIN others o ON ooi.other_id = o.id
        LEFT JOIN other_vars ov ON ooi.other_var_id = ov.id
        WHERE ooi.order_id = ?
      `,
      args: [orderId],
    });
    const items = [...artOrderItemsResult.rows, ...othersOrderItemsResult.rows];

    // Batch-load all seller info in a single query (avoids N+1)
    const uniqueSellerIds = [...new Set(items.map(i => i.seller_id).filter(Boolean))];
    let sellersInfo = [];
    if (uniqueSellerIds.length > 0) {
      const placeholders = uniqueSellerIds.map(() => '?').join(',');
      const sellersResult = await db.execute({
        sql: `SELECT id, email, full_name FROM users WHERE id IN (${placeholders})`,
        args: uniqueSellerIds,
      });
      sellersInfo = sellersResult.rows.map(s => ({ email: s.email, name: s.full_name, id: s.id }));
    }

    const buyerEmail = orderRow.email || orderRow.guest_email || null;
    const buyerPhone = orderRow.phone || null;

    if (buyerEmail) {
      await sendPurchaseConfirmation({
        orderId,
        orderToken: orderRow.token,
        items,
        totalPrice: orderRow.total_price,
        buyerEmail,
        buyerPhone,
        sellers: sellersInfo,
      });
    }
  } catch (emailErr) {
    logger.error({ err: emailErr }, 'Failed to send order confirmation email');
  }

  // Create Sendcloud shipments (non-blocking — errors logged but don't roll back payment)
  try {
    const { isSendcloudEnabledForAny } = require('../services/shipping/shippingProviderFactory');
    if (isSendcloudEnabledForAny()) {
      await createSendcloudShipmentsForOrder(orderId);
    }
  } catch (scErr) {
    logger.error({ err: scErr, orderId }, 'Failed to create Sendcloud shipments — manual intervention needed');
  }

  return { success: true, order: { id: orderId, status: 'paid' }, alreadyPaid: false };
}

// POST /api/payments/revolut/webhook
// Handles Revolut webhook events for payment confirmation
const revolutWebhookEndpoint = async (req, res, next) => {
  try {
    // Use the raw body captured by the verify callback for signature verification
    // This preserves the exact bytes that Revolut signed
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signatureHeader = req.headers['revolut-signature'] || '';
    const timestampHeader = req.headers['revolut-request-timestamp'] || '';
    const event = req.body;

    logger.info({ rawBody, eventType: event.event, timestamp: timestampHeader }, 'Revolut webhook received');

    // Verify signature if secret is configured
    if (REVOLUT_WEBHOOK_SECRET) {
      const isValid = verifyRevolutWebhookSignature(rawBody, signatureHeader, timestampHeader, REVOLUT_WEBHOOK_SECRET);
      if (!isValid) {
        logger.error({ rawBodyLength: rawBody.length, signatureHeader }, 'Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      logger.info('Webhook signature verified successfully');
    }

    // Handle different event types
    const eventType = event.event || event.type;

    // Events we care about: ORDER_COMPLETED, ORDER_PAYMENT_COMPLETED
    if (eventType === 'ORDER_COMPLETED' || eventType === 'ORDER_PAYMENT_COMPLETED') {
      const revolutOrderId = event.order_id;

      if (!revolutOrderId) {
        logger.error({ event }, 'Webhook event missing order_id');
        return res.status(200).json({ received: true, processed: false, reason: 'missing order_id' });
      }

      // Find order by revolut_order_id
      const orderRes = await db.execute({
        sql: 'SELECT id, status, revolut_payment_id FROM orders WHERE revolut_order_id = ?',
        args: [revolutOrderId],
      });

      if (orderRes.rows.length === 0) {
        logger.info({ revolutOrderId }, 'Order not found for revolut_order_id');
        // This might happen if the order hasn't been created yet (race condition)
        // Return 200 to acknowledge receipt, but note it wasn't processed
        return res.status(200).json({ received: true, processed: false, reason: 'order not found' });
      }

      const order = orderRes.rows[0];

      // If already paid, nothing to do
      if (order.status === 'paid') {
        logger.info({ orderId: order.id }, 'Order already paid, webhook acknowledged');
        return res.status(200).json({ received: true, processed: false, reason: 'already paid' });
      }

      // Get payment ID from event or fetch from Revolut
      let paymentId = event.payment_id;
      if (!paymentId) {
        try {
          const payments = await getRevolutOrderPayments(revolutOrderId);
          if (payments && payments.length > 0) {
            paymentId = payments[0].id || payments[0].payment_id || payments[0].token;
          }
        } catch (e) {
          logger.error({ err: e }, 'Failed to fetch payment ID');
        }
      }

      if (!paymentId) {
        // Try to get from order
        try {
          const revOrder = await getRevolutOrder(revolutOrderId);
          if (revOrder && revOrder.payments && revOrder.payments.length > 0) {
            paymentId = revOrder.payments[0].id || revOrder.payments[0].payment_id;
          }
        } catch (e) {
          logger.error({ err: e }, 'Failed to fetch order for payment ID');
        }
      }

      // Generate a payment ID if we still don't have one
      if (!paymentId) {
        paymentId = `webhook-${revolutOrderId}-${Date.now()}`;
        logger.warn({ paymentId }, 'Could not get payment ID, using generated');
      }

      // Process the order confirmation
      try {
        const result = await processOrderConfirmation(order.id, paymentId);
        logger.info({ orderId: order.id, result }, 'Order confirmed via webhook');
        return res.status(200).json({ received: true, processed: true, orderId: order.id });
      } catch (confirmErr) {
        logger.error({ err: confirmErr, orderId: order.id }, 'Failed to confirm order');
        // Still return 200 to acknowledge the webhook
        return res.status(200).json({ received: true, processed: false, reason: confirmErr.message });
      }
    }

    // For other events, just acknowledge receipt
    return res.status(200).json({ received: true, processed: false, reason: 'unhandled event type' });
  } catch (err) {
    logger.error({ err }, 'Webhook processing error');
    // Always return 200 to prevent Revolut from retrying
    return res.status(200).json({ received: true, processed: false, error: err.message });
  }
};

// POST /api/payments/revolut/order/:orderId/cancel
// Cancel a pending Revolut order. Used when the cart contents change after
// creating a dummy order so that we do not leave orphaned pending orders on
// Revolut's side. This endpoint is intended to be called silently by the
// frontend and will return a simple success/failure payload.
const cancelRevolutOrderEndpoint = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      throw new ApiError(400, 'Falta orderId de Revolut', 'Solicitud inválida');
    }

    const result = await cancelRevolutOrder(orderId);

    return res.status(200).json({
      success: true,
      order_id: orderId,
      result,
    });
  } catch (err) {
    // Let the global error handler format the error; the client side will
    // treat failures as non-fatal for UX (order will simply remain pending).
    next(err);
  }
};

// GET /api/payments/revolut/order/:orderId/status
// Returns the status of an order by its Revolut order ID or token
// Used by the success page to check if the webhook has confirmed the payment
// Note: Revolut's _rp_oid URL param contains the TOKEN, not the internal ID
async function getOrderStatusByRevolutId(req, res, next) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      throw new ApiError(400, 'Falta orderId de Revolut', 'Solicitud inválida');
    }

    // Find order by revolut_order_id OR revolut_order_token
    // The URL param might be either the internal ID or the public token
    const orderRes = await db.execute({
      sql: 'SELECT id, status, token, email, guest_email FROM orders WHERE revolut_order_id = ? OR revolut_order_token = ?',
      args: [orderId, orderId],
    });

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, found: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];

    return res.status(200).json({
      success: true,
      found: true,
      order_id: order.id,
      status: order.status,
      token: order.token,
      email: order.email || order.guest_email,
      is_paid: order.status === 'paid',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  initRevolutOrderEndpoint,
  revolutWebhookEndpoint,
  getLatestRevolutPaymentForOrder,
  cancelRevolutOrderEndpoint,
  getOrderStatusByRevolutId,
  processOrderConfirmation,
  createSendcloudShipmentsForOrder,
};

// GET /api/payments/revolut/order/:orderId/payments/latest
// Returns the most recent payment for a Revolut order (to retrieve payment_id after pop-up success)
async function getLatestRevolutPaymentForOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      throw new ApiError(400, 'Falta orderId de Revolut', 'Solicitud inválida');
    }

    let payments = [];
    try {
      payments = await getRevolutOrderPayments(orderId);
    } catch (e) {
      // Fallback: some API versions may not expose the list; try fetching the order
      if (e && (e.status === 404 || e.status === 400)) {
        const order = await getRevolutOrder(orderId);
        // Try common shapes where payments may be embedded
        if (order && Array.isArray(order.payments)) {
          payments = order.payments;
        } else if (order && order.payment) {
          payments = [order.payment];
        } else {
          payments = [];
        }
      } else {
        throw e;
      }
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      // Not ready yet; let client poll again
      return res.status(404).json({ success: false, message: 'Payment not found yet for this order' });
    }

    // Revolut returns payments in chronological order (oldest first, newest last)
    // So the last item in the array is the most recent payment
    const latest = payments[payments.length - 1];

    // Some responses may use different id fields (id vs token). Prefer id.
    const paymentId = latest.id || latest.token || latest.payment_id || null;
    const state = (latest.state || latest.status || '').toString();
    const amount = typeof latest.amount === 'number' ? latest.amount : latest.outstanding_amount || null;

    if (!paymentId) {
      return res.status(404).json({ success: false, message: 'Payment ID not available yet' });
    }

    // Optionally, we could verify the payment exists via /payments/{id}
    let verified = null;
    try {
      verified = await getRevolutPayment(paymentId);
    } catch (_) {
      // Ignore verification errors; return what we have
    }

    return res.status(200).json({
      success: true,
      payment_id: paymentId,
      state: verified?.state || state,
      amount: verified?.amount || amount,
    });
  } catch (err) {
    next(err);
  }
}
