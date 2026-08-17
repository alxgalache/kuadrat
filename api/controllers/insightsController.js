/**
 * Relé de eventos de publicidad hacia la Conversions API de Meta.
 *
 * El navegador manda aquí los mismos eventos que entrega al píxel, con el mismo
 * `event_id`, y la API los reenvía a Meta. Como esta petición va a nuestro
 * propio dominio, los bloqueadores de anuncios no la cortan: es lo que recupera
 * las conversiones que hoy se pierden.
 *
 * Para `Purchase` el cliente NO manda el importe ni los datos del comprador,
 * solo el `orderId`: la API los lee del pedido. Dos razones, y la segunda es la
 * importante: (1) es el único dato fiable —el cliente podría mentir sobre el
 * valor y ensuciar el ROAS—, y (2) evita que un endpoint público acepte
 * correos y teléfonos de terceros, que lo convertiría en un buzón para inyectar
 * identidades ajenas en el conjunto de datos de Meta.
 */

const db = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const metaConversions = require('../services/metaConversionsService');
const { sendSuccess } = require('../utils/response');

/**
 * Cookies de Meta que mejoran el emparejamiento.
 *
 * `_fbc` se deriva del `fbclid` que Meta añade a la URL al hacer clic en un
 * anuncio, y es la señal de atribución más fuerte que existe. Cuando el píxel
 * está bloqueado ninguna de las dos cookies llega a crearse; el evento se manda
 * igual, apoyado en IP, user-agent y —en Purchase— los datos hasheados del
 * pedido.
 */
function readMetaCookies(req) {
  const raw = req.headers.cookie || '';
  const jar = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    if (name === '_fbp' || name === '_fbc') {
      jar[name] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return { fbp: jar._fbp || null, fbc: jar._fbc || null };
}

/**
 * IP real del visitante.
 *
 * Se toma el PRIMER valor de X-Forwarded-For, que es el cliente; los siguientes
 * los añaden los proxies intermedios. Express ya resuelve `req.ip` con
 * `trust proxy`, pero se comprueba explícitamente porque una IP equivocada no
 * da error: simplemente empeora el emparejamiento sin que nada lo indique.
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || null;
}

/**
 * Carga los datos de emparejamiento de un pedido pagado.
 * @returns {Promise<object|null>} null si no existe o no está pagado.
 */
async function loadPaidOrder(orderId) {
  const result = await db.execute({
    sql: `SELECT id, status, total_price, full_name, email, guest_email, phone,
                 delivery_city, delivery_postal_code, delivery_country
            FROM orders
           WHERE id = ?`,
    args: [orderId],
  });

  if (result.rows.length === 0) return null;
  const order = result.rows[0];

  // Solo se reporta como conversión un pedido REALMENTE pagado. Fiarse de que
  // el cliente solo llama tras pagar permitiría inflar las conversiones —y con
  // ellas la optimización de las campañas— con una petición a mano.
  if (order.status !== 'paid') return null;

  return order;
}

/** Parte `full_name` en nombre y apellidos, que es como los quiere Meta. */
function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * POST /api/insights/events
 * Body: { eventName, eventId, eventSourceUrl?, orderId?, customData? }
 */
async function trackEvent(req, res, next) {
  try {
    // Responder 200 con `forwarded: false` en vez de un error: para el
    // navegador esto es telemetría accesoria, y un 4xx solo generaría ruido en
    // la consola de todos los visitantes cuando la integración está apagada.
    if (!metaConversions.isEnabled()) {
      return sendSuccess(res, { forwarded: false, reason: 'disabled' });
    }

    const { eventName, eventId, eventSourceUrl, orderId, customData } = req.body || {};

    if (!metaConversions.ALLOWED_EVENTS.has(eventName)) {
      return sendSuccess(res, { forwarded: false, reason: 'unsupported_event' });
    }

    // Los del cuerpo tienen prioridad sobre las cookies: la API vive en otro
    // subdominio y la cabecera Cookie normalmente no trae `_fbp`/`_fbc`. El
    // cliente las lee de `document.cookie` —o fabrica las suyas cuando el píxel
    // está bloqueado, que es el caso que este endpoint existe para cubrir— y
    // las adjunta. La lectura de la cabecera queda como respaldo.
    const cookieMatch = readMetaCookies(req);
    const baseMatch = {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
      fbp: req.body.fbp || cookieMatch.fbp,
      fbc: req.body.fbc || cookieMatch.fbc,
    };

    let userData;
    let finalCustomData = customData || {};

    if (eventName === 'Purchase') {
      // El importe y la identidad SIEMPRE salen del pedido, nunca del cliente.
      const order = orderId ? await loadPaidOrder(orderId) : null;
      if (!order) {
        return sendSuccess(res, { forwarded: false, reason: 'order_not_payable' });
      }

      const { firstName, lastName } = splitName(order.full_name);
      userData = metaConversions.buildUserData({
        ...baseMatch,
        email: order.email || order.guest_email,
        phone: order.phone,
        firstName,
        lastName,
        city: order.delivery_city,
        postalCode: order.delivery_postal_code,
        country: order.delivery_country,
      });

      finalCustomData = {
        ...finalCustomData,
        value: Number(order.total_price) || 0,
        currency: 'EUR',
      };
    } else {
      userData = metaConversions.buildUserData(baseMatch);
    }

    const event = metaConversions.buildEvent({
      eventName,
      eventId,
      eventSourceUrl,
      userData,
      customData: finalCustomData,
    });

    // Sin `await`: la respuesta al navegador no espera a Meta. El servicio no
    // lanza nunca, pero se encadena un catch por si acaso, porque una promesa
    // rechazada sin manejar tumbaría el proceso en Node.
    metaConversions
      .sendEvents([event])
      .catch((err) => logger.warn({ err: err.message }, 'Meta CAPI: fallo no controlado'));

    return sendSuccess(res, { forwarded: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { trackEvent };
