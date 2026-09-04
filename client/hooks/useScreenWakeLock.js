'use client'

import { useEffect, useRef } from 'react'

/**
 * Mantiene la pantalla encendida mientras el host retransmite.
 *
 * El caso que lo motiva: retransmitir desde un móvil montado en un trípode. Sin
 * esto, el teléfono aplica su «tiempo de pantalla encendida» y la pantalla se
 * bloquea a mitad de evento, con el host sin acceso a los controles.
 *
 * Deliberadamente NO depende de `events.allow_mobile_host_console`: que la
 * pantalla se apague es un defecto de la vista de host, no una carencia de la
 * consola móvil, así que se aplica en Agora y en LiveKit por igual. Solo para
 * quien retransmite: un asistente no opera nada y no debe pagar la batería.
 *
 * Cinco pasos, y el cuarto es el que se olvida: detectar la capacidad, pedir el
 * bloqueo con el documento visible, guardar el sentinel (sin él no hay forma de
 * liberarlo a mano), escuchar su `release`, y volver a pedirlo cuando el
 * documento vuelve a ser visible — el navegador lo suelta solo al ocultarse la
 * pestaña, así que atender una notificación dejaría la pantalla desprotegida el
 * resto del evento.
 *
 * Degrada en silencio: sin API, sin contexto seguro (HTTPS o localhost) o con
 * un rechazo en tiempo de ejecución no hay aviso al usuario ni evento en
 * Sentry. Un rechazo previsible del navegador no es una excepción de código de
 * aplicación, y un aviso permanente en la interfaz de retransmisión sería más
 * ruido que valor.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Solicitar el bloqueo (host, evento en directo)
 */
export default function useScreenWakeLock({ enabled }) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return

    let cancelled = false

    const release = () => {
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      if (sentinel) sentinel.release().catch(() => { /* ya liberado */ })
    }

    const acquire = async () => {
      // El navegador rechaza la petición con el documento oculto; pedirla
      // entonces solo produce una excepción que hay que tragar.
      if (cancelled || document.visibilityState !== 'visible') return
      if (sentinelRef.current) return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        // El propio navegador lo libera al ocultarse la pestaña o por estado de
        // bajo consumo. Limpiamos la ref para que `acquire` pueda volver a pedirlo.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        // Sin soporte real, contexto no seguro o denegado: se ignora y no se
        // reintenta en bucle. El siguiente intento llega con visibilitychange.
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      release()
    }
  }, [enabled])
}
