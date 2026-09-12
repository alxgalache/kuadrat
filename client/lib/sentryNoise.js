/**
 * Filtros de ruido de Sentry que necesitan mirar el evento entero, no solo su
 * mensaje (los que bastan con el mensaje o la URL del script viven en
 * `ignoreErrors` / `denyUrls` de instrumentation-client.js).
 *
 * Funciones puras y sin imports: instrumentation-client.js se carga antes que
 * la aplicación.
 */

// Redacción de WebKit para un `play()` abortado por una carga posterior.
// Chrome y Firefox dicen otra cosa ante el mismo aborto, y el camino de Agora
// descrito abajo solo se ejecuta en iOS, así que la cadena exacta forma parte
// del filtro a propósito.
const WEBKIT_ABORT_MESSAGE = 'The operation was aborted.'

// Solo rechazos que nadie capturó (@sentry/browser 10.x). Un aborto que nuestro
// código captura y reporta no llega por aquí y no se descarta.
const UNHANDLED_REJECTION = 'auto.browser.global_handlers.onunhandledrejection'

/**
 * `play()` abortado DENTRO del SDK de Agora al cambiar de cámara en iOS.
 *
 * El reproductor de vídeo de `agora-rtc-sdk-ng` (4.24.6) escucha el fin de una
 * interrupción de audio de iOS —`SM.on(IOS_INTERRUPTION_END,
 * autoResumeAfterInterruption)`, que el SDK emite cuando el AudioContext pasa
 * de `interrupted` a `running`— y reanuda el `<video>` con `pause()` +
 * `play()` SIN capturar la promesa. Al cambiar de cámara con `setDevice`, iOS
 * reconfigura la captura (interrupción y reanudación), y acto seguido el SDK
 * sustituye la pista del reproductor: reasigna `srcObject` y vuelve a llamar a
 * `play()` —este sí capturado—. La nueva carga aborta el `play()` anterior, que
 * nadie esperaba, y WebKit lo rechaza con `AbortError`.
 *
 * No hay nada nuestro en esa pila y no tiene efecto visible: el `play()`
 * posterior del propio SDK es el que deja el vídeo reproduciéndose. Se vio una
 * vez, en un iPad con Chrome (motor WebKit), cambiando de cámara durante la
 * verificación de agora-interview-cohost (issue 140D-CLIENT-1Y).
 *
 * Tres condiciones, todas necesarias, para no tapar un aborto que sí sea
 * nuestro: el motivo es exactamente el `AbortError` de WebKit, llegó como
 * rechazo sin capturar, y la página es una sala en directo (`/live/…`), la
 * única que carga el SDK de Agora.
 *
 * @param {object} event - Evento de Sentry
 * @param {object} [hint] - `hint.originalException` es el motivo del rechazo
 * @returns {boolean} true si el evento debe descartarse
 */
export function isAgoraInterruptedPlayback(event, hint) {
  const reason = hint?.originalException
  if (!reason || reason.name !== 'AbortError' || reason.message !== WEBKIT_ABORT_MESSAGE) return false

  const mechanisms = (event?.exception?.values || []).map((value) => value?.mechanism?.type)
  if (!mechanisms.includes(UNHANDLED_REJECTION)) return false

  return isLiveRoomPage(event)
}

function isLiveRoomPage(event) {
  const href = event?.request?.url || (typeof window !== 'undefined' ? window.location.href : '')
  try {
    return new URL(href).pathname.startsWith('/live/')
  } catch {
    return false
  }
}
