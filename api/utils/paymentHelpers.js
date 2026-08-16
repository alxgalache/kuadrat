const { db } = require('../config/database');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { resolveShippingOptions } = require('../services/shipping/zoneResolver');

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
  const artIds = [...new Set(compactItems.filter(i => i.type === 'art').map(i => i.id))];
  const otherIds = [...new Set(compactItems.filter(i => i.type === 'other').map(i => i.id))];

  const artMap = new Map();
  const otherMap = new Map();

  if (artIds.length) {
    const placeholders = artIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT a.id, a.name, a.price, a.slug,
                   (SELECT basename FROM product_images WHERE product_type = 'art' AND product_id = a.id ORDER BY position ASC, id ASC LIMIT 1) AS basename,
                   a.description, a.is_sold, a.seller_id
            FROM art a WHERE a.id IN (${placeholders})`,
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
      sql: `SELECT o.id, o.name, o.price, o.slug,
                   (SELECT basename FROM product_images WHERE product_type = 'other' AND product_id = o.id ORDER BY position ASC, id ASC LIMIT 1) AS basename,
                   o.description, o.is_sold, o.seller_id
            FROM others o WHERE o.id IN (${placeholders})`,
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
 * Verify each item's shipping cost against the zone that actually applies to
 * that product, that method and the address the order is being shipped to.
 *
 * This does NOT query the database itself. It calls the same resolver that
 * quoted the buyer (`api/services/shipping/zoneResolver.js`) and looks up the
 * method the buyer chose in the result, so the price shown and the price
 * validated are the same number rather than two numbers that have to agree.
 *
 * It used to resolve with `WHERE shipping_method_id = ? AND seller_id = ?
 * LIMIT 1`, which matched every zone group of every artwork sharing a method
 * and returned an arbitrary one. See the change `shipping-cost-verification`.
 *
 * The destination is the ORDER's delivery address, never the postal code the
 * cart captured when the product was added: that value is client-supplied and
 * trusting it lets a buyer pay a peninsular rate and ship to the Canaries.
 *
 * @param {Array} compactItems - [{type, id, shipping: {methodId, cost, methodType}}]
 * @param {Map} artMap - from loadProductsDetails
 * @param {Map} otherMap - from loadProductsDetails
 * @param {object} [options]
 * @param {{country: string, postalCode: string}} [options.deliveryAddress]
 * @throws {ApiError} 400 SHIPPING_ADDRESS_REQUIRED | SHIPPING_METHOD_UNAVAILABLE | SHIPPING_COST_OUTDATED
 */
async function verifyShippingCosts(compactItems, artMap, otherMap, options = {}) {
  const { deliveryAddress } = options;

  for (const item of compactItems) {
    // Items quoted live against Sendcloud arrive with no method on the cart
    // item, and are priced by their own flow. This guard is what keeps them
    // out of legacy zone verification entirely.
    if (!item.shipping?.methodId) continue;

    const product = item.type === 'art' ? artMap.get(item.id) : otherMap.get(item.id);
    if (!product || !product.seller_id) continue;

    const clientCost = item.shipping.cost || 0;
    const isPickup = item.shipping.methodType === 'pickup';

    // Pickup zones are seller-wide and carry no geographic filter, so a
    // pickup-only cart legitimately has no delivery address.
    if (!isPickup && !deliveryAddress?.postalCode) {
      throw new ApiError(
        400,
        'Falta la dirección de entrega para calcular el envío.',
        'SHIPPING_ADDRESS_REQUIRED'
      );
    }

    const { pickup, delivery } = await resolveShippingOptions({
      productId: item.id,
      productType: item.type,
      country: isPickup ? undefined : (deliveryAddress.country || 'ES'),
      postalCode: isPickup ? undefined : deliveryAddress.postalCode,
    });

    const option = [...pickup, ...delivery].find(
      (candidate) => Number(candidate.methodId) === Number(item.shipping.methodId)
    );

    if (!option) {
      throw new ApiError(
        400,
        'El método de envío elegido ya no está disponible para esa dirección. Vuelve a seleccionar el envío.',
        'SHIPPING_METHOD_UNAVAILABLE'
      );
    }

    // One cent of tolerance, compared in integer cents. The obvious
    // `Math.abs(a - b) > 0.01` does not express that: 15.30 and 15.29 are
    // 0.010000000000001563 apart in binary floating point, so the boundary the
    // comparison claims to allow is in fact rejected, at random, depending on
    // the values.
    const clientCents = Math.round(clientCost * 100);
    const serverCents = Math.round(option.cost * 100);
    if (Math.abs(clientCents - serverCents) > 1) {
      throw new ApiError(
        400,
        `El precio del envío ha cambiado (ahora ${option.cost.toFixed(2)} €). Elimina el producto de la cesta y vuelve a añadirlo para continuar.`,
        'SHIPPING_COST_OUTDATED'
      );
    }

    logger.info(
      {
        productType: item.type,
        productId: item.id,
        methodId: option.methodId,
        zoneId: option.zoneId,
        cost: option.cost,
      },
      'Shipping cost verified'
    );
  }
}

module.exports = {
  computeCartTotal,
  loadProductsDetails,
  buildLineItems,
  computeShippingTotal,
  verifyShippingCosts,
};
