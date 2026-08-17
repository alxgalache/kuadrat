/**
 * Consentimiento de cookies — persistencia y vocabulario.
 *
 * Dos estados posibles, y `null` cuando el visitante todavía no ha decidido:
 *
 *   'accepted'  → todas las cookies, incluidas las de publicidad (píxel de Meta)
 *   'necessary' → solo las imprescindibles (pago, sesión, carrito, errores)
 *
 * **La ausencia de decisión NO equivale a aceptar.** El píxel solo se carga con
 * 'accepted'; mientras no haya nada guardado no se inyecta ningún script de
 * terceros ni se emite ningún evento. Es el criterio del RGPD y de la guía de
 * la AEPD: el consentimiento se otorga con un acto afirmativo, y seguir
 * navegando no lo es.
 *
 * El rechazo SÍ se persiste, al contrario que en la versión anterior de este
 * banner. Si no se guarda, el banner reaparece en cada recarga a quien ya dijo
 * que no, que es exactamente la insistencia que la norma pretende evitar.
 */

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie_consent';

export const CONSENT_ACCEPTED = 'accepted';
export const CONSENT_NECESSARY = 'necessary';

// Seis meses para ambas decisiones. El valor anterior (30 días) se escribió
// cuando el banner estaba desactivado y no llegaba a mostrarse nunca; volver a
// preguntar cada mes a quien ya rechazó es justo lo que la AEPD desaconseja.
export const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const VALID_VALUES = [CONSENT_ACCEPTED, CONSENT_NECESSARY];

/**
 * Lee la decisión guardada.
 * @returns {'accepted'|'necessary'|null} `null` si no hay decisión, caducó o
 *   el contenido es ilegible — todos ellos se tratan como "aún no ha decidido",
 *   nunca como una aceptación.
 */
export function loadConsent() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const { value, expiresAt } = parsed;

    if (typeof expiresAt === 'number' && Date.now() > expiresAt) {
      window.localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
      return null;
    }

    return VALID_VALUES.includes(value) ? value : null;
  } catch (e) {
    return null;
  }
}

/** Guarda la decisión con su caducidad. */
export function saveConsent(value) {
  if (typeof window === 'undefined') return;
  if (!VALID_VALUES.includes(value)) return;

  try {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ value, expiresAt: Date.now() + CONSENT_TTL_MS })
    );
  } catch (e) {
    // Si localStorage no está disponible (modo privado estricto, cuota llena)
    // la decisión vale para esta sesión y el banner reaparecerá. Preferible a
    // romper la navegación.
  }
}
