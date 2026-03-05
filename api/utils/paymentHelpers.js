const { db } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Compute total amount (products + shipping) from expanded items.
 * items: [{ type: 'art'|'other', id, variantId?, shipping: { cost, ... } }]
 */
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
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Alguna obra ya ha sido vendida', 'Obra no disponible');
    total += res.rows.reduce((s, r) => s + r.price, 0);
  }

  if (othersItems.length > 0) {
    const uniqueIds = [...new Set(othersItems.map(i => i.id))];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const res = await db.execute({ sql: `SELECT id, price, is_sold FROM others WHERE id IN (${placeholders})`, args: uniqueIds });
    if (res.rows.length !== uniqueIds.length) throw new ApiError(404, 'Uno o más productos no encontrados', 'Productos no encontrados');
    const sold = res.rows.find(r => r.is_sold === 1);
    if (sold) throw new ApiError(400, 'Algún producto ya ha sido vendido', 'Producto no disponible');
    for (const item of othersItems) {
      const product = res.rows.find(r => r.id === item.id);
      total += product.price;
    }
    for (const item of othersItems) {
      const varRes = await db.execute({ sql: 'SELECT id, stock FROM other_vars WHERE id = ? AND other_id = ?', args: [item.variantId, item.id] });
      if (varRes.rows.length === 0) throw new ApiError(404, 'Variación no encontrada', 'Variación no encontrada');
    }
  }

  for (const item of items) {
    const shipCost = item.shipping?.cost || 0;
    total += shipCost;
  }

  return total;
}

/**
 * Load product data for line_items from the database.
 * compactItems: [{ type:'art'|'other', id, variantId?, quantity, shipping }]
 */
async function loadProductsDetails(compactItems) {
  const artIds = compactItems.filter(i => i.type === 'art').map(i => i.id);
  const otherIds = compactItems.filter(i => i.type === 'other').map(i => i.id);

  const artMap = new Map();
  const otherMap = new Map();

  if (artIds.length) {
    const placeholders = artIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT id, name, price, slug, basename, description, is_sold, seller_id FROM art WHERE id IN (${placeholders})`,
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
      sql: `SELECT id, name, price, slug, basename, description, is_sold, seller_id FROM others WHERE id IN (${placeholders})`,
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

/**
 * Build line_items from compact items and DB details.
 * Returns { lineItems, productsTotal } where productsTotal is in minor units (cents).
 */
function buildLineItems({ compactItems, artMap, otherMap, siteApiUrl, siteBaseUrl }) {
  const lineItems = [];
  let productsTotal = 0;

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
      ? `${siteApiUrl}/api/art/images/${encodeURIComponent(src.basename)}`
      : `${siteApiUrl}/api/others/images/${encodeURIComponent(src.basename)}`;
    const productUrl = item.type === 'art'
      ? `${siteBaseUrl}/galeria/p/${slug}`
      : `${siteBaseUrl}/galeria/mas/p/${slug}`;

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

/**
 * Compute total shipping cost from compact items.
 * Returns amount in minor units (cents).
 */
function computeShippingTotal(compactItems) {
  let shippingTotal = 0;
  for (const item of compactItems) {
    const c = item.shipping?.cost || 0;
    shippingTotal += Math.round(c * 100);
  }
  return shippingTotal;
}

/**
 * Verify shipping costs server-side by looking up each item's shipping zone cost.
 * For pickup methods, cost must be the zone cost (usually 0).
 * For delivery methods, cost must match the zone for the seller + method + country.
 * Throws ApiError(400) if any cost is manipulated.
 *
 * @param {Array} compactItems - [{type, id, shipping: {methodId, cost, methodType}}]
 * @param {Map} artMap - from loadProductsDetails
 * @param {Map} otherMap - from loadProductsDetails
 */
async function verifyShippingCosts(compactItems, artMap, otherMap) {
  for (const item of compactItems) {
    if (!item.shipping?.methodId) continue;

    const product = item.type === 'art' ? artMap.get(item.id) : otherMap.get(item.id);
    if (!product || !product.seller_id) continue;

    const clientCost = item.shipping.cost || 0;

    // Look up the actual zone cost for this seller + method combination
    const zoneRes = await db.execute({
      sql: `SELECT sz.cost
            FROM shipping_zones sz
            WHERE sz.shipping_method_id = ?
              AND sz.seller_id = ?
            LIMIT 1`,
      args: [item.shipping.methodId, product.seller_id],
    });

    if (zoneRes.rows.length === 0) {
      throw new ApiError(400, 'Método de envío no válido para este vendedor', 'Envío inválido');
    }

    const serverCost = zoneRes.rows[0].cost;
    // Allow a small tolerance for floating point (0.01)
    if (Math.abs(clientCost - serverCost) > 0.01) {
      throw new ApiError(400, 'El coste de envío no coincide. Recarga la página.', 'Coste de envío inválido');
    }
  }
}

module.exports = {
  computeCartTotal,
  loadProductsDetails,
  buildLineItems,
  computeShippingTotal,
  verifyShippingCosts,
};
