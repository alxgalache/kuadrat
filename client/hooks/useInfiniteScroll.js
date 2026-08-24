'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  GRID_INFINITE_SCROLL_FALLBACK_PX,
  GRID_INFINITE_SCROLL_ROOT_MARGIN_PX,
} from '@/lib/constants'

/**
 * Carga incremental de una lista larga.
 *
 * Sustituye al listener de scroll que disparaba la carga comparando
 * `window.innerHeight + window.scrollY` con `document.documentElement.scrollHeight`
 * y tolerancia CERO. Esa comparación mezcla dos marcos de referencia que en móvil
 * NO coinciden: `innerHeight` es el viewport visual, que encoge cuando la barra
 * del navegador está a la vista, mientras que el recorrido de scroll se calcula
 * contra el viewport de maquetación, que no cambia para no reflowear en cada
 * scroll. Con la barra visible:
 *
 *     innerHeight + scrollY_max = scrollHeight − altoDeLaBarra   (< scrollHeight)
 *
 * es decir, la condición era INALCANZABLE, con el visitante clavado en el fondo
 * absoluto de la página. Y como allí ya no queda recorrido, tampoco se emitían
 * más eventos de scroll: el único disparador se agotaba y la lista quedaba
 * muerta hasta que el visitante subía lo suficiente como para que el navegador
 * volviera a ocultar su barra.
 *
 * Tres disparadores convergen aquí, con un único punto de entrada:
 *
 *   IntersectionObserver ─┐
 *   (principal)           │    ┌───────────────────────┐
 *   scroll / resize ──────┼───▶│  requestLoadMore()    │──▶ onLoadMore()
 *   (respaldo)            │    │  cerrojo síncrono     │
 *   acción del visitante ─┘    └───────────────────────┘
 *
 * @param {object}   params
 * @param {boolean}  params.hasMore     Quedan elementos por cargar.
 * @param {boolean}  params.isLoading   Hay una carga en curso (gobierna el re-armado).
 * @param {Function} params.onLoadMore  Devuelve una promesa que resuelve con el
 *                                      NÚMERO de elementos nuevos añadidos.
 * @returns {{ sentinelRef: object, requestLoadMore: Function }}
 */
export function useInfiniteScroll({ hasMore, isLoading, onLoadMore }) {
  const sentinelRef = useRef(null)

  // Cerrojo en una referencia, no en el estado. `isLoading` llega tarde por
  // definición: un manejador lo captura por cierre y no se entera del cambio
  // hasta que React vuelve a renderizar y el efecto se resuscribe. Esa ventana
  // de un frame es la que permitía que dos disparos calcularan la misma página,
  // que la deduplicación de GET de lib/api.js les devolviera la misma promesa y
  // que los productos se concatenaran dos veces.
  const lockRef = useRef(false)

  // Los disparadores automáticos quedan DESARMADOS tras un fallo o tras una
  // página que no aporta nada nuevo. Sin esto, el re-armado del observador
  // convierte un fallo persistente —un 429 del limitador, por ejemplo— en un
  // bucle de peticiones desde el navegador del visitante:
  //
  //   fallo → isLoading=false → efecto → observe() → dispara → fallo → …
  //
  // Los rearma salir de la zona de disparo (subir y volver a bajar) o una
  // acción explícita del visitante.
  const autoArmedRef = useRef(true)

  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  // Identidad estable: los efectos de abajo no deben resuscribirse por esto.
  const requestLoadMore = useCallback(async ({ manual = false } = {}) => {
    if (lockRef.current) return
    if (!hasMoreRef.current) return
    if (!manual && !autoArmedRef.current) return

    lockRef.current = true
    if (manual) autoArmedRef.current = true

    try {
      const nuevos = await onLoadMoreRef.current()
      // Una respuesta que dice que quedan elementos pero no aporta ninguno
      // nuevo produce el mismo bucle que un fallo, sin error de por medio.
      if (nuevos === 0) autoArmedRef.current = false
    } catch {
      // El consumidor ya ha registrado el error en su propio estado; aquí sólo
      // interesa dejar de reintentar por nuestra cuenta.
      autoArmedRef.current = false
    } finally {
      lockRef.current = false
    }
  }, [])

  // ── Disparador principal: IntersectionObserver ──────────────────────────
  //
  // Correcto por construcción, no por afinado: con `root: null` el rectángulo
  // de intersección es el viewport DEL DOCUMENTO, el mismo marco contra el que
  // el navegador calcula el recorrido de scroll. No lee innerHeight, ni
  // scrollY, ni scrollHeight, y no compara nada, así que ni la barra del
  // navegador ni el zoom ni el redondeo subpíxel tienen dónde manifestarse.
  //
  // `isLoading` está en las dependencias A PROPÓSITO: es lo que consigue el
  // re-armado. Un IntersectionObserver notifica CAMBIOS de estado, así que si
  // tras añadir elementos el centinela sigue interseccionando no vuelve a
  // notificar nunca. Recrear el observador al terminar la carga produce un
  // `observe()` nuevo, y todo `observe()` entrega una observación inicial con
  // el estado actual.
  useEffect(() => {
    if (!hasMore) return
    if (typeof IntersectionObserver === 'undefined') return

    const centinela = sentinelRef.current
    if (!centinela) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entrada = entries[entries.length - 1]
        if (!entrada) return
        if (!entrada.isIntersecting) {
          // Salir de la zona de disparo rearma: es lo que convierte "subir y
          // volver a bajar" en un intento nuevo tras un fallo.
          autoArmedRef.current = true
          return
        }
        requestLoadMore()
      },
      {
        root: null,
        threshold: 0,
        rootMargin: `${GRID_INFINITE_SCROLL_ROOT_MARGIN_PX}px 0px`,
      }
    )

    observer.observe(centinela)
    return () => observer.disconnect()
  }, [hasMore, isLoading, requestLoadMore])

  // ── Disparador de respaldo: scroll + resize ─────────────────────────────
  //
  // No es redundancia decorativa. `resize` es precisamente el evento que emiten
  // los navegadores móviles al ocultar o mostrar su barra, o sea, el momento
  // exacto en que la situación puede haber cambiado sin que se haya producido
  // ningún desplazamiento. Y cubre el caso de que IntersectionObserver no
  // exista o no se comporte en algún WebView.
  //
  // Agrupado con requestAnimationFrame y con umbral generoso: nunca se compara
  // contra el fondo exacto, que es el defecto que este hook corrige.
  useEffect(() => {
    if (!hasMore) return

    let frame = null

    const evaluar = () => {
      frame = null

      const centinela = sentinelRef.current
      let dentroDeLaZona
      if (centinela) {
        const rect = centinela.getBoundingClientRect()
        dentroDeLaZona = rect.top <= window.innerHeight + GRID_INFINITE_SCROLL_FALLBACK_PX
      } else {
        dentroDeLaZona =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - GRID_INFINITE_SCROLL_FALLBACK_PX
      }

      if (!dentroDeLaZona) {
        autoArmedRef.current = true
        return
      }
      requestLoadMore()
    }

    const alEvento = () => {
      if (frame === null) frame = window.requestAnimationFrame(evaluar)
    }

    window.addEventListener('scroll', alEvento, { passive: true })
    window.addEventListener('resize', alEvento)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', alEvento)
      window.removeEventListener('resize', alEvento)
    }
  }, [hasMore, requestLoadMore])

  return { sentinelRef, requestLoadMore }
}
