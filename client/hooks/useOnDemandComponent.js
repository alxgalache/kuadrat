'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Interfaz que sólo existe tras una interacción —la cesta, un modal—, cargada
 * la primera vez que hace falta en lugar de viajar en el JavaScript inicial de
 * todas las páginas (openspec: critical-path-performance, `initial-js-budget`).
 *
 * `load` es `() => import('…')`, declarado FUERA del componente: ese `import()`
 * es lo que el empaquetador convierte en un chunk aparte. `open` es el estado
 * que lo muestra. `onLoadError`, si llega, se llama cuando el módulo no se pudo
 * descargar: el dueño de `open` debe devolverlo a `false`, o un segundo clic
 * no cambiaría nada y no habría reintento.
 *
 * Devuelve:
 *   · `Component`: `null` hasta que el módulo ha llegado; a partir de ahí se
 *     queda montado, de modo que la animación de cierre y el estado interno se
 *     comportan exactamente como cuando el componente se montaba al cargar.
 *   · `open`: el valor que hay que pasarle, NO el `open` recibido (ver abajo).
 *   · `preload()`: empieza la descarga sin montar nada. Para la intención
 *     (puntero encima, foco, `touchstart`) y para el reposo.
 *   · `mount()`: monta el componente cerrado, para quien necesite que sus
 *     efectos de montaje corran aunque nadie lo abra.
 *
 * POR QUÉ NO `next/dynamic`. Monta el componente con las props del momento en
 * que llega el chunk, y en ese momento `open` ya es `true` —el visitante acaba
 * de pulsar—. Un `Transition` de Headless UI que nace abierto no anima la
 * entrada (sin `appear`, que es como están todos): la cesta aparecería de golpe
 * en lugar de deslizarse. Aquí se monta cerrado y se abre en el fotograma
 * siguiente, que es exactamente la secuencia que veía antes el visitante.
 */
export function useOnDemandComponent(load, open, onLoadError = null) {
  const loadRef = useRef(load)
  const onLoadErrorRef = useRef(onLoadError)
  onLoadErrorRef.current = onLoadError
  const [Component, setComponent] = useState(null)
  const [mountRequested, setMountRequested] = useState(false)
  const [renderOpen, setRenderOpen] = useState(false)

  // `import()` cachea el módulo: llamarlo varias veces descarga una sola.
  const preload = useCallback(() => {
    loadRef.current().catch(() => {
      // Una precarga es una optimización. Si falla, lo volverá a intentar la
      // carga de verdad, que es la que tiene a quién contárselo.
    })
  }, [])

  const mount = useCallback(() => setMountRequested(true), [])

  const needed = open || mountRequested
  useEffect(() => {
    if (!needed || Component) return
    let cancelled = false
    loadRef.current()
      .then((mod) => {
        // Actualizador en forma de función: un componente es una función, y
        // pasarlo tal cual haría que React lo ejecutara como actualizador.
        if (!cancelled) setComponent(() => mod.default)
      })
      .catch((err) => {
        // Sin el chunk no hay nada que abrir. Se deja cerrado y el siguiente
        // intento vuelve a pedirlo; el caso típico es una pestaña abierta
        // desde antes de un despliegue que ya no encuentra sus chunks.
        console.error('No se pudo cargar el componente bajo demanda:', err)
        if (cancelled) return
        setMountRequested(false)
        onLoadErrorRef.current?.()
      })
    return () => {
      cancelled = true
    }
  }, [needed, Component])

  useEffect(() => {
    if (!Component) return
    if (!open) {
      setRenderOpen(false)
      return
    }
    const id = window.requestAnimationFrame(() => setRenderOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [Component, open])

  return { Component, open: renderOpen, preload, mount }
}
