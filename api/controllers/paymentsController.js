const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { createRevolutOrder, getRevolutOrder, getRevolutOrderPayments, getRevolutPayment } = require('../services/revolutService');

const SITE_BASE_URL = process.env.SITE_PUBLIC_BASE_URL || 'https://140d.art';
const REV_LOCATION_ID = process.env.REVOLUT_LOCATION_ID || null;

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
  const artIds = compactItems.filter(i => i.type === 'art').map(i => i.id);
  const otherIds = compactItems.filter(i => i.type === 'other').map(i => i.id);

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
      ? `${SITE_BASE_URL}/api/art/images/${encodeURIComponent(src.basename)}`
      : `${SITE_BASE_URL}/api/others/images/${encodeURIComponent(src.basename)}`;
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

// POST /api/payments/revolut/order
const createRevolutOrderEndpoint = async (req, res, next) => {
  try {
    const {
      items: compactItems,
      currency = 'EUR',
      description = 'Pedido realizado en 140d Galería de Arte',
      customer,
      delivery_address,
      invoicing_address,
    } = req.body || {};

    if (!Array.isArray(compactItems) || compactItems.length === 0) {
      throw new ApiError(400, 'items debe ser un array no vacío', 'Solicitud inválida');
    }

    // Load products from DB
    const { artMap, otherMap } = await loadProductsDetails(compactItems);
    const { lineItems, productsTotal } = buildLineItems({ compactItems, artMap, otherMap });
    const shippingTotal = computeShippingTotal(compactItems);
    const amountMinor = productsTotal + shippingTotal;

    if (amountMinor <= 0) {
      throw new ApiError(400, 'El importe debe ser mayor que cero', 'Importe inválido');
    }

    // Customer mapping (phone and email mandatory as per user spec)
    const customerBlock = customer ? {
      email: customer.email,
      full_name: customer.full_name || customer.fullName || '',
      phone: customer.phone,
    } : undefined;

    // Shipping mapping
    // Per spec: If pickup-only (all items pickup), use buyer invoicing address and personal info.
    const allPickup = compactItems.every(i => i.shipping?.methodType === 'pickup');
    let shippingBlock = undefined;
    if (allPickup) {
      // TODO: Multi-seller pickup policy. For now use buyer invoicing address as requested.
      const addr = mapAddressToRevolut(invoicing_address || delivery_address);
      if (addr && customerBlock) {
        shippingBlock = {
          address: addr,
          contact: {
            name: customerBlock.full_name,
            email: customerBlock.email,
            phone: customerBlock.phone,
          },
        };
      }
    } else {
      // At least one delivery item: use provided delivery address and buyer contact
      const addr = mapAddressToRevolut(delivery_address);
      if (addr && customerBlock) {
        shippingBlock = {
          address: addr,
          contact: {
            name: customerBlock.full_name,
            email: customerBlock.email,
            phone: customerBlock.phone,
          },
        };
      }
    }

    const payload = {
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

// POST /api/payments/revolut/webhook
// Note: For a production-grade implementation, verify the signature header per Revolut docs.
const revolutWebhookEndpoint = async (req, res, next) => {
  try {
    // Placeholder: log event; in future, verify signature and reconcile payments
    const event = req.body;
    console.log('Revolut webhook received:', JSON.stringify(event));
    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRevolutOrderEndpoint,
  revolutWebhookEndpoint,
  getLatestRevolutPaymentForOrder,
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

    // Pick the most recent payment; try updated_at then created_at; otherwise first
    const normDate = (p) => new Date(p.updated_at || p.created_at || 0).getTime();
    const latest = payments.sort((a, b) => normDate(b) - normDate(a))[0];

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
