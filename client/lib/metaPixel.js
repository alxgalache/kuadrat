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
import { IS_PROD } from './env';
import { insightsAPI } from './api';

/**
 * ¿Puede funcionar el píxel en este build? **Definición única**: tanto este
 * módulo como `components/MetaPixel.js` la consultan, para que no puedan
 * discrepar. Son DOS condiciones independientes, a propósito:
 *
 *  1. Hay un id de conjunto de datos configurado.
 *  2. El build es de producción (`NEXT_PUBLIC_APP_ENV=production`) y no se está
 *     ejecutando `next dev`.
 *
 * Con solo la primera, la protección de preproducción y local sería una
 * convención — "acuérdate de dejar la variable vacía" — y basta con copiar un
 * `.env` para empezar a mandar tráfico de pruebas al conjunto de datos real,
 * ensuciando justo la señal con la que Meta optimiza las campañas. De hecho ya
 * ocurrió: el id real acabó en el `.env` local en cuanto se configuró.
 *
 * `NODE_ENV` no distingue preproducción de producción —`next build` lo fuerza a
 * 'production' y lo inlinea, de ahí que exista `NEXT_PUBLIC_APP_ENV`— pero bajo
 * `next dev` sí es fiable y no depende de que nadie configure nada, así que
 * sirve de segundo cinturón para local.
 */
export const META_PIXEL_ENABLED =
  !!META_PIXEL_ID && IS_PROD && process.env.NODE_ENV !== 'development';

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
  // Solo se reintenta el lado del PÍXEL: la copia servidor→servidor de estos
  // mismos eventos ya salió en su momento (no se bufferiza porque no depende de
  // ningún script de terceros). Reenviarlos aquí los duplicaría en Meta, esta
  // vez sin remedio: serían dos envíos idénticos por el MISMO canal, y la
  // deduplicación por `event_id` solo actúa entre canales distintos.
  queued.forEach(([event, params, eventId]) => sendToPixel(event, params, eventId));
}

// ── Identificadores de emparejamiento (_fbp / _fbc) ──────────────────────────
//
// Son lo que permite a Meta reconocer a la persona y atribuir la conversión al
// anuncio. Normalmente los crea `fbevents.js`… que es justo lo que el
// bloqueador impide, así que en las visitas que queremos recuperar NO EXISTEN.
// Por eso los mantenemos nosotros:
//
//  - `_fbc` deriva del `fbclid` que Meta añade a la URL al pulsar el anuncio.
//    Viaja en la propia URL de aterrizaje, así que lo tenemos aunque el píxel
//    esté completamente bloqueado. Es la señal de atribución más fuerte y la
//    única que conecta la visita con la campaña que la pagó.
//  - `_fbp` es un identificador propio del navegador. Si el píxel no lo ha
//    creado, generamos uno con el mismo formato y lo persistimos.
//
// Ambos se crean SOLO con consentimiento publicitario: son identificadores para
// publicidad, y crearlos antes de que el visitante acepte sería exactamente lo
// que el banner existe para impedir.

const FBP_STORAGE_KEY = 'meta_fbp';
const FBC_STORAGE_KEY = 'meta_fbc';

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    // Sin almacenamiento el emparejamiento es peor, pero el evento sale igual.
  }
}

/** `_fbp` de la cookie del píxel, o uno propio persistente si no existe. */
function getFbp() {
  const fromCookie = readCookie('_fbp');
  if (fromCookie) return fromCookie;

  const stored = readStored(FBP_STORAGE_KEY);
  if (stored) return stored;

  // Formato de Meta: fb.<subdominio>.<creación en ms>.<aleatorio>
  const generated = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
  writeStored(FBP_STORAGE_KEY, generated);
  return generated;
}

