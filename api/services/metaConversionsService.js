/**
 * Meta Conversions API — envío servidor→servidor de eventos de publicidad.
 *
 * POR QUÉ EXISTE: `fbevents.js` lo bloquea una parte apreciable de los
 * navegadores (`ERR_BLOCKED_BY_CLIENT`), y esas conversiones no llegan nunca a
 * Meta. El resultado es que las campañas optimizan con menos señal de la que
 * hay, y se paga más por cada venta. Este módulo manda los mismos eventos desde
 * la API, que ningún bloqueador puede interceptar.
 *
 * LA DEDUPLICACIÓN ES EL PUNTO CRÍTICO, y no es opcional. Navegador y servidor
 * mandan el MISMO evento, así que sin deduplicar cada conversión se contaría
 * dos veces y el ROAS quedaría inflado al doble — peor que no medir. Meta
 * deduplica cuando coinciden `event_name` **y** `event_id`, así que el
 * `event_id` lo genera SIEMPRE el cliente y viaja por los dos caminos. Un id
 * generado aquí no serviría de nada: sería distinto del que usó el navegador.
 *
 * EL CONSENTIMIENTO NO SE ESQUIVA POR IR POR SERVIDOR. La Conversions API
 * sortea bloqueadores de anuncios, no el RGPD: quien elige "Solo las
 * necesarias" no genera eventos por ninguna de las dos vías. El cliente no
 * llama a este endpoint sin consentimiento, que es donde vive la decisión.
 *
 * NADA DE ESTE MÓDULO PUEDE ROMPER UNA COMPRA: todos los envíos son "dispara y
 * olvida" con su propio try/catch y su propio timeout. Un fallo de Meta no
 * puede propagarse a la respuesta que espera el comprador.
 */

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');

// Eventos estándar que aceptamos. Lista blanca explícita: el endpoint es
// público (lo llama el navegador) y sin ella cualquiera podría inyectar
// nombres arbitrarios en el conjunto de datos.
const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
]);

const REQUEST_TIMEOUT_MS = 4000;

/** ¿Está configurado y activo el envío server-side? */
function isEnabled() {
  return !!config.meta.enabled;
}

/**
 * Normaliza y hashea un dato personal según las reglas de Meta.
 *
 * El hash NO es un detalle de privacidad opcional: Meta rechaza estos campos en
 * claro. Y la normalización tampoco es cosmética — 'Ale@140D.art ' y
 * 'ale@140d.art' producen hashes distintos, así que saltársela no da error
 * ninguno, simplemente hace que el usuario no empareje con nadie y la
 * conversión no se atribuya. Es un fallo invisible.
 */
function hashField(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Teléfono: solo dígitos, con prefijo de país y sin '+' ni separadores. */
function hashPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return crypto.createHash('sha256').update(digits, 'utf8').digest('hex');
}

/** Nombres y ciudades: sin puntuación ni espacios, en minúsculas. */
function hashName(value) {
  if (!value) return null;
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (!cleaned) return null;
  return crypto.createHash('sha256').update(cleaned, 'utf8').digest('hex');
}

/**
 * Construye el bloque `user_data`, que es lo que determina la calidad del
 * emparejamiento. Cuantas más señales, mayor probabilidad de que Meta reconozca
 * a la persona y atribuya la conversión al anuncio.
 *
 * `fbc` (derivado del `fbclid` del clic en el anuncio) es la señal más fuerte y
 * la única que sobrevive con el píxel bloqueado, porque llega en la URL de
 * aterrizaje y no depende de ningún script de Meta.
 */
function buildUserData({ email, phone, firstName, lastName, city, postalCode, country, ip, userAgent, fbp, fbc }) {
  const userData = {};

  const em = hashField(email);
  if (em) userData.em = [em];

  const ph = hashPhone(phone);
  if (ph) userData.ph = [ph];

  const fn = hashName(firstName);
  if (fn) userData.fn = [fn];

  const ln = hashName(lastName);
  if (ln) userData.ln = [ln];

  const ct = hashName(city);
  if (ct) userData.ct = [ct];

  const zp = hashField(postalCode);
  if (zp) userData.zp = [zp];

  const co = hashField(country);
  if (co) userData.country = [co];

  // IP y user-agent viajan EN CLARO, al contrario que todo lo anterior: Meta
  // los usa tal cual para el emparejamiento y hashearlos los invalidaría.
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return userData;
}

/**
 * Envía uno o varios eventos. Nunca lanza.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendEvents(events) {
  if (!isEnabled()) return { sent: false, reason: 'disabled' };
  if (!Array.isArray(events) || events.length === 0) {
    return { sent: false, reason: 'no_events' };
  }

  const url = `https://graph.facebook.com/${config.meta.apiVersion}/${config.meta.pixelId}/events`;

  const body = {
    data: events,
    access_token: config.meta.accessToken,
  };
  if (config.meta.testEventCode) {
    body.test_event_code = config.meta.testEventCode;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Se registra el error de Meta pero NUNCA el cuerpo enviado ni el token:
      // el primero lleva hashes de datos personales y el segundo es una
      // credencial con permiso de escritura sobre el conjunto de datos.
      logger.warn(
        {
          status: response.status,
          metaError: payload?.error?.message,
          metaCode: payload?.error?.code,
          eventNames: events.map((e) => e.event_name),
        },
        'Meta CAPI rechazó los eventos'
      );
      return { sent: false, reason: 'rejected' };
    }

    logger.info(
      { received: payload?.events_received, eventNames: events.map((e) => e.event_name) },
      'Meta CAPI: eventos enviados'
    );
    return { sent: true };
  } catch (err) {
    // Incluye el AbortError del timeout. Que Meta no conteste es una pérdida de
    // medición, no un error de la aplicación: se registra y se sigue.
    logger.warn({ err: err.message, eventNames: events.map((e) => e.event_name) }, 'Meta CAPI no disponible');
    return { sent: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Construye un evento completo listo para `sendEvents`.
 *
 * `event_time` en segundos (Meta rechaza milisegundos) y `action_source` a
 * 'website' porque el origen real es una navegación, aunque el envío lo haga el
 * servidor.
 */
function buildEvent({ eventName, eventId, eventSourceUrl, userData, customData, eventTime }) {
  const event = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData || {},
  };

  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length > 0) event.custom_data = customData;

  return event;
}

module.exports = {
  isEnabled,
  sendEvents,
  buildEvent,
  buildUserData,
  hashField,
  hashPhone,
  hashName,
  ALLOWED_EVENTS,
};
