/**
 * Meta Pixel — emisión de eventos estándar (ViewContent, AddToCart,
 * InitiateCheckout, Purchase) para optimizar campañas de Instagram/Facebook.
 *
 * Reglas de este módulo:
 *
 *  - TODAS las llamadas pasan por `track()`, que es un no-op silencioso si no
 *    hay `META_PIXEL_ID`, si no hay consentimiento publicitario, o si
 *    `window.fbq` todavía no existe. Ningún punto de la aplicación debe llamar
 *    a `window.fbq` directamente: un fallo del script de Meta (bloqueador de
 *    anuncios, red caída) no puede romper el carrito.
 *  - **El consentimiento es una puerta, no un filtro posterior.** Sin
 *    'accepted' no se guarda ni se acumula nada: `track()` descarta el evento
 *    en el acto. Bufferizar "por si acaso acepta luego" convertiría el rechazo
 *    en un aplazamiento.
 *  - Los `content_ids` son `art_<id>` / `other_<id>[_v<variantId>]`. Es el
 *    mismo formato que tendría que usar un futuro catálogo de productos en
 *    Meta Commerce; cambiarlo obliga a regenerar el catálogo.
 */

import { META_PIXEL_ID } from './constants';

export const META_PIXEL_ENABLED = !!META_PIXEL_ID;

// Consentimiento publicitario vigente. Lo escribe `components/MetaPixel.js`
// desde el contexto de cookies; por defecto NO hay consentimiento.
let consentGranted = false;

// Eventos emitidos con consentimiento pero antes de que el snippet de Meta
// haya definido `window.fbq`. Es una ventana real: desde que el visitante
// acepta hasta que Next inyecta el script pasan milisegundos, y una ficha de
// producto puede resolver su fetch justo ahí. Sin este búfer el ViewContent de
// esa visita se perdería en silencio, que es el peor modo de fallo posible
// para un píxel — todo parece funcionar y las conversiones no cuadran.
let pendingEvents = [];
const MAX_PENDING_EVENTS = 20;

/** Declara si hay consentimiento publicitario. Al revocarlo se tira el búfer. */
export function setPixelConsent(granted) {
  consentGranted = !!granted;
  if (!consentGranted) pendingEvents = [];
}

/** Vacía el búfer. Lo llama MetaPixel cuando el snippet ya definió `fbq`. */
export function flushPendingEvents() {
  if (!consentGranted) {
    pendingEvents = [];
    return;
  }
  const queued = pendingEvents;
  pendingEvents = [];
  queued.forEach(([event, params, options]) => track(event, params, options));
}

// Toda la tienda opera en euros (es-ES). Meta exige el ISO-4217 en cada evento
// con `value`, y omitirlo hace que el evento no sea optimizable a conversión.
const CURRENCY = 'EUR';

function fbq() {
  if (!META_PIXEL_ENABLED) return null;
  if (typeof window === 'undefined') return null;
  if (typeof window.fbq !== 'function') return null;
  return window.fbq;
}

/**
 * Emite un evento estándar del píxel.
 * @param {string} event      Nombre del evento estándar de Meta.
 * @param {object} [params]   Parámetros del evento (value, currency, contents…).
 * @param {object} [options]  Opciones del píxel; `{ eventID }` deduplica.
 */
export function track(event, params, options) {
  if (!META_PIXEL_ENABLED) return;
  if (!consentGranted) return;
  if (typeof window === 'undefined') return;

  const pixel = fbq();
  if (!pixel) {
    // Hay consentimiento pero el snippet aún no ha corrido: guardar y reenviar.
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push([event, params, options]);
    }
    return;
  }

  try {
    if (options) {
      pixel('track', event, params || {}, options);
    } else {
      pixel('track', event, params || {});
    }
  } catch (err) {
    // Nunca propagamos: el tracking es accesorio al flujo de compra.
    console.warn('Meta Pixel: no se pudo enviar el evento', event, err);
  }
}

/** Identificador de producto estable entre eventos (y con un futuro catálogo). */
export function contentId(productType, productId, variantId = null) {
  const base = `${productType}_${productId}`;
  return variantId ? `${base}_v${variantId}` : base;
}

/** Convierte una línea de carrito en un `contents[]` de Meta. */
function toContent(item) {
  return {
    id: contentId(item.productType, item.productId, item.variantId),
    quantity: item.quantity || 1,
    item_price: Number(item.price) || 0,
  };
}

/** Suma de `price * quantity` redondeada a céntimos. */
function cartValue(items) {
  const total = items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1),
    0
  );
  return Math.round(total * 100) / 100;
}

/** PageView manual: el App Router navega sin recargar y el snippet base solo cuenta la primera. */
export function trackPageView() {
  track('PageView');
}

/** Ficha de producto (obra o artículo de tienda). */
export function trackViewContent({ productType, productId, name, price, category }) {
  track('ViewContent', {
    content_ids: [contentId(productType, productId)],
    content_type: 'product',
    content_name: name,
    content_category: category || (productType === 'art' ? 'Obra' : 'Tienda'),
    value: Number(price) || 0,
    currency: CURRENCY,
  });
}

/** Añadir a la cesta. Se emite desde `CartContext.addToCart`, punto único. */
export function trackAddToCart(item) {
  track('AddToCart', {
    content_ids: [contentId(item.productType, item.productId, item.variantId)],
    content_type: 'product',
    content_name: item.name,
    contents: [toContent(item)],
    value: cartValue([item]),
    currency: CURRENCY,
  });
}

/** Inicio del checkout (paso carrito → dirección). */
export function trackInitiateCheckout({ items, value }) {
  const list = items || [];
  track('InitiateCheckout', {
    content_ids: list.map((item) => contentId(item.productType, item.productId, item.variantId)),
    content_type: 'product',
    contents: list.map(toContent),
    num_items: list.reduce((sum, item) => sum + (item.quantity || 1), 0),
    value: typeof value === 'number' ? Math.round(value * 100) / 100 : cartValue(list),
    currency: CURRENCY,
  });
}

/**
 * Compra confirmada.
 *
 * `orderId` viaja como `eventID`: la página de confirmación se alcanza por tres
 * caminos (token en sessionStorage, redirección 3DS de Stripe, retorno de
 * Revolut Pay) y el usuario puede además recargarla. Meta deduplica por
 * `eventID`, así que el mismo pedido nunca cuenta dos veces.
 */
export function trackPurchase({ orderId, value, contents }) {
  const list = contents || [];

  // El desglose de líneas no siempre está disponible: cuando Stripe devuelve al
  // usuario tras el 3-D Secure la sesión puede haberse perdido y solo tenemos
  // el importe del PaymentIntent. `value` + `currency` es lo que Meta necesita
  // para atribuir la conversión; los `contents` vacíos, en cambio, sí ensucian
  // el catálogo, así que se omiten en lugar de enviarse en blanco.
  const params = {
    value: Math.round((Number(value) || 0) * 100) / 100,
    currency: CURRENCY,
  };

  if (list.length > 0) {
    params.content_ids = list.map((entry) => entry.id);
    params.content_type = 'product';
    params.contents = list;
    params.num_items = list.reduce((sum, entry) => sum + (entry.quantity || 1), 0);
  }

  track('Purchase', params, orderId ? { eventID: `order_${orderId}` } : undefined);
}

/** Serializa el carrito para guardarlo junto al token del pedido (Purchase posterior). */
export function cartToContents(items) {
  return (items || []).map(toContent);
}
