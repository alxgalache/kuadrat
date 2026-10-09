/**
 * Líneas de cesta y «¿se puede comprar?», en un solo sitio.
 *
 * Tres páginas meten productos en la cesta: la ficha de una obra, la ficha de
 * un producto de la tienda y `/cesta`, la URL de compra a la que Meta envía a
 * quien compra desde Instagram o Facebook. Antes cada ficha escribía el objeto
 * de `addToCart` a mano en tres sitios, y las copias ya habían divergido: una
 * leía `product.basename`, un campo que los productos ya no tienen. Aquí está
 * la única definición.
 *
 * `weight` y `dimensions` viajan siempre. Nada en la cesta los lee (el paso de
 * envío solo manda identidad y cantidad), así que incluirlos también en el
 * flujo con envío elegido no cambia ningún comportamiento.
 */

import { PAYMENT_ENABLED, ART_BUY_AVAILABLE, SENDCLOUD_ENABLED_ART, SENDCLOUD_ENABLED_OTHERS } from './constants'

// Lo que muestra la ficha para una variante sin nombre.
export const DEFAULT_VARIANT_LABEL = 'Opción estándar'

// Máximo de unidades de una variante en una línea: el del selector de la ficha
// y el del cajón de compra.
export const MAX_CART_QUANTITY = 10

// CTA de la ficha de una obra según los interruptores de la tienda.
// Devuelve 'none' | 'cart' | 'quote'. «Vendido» se resuelve aparte y siempre
// tiene prioridad.
//   los dos en false -> none
//   los dos en true  -> cart («Añadir a la cesta»)
//   cualquier otro   -> quote («Solicitar cotización»)
export function getArtCta() {
  if (!PAYMENT_ENABLED && !ART_BUY_AVAILABLE) return 'none'
  if (PAYMENT_ENABLED && ART_BUY_AVAILABLE) return 'cart'
  return 'quote'
}

/**
 * ¿Sigue a la venta? Ni vendido ni en subasta ni en sorteo, que se venden por
 * otra vía. Que además se pueda comprar con la cesta depende de los
 * interruptores de la tienda (`isArtPurchasable`, `isVariantPurchasable`).
 */
export function isProductOnSale(product) {
  if (!product || product.is_sold === 1) return false
  return Number(product.for_auction) !== 1 && Number(product.for_draw) !== 1
}

/** ¿Se puede añadir esta obra a la cesta? */
export function isArtPurchasable(product) {
  return isProductOnSale(product) && getArtCta() === 'cart'
}

/** ¿Se puede añadir esta variante de la tienda a la cesta? */
export function isVariantPurchasable(product, variant) {
  if (!variant || !PAYMENT_ENABLED || !isProductOnSale(product)) return false
  const belongs = (product.variations || []).some((v) => v.id === variant.id)
  return belongs && Number(variant.stock) > 0
}

/**
 * ¿Hay que elegir el envío al añadir el producto a la cesta? Sí cuando su tipo
 * no usa Sendcloud: la obra lee las zonas que escribe la calculadora
 * (`SENDCLOUD_ENABLED_ART` sigue en false) y el cajón no ofrece cómo elegirlo
 * después. Con Sendcloud se elige en el paso 3 del cajón.
 *
 * @param {'art'|'other'} productType
 */
export function needsShippingOnAdd(productType) {
  return productType === 'art' ? !SENDCLOUD_ENABLED_ART : !SENDCLOUD_ENABLED_OTHERS
}

/**
 * Línea de cesta de una obra. Una obra es única: cantidad 1.
 *
 * @param {object} product  la obra tal como la devuelve `GET /api/art/:id`
 * @param {object|null} shipping  el método elegido, o null si se elige en el cajón (Sendcloud)
 */
export function artCartItem(product, shipping = null) {
  return {
    productId: product.id,
    productType: 'art',
    name: product.name,
    price: product.price,
    basename: product.images?.[0]?.basename || product.thumbnail_basename || null,
    slug: product.slug,
    sellerId: product.seller_id,
    sellerName: product.seller_full_name,
    quantity: 1,
    shipping,
    weight: product.weight || null,
    dimensions: product.dimensions || null,
  }
}

/**
 * Línea de cesta de una variante de la tienda.
 *
 * @param {object} product  el producto tal como lo devuelve `GET /api/others/:id`
 * @param {object} variant  una de `product.variations`
 * @param {number} quantity
 * @param {object|null} shipping  el método elegido, o null si se elige en el cajón (Sendcloud)
 */
export function otherCartItem(product, variant, quantity, shipping = null) {
  return {
    productId: product.id,
    productType: 'other',
    name: product.name,
    price: product.price,
    basename: variant?.images?.[0]?.basename || product.images?.[0]?.basename || product.thumbnail_basename || null,
    slug: product.slug,
    sellerId: product.seller_id,
    sellerName: product.seller_full_name,
    quantity,
    variantId: variant.id,
    variantKey: variant.key || DEFAULT_VARIANT_LABEL,
    shipping,
    weight: product.weight || null,
    dimensions: product.dimensions || null,
  }
}
