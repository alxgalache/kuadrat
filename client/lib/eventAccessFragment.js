// Fragmentos con los que se vuelve a la ficha de un evento
// (event-identity-provider-verification). Único lector:
//
//   #acceso                 la API dejó la prueba en una cookie HttpOnly:
//                           el modal la canjea (POST /identity/complete)
//   #acceso-error=<CÓDIGO>  la vuelta de Google o Microsoft falló, con un
//                           código de ACCESS_VERIFICATION_ERRORS
//   #acceder                «Copiar enlace» desde el navegador de una app:
//                           abre el paso de métodos
//
// Ninguno lleva un secreto: la prueba nunca viaja en la URL, que verían Sentry
// Replay, el píxel de Meta y el historial. Aun así el fragmento se quita al
// leerlo, para que recargar no vuelva a abrir el modal.

export const IDENTITY_ERROR_CODES = [
  'IDENTITY_CANCELLED',
  'IDENTITY_SESSION_LOST',
  'IDENTITY_FAILED',
  'IDENTITY_EMAIL_UNTRUSTED',
  'IDENTITY_PROOF_INVALID',
  'EVENT_FULL',
  'EVENT_CLOSED',
]

const ERROR_PREFIX = '#acceso-error='

/**
 * Lee y quita el fragmento de acceso de la URL actual.
 * @returns {{ kind: 'complete' } | { kind: 'error', code: string } | { kind: 'open' } | null}
 */
export function readAccessFragment() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''

  let result = null
  if (hash === '#acceso') {
    result = { kind: 'complete' }
  } else if (hash.startsWith(ERROR_PREFIX)) {
    const code = hash.slice(ERROR_PREFIX.length)
    result = { kind: 'error', code: IDENTITY_ERROR_CODES.includes(code) ? code : 'IDENTITY_FAILED' }
  } else if (hash === '#acceder') {
    result = { kind: 'open' }
  }

  if (result) {
    // history.state se conserva: el App Router guarda ahí su propio estado.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }
  return result
}
