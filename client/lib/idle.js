// Trabajo que no debe competir con la carga de la página.
//
// `requestIdleCallback` sólo dice que el hilo principal está libre, no que la
// RED lo esté: llamado nada más hidratar, cualquier descarga que dispare
// compite con las imágenes y el JavaScript que aún están llegando. Por eso lo
// que se precarga «en reposo» espera primero al evento `load`.
//
// Las dos funciones devuelven una función de cancelación, para usarlas tal cual
// como limpieza de un `useEffect`.

const IDLE_TIMEOUT_MS = 2000

/** Ejecuta `callback` cuando el hilo principal esté libre (o, como tarde, a los 2 s). */
export function onIdle(callback) {
  if (typeof window === 'undefined') return () => {}
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => callback(), { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback(id)
  }
  // Safari no implementa requestIdleCallback.
  const id = window.setTimeout(callback, 1)
  return () => window.clearTimeout(id)
}

/** Ejecuta `callback` en reposo DESPUÉS del evento `load`. */
export function afterLoadIdle(callback) {
  if (typeof window === 'undefined') return () => {}
  let cancelIdle = () => {}
  if (document.readyState === 'complete') {
    cancelIdle = onIdle(callback)
    return () => cancelIdle()
  }
  const handleLoad = () => {
    cancelIdle = onIdle(callback)
  }
  window.addEventListener('load', handleLoad, { once: true })
  return () => {
    window.removeEventListener('load', handleLoad)
    cancelIdle()
  }
}