/** `_fbc` de la cookie, del `fbclid` de la URL actual, o del guardado antes. */
function getFbc() {
  const fromCookie = readCookie('_fbc');
  if (fromCookie) return fromCookie;

  try {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (fbclid) {
      const built = `fb.1.${Date.now()}.${fbclid}`;
      // Se persiste porque la compra ocurre varias páginas después del
      // aterrizaje, y para entonces el `fbclid` ya no está en la URL. Sin
      // guardarlo, la conversión llegaría sin la señal que la conecta con el
      // anuncio: medida, pero no atribuida.
      writeStored(FBC_STORAGE_KEY, built);
      return built;
    }
  } catch (e) {
    // URL malformada: seguimos con lo que hubiera guardado.
  }

  return readStored(FBC_STORAGE_KEY);
}

/** Identificador único de evento, compartido entre píxel y servidor. */
function newEventId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch (e) {
    // Sigue el camino de abajo.
  }
  return `e${Date.now()}${Math.floor(Math.random() * 1e6)}`;
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

/** Entrega el evento al píxel del navegador, o lo bufferiza si aún no está. */
function sendToPixel(event, params, eventId) {
  const pixel = fbq();
  if (!pixel) {
    // Hay consentimiento pero el snippet aún no ha corrido: guardar y reenviar.
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push([event, params, eventId]);
    }
    return;
  }

  try {
    pixel('track', event, params || {}, { eventID: eventId });
  } catch (err) {
    // Nunca propagamos: el tracking es accesorio al flujo de compra.
    console.warn('Meta Pixel: no se pudo enviar el evento', event, err);
  }
}

/**
 * Entrega el evento a nuestra API, que lo reenvía a la Conversions API de Meta.
 *
 * Esta es la copia que sobrevive a los bloqueadores de anuncios, porque va
 * contra nuestro propio dominio. Nunca se espera (`await`) ni se propaga un
 * fallo: la medición no puede retrasar ni romper la navegación.
 */
function sendToApi(event, params, eventId, orderId) {
  try {
    insightsAPI.trackEvent({
      eventName: event,
      eventId,
      eventSourceUrl: window.location.href,
      orderId,
      // En Purchase, el importe y los datos del comprador los pone la API desde
      // el pedido; aquí solo viajan los identificadores de producto.
      customData: params,
      fbp: getFbp(),
      fbc: getFbc(),
    });
  } catch (err) {
    // Ni siquiera un fallo síncrono construyendo la petición debe escapar.
  }
}

/**
 * Emite un evento estándar por LOS DOS caminos: el píxel del navegador y la
 * Conversions API a través de nuestro servidor.
 *
 * El `event_id` es lo que hace que eso no cuente doble: Meta descarta la
 * segunda copia cuando coinciden nombre e id. Por eso se genera aquí, una sola
 * vez, y se manda idéntico a ambos destinos. Si alguna vez se separan estos dos
 * envíos en dos rutas de código distintas, cada conversión pasará a valer dos.
 *
 * @param {string} event      Nombre del evento estándar de Meta.
 * @param {object} [params]   Parámetros del evento (value, currency, contents…).
 * @param {object} [options]  `{ eventID }` para forzar el id (Purchase usa el
 *                            del pedido) y `{ orderId }` para que la API pueda
 *                            reconstruir la compra desde la base de datos.
 */
export function track(event, params, options) {
  if (!META_PIXEL_ENABLED) return;
  if (!consentGranted) return;
  if (typeof window === 'undefined') return;

  const eventId = options?.eventID || newEventId();

  sendToPixel(event, params, eventId);
  sendToApi(event, params, eventId, options?.orderId);
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

  // `orderId` va además como tal, no solo dentro del `eventID`: es lo que
  // permite a la API releer el pedido y reconstruir el evento con el importe
  // real y los datos hasheados del comprador (correo, teléfono, nombre, ciudad,
  // código postal), que es lo que de verdad hace que Meta empareje la
  // conversión. Sin él, la copia servidor→servidor llegaría sin identidad.
  track('Purchase', params, orderId ? { eventID: `order_${orderId}`, orderId } : undefined);
}

/** Serializa el carrito para guardarlo junto al token del pedido (Purchase posterior). */
export function cartToContents(items) {
  return (items || []).map(toContent);
}
