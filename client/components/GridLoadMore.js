'use client'

import { GRID_LOAD_MORE_COPY, GRID_LOAD_MORE_EVENT } from '@/lib/constants'

/**
 * Pie de las rejillas con carga incremental: centinela, indicador de carga,
 * control manual y aviso de error.
 *
 * Lo montan las CUATRO rutas (`/galeria`, `/tienda` y sus variantes por autor).
 * Antes cada una llevaba su propio bloque en línea —y dos de ellas ni siquiera
 * eso: `GalleryAuthorContent` y `GalleryMasAuthorContent` no desestructuraban
 * `isLoadingMore`, así que durante una carga en curso no ocurría absolutamente
 * nada en pantalla, indistinguible para el visitante de la ausencia de carga.
 *
 * El botón está SIEMPRE presente mientras queden elementos, no sólo cuando se
 * detecte un fallo: no hay forma fiable de detectar ese fallo desde dentro, y es
 * lo único que convierte «se puede llegar al resto del catálogo» en una
 * propiedad verificable en lugar de una esperanza sobre motores que no se pueden
 * probar. Si mañana un WebView rompe el observador y el vigía, la funcionalidad
 * degrada a «pulsar para cargar», no a «catálogo inalcanzable».
 *
 * Arregla además un agujero que existía en TODOS los navegadores: con teclado o
 * con lector de pantalla no había ninguna forma de pasar del elemento 12, porque
 * el único disparador era un gesto de scroll.
 */
export default function GridLoadMore({
  sentinelRef,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  variant = 'art',
  gridName,
}) {
  const textos = GRID_LOAD_MORE_COPY[variant] ?? GRID_LOAD_MORE_COPY.art

  // Sin nada que cargar y sin error no hay pie: tampoco centinela que observar.
  if (!hasMore && !loadMoreError) return null

  const cargarManualmente = () => {
    // Única señal disponible sobre si la carga automática funciona en los
    // navegadores donde la incidencia no es reproducible. Encadenamiento
    // opcional: fuera de producción `window.plausible` no existe y la línea no
    // hace nada. Sin cookies, sin identificadores y sin datos del visitante.
    if (typeof window !== 'undefined') {
      window.plausible?.(GRID_LOAD_MORE_EVENT, { props: { grid: gridName } })
    }
    onLoadMore({ manual: true })
  }

  // El reintento NO emite el evento: significa que falló la red, no que fallara
  // el disparo automático, y mezclarlos ensuciaría la única métrica que hay.
  const reintentar = () => onLoadMore({ manual: true })

  return (
    <>
      {/* Lo que observa el IntersectionObserver. Sin altura propia y oculto a
          los productos de apoyo: es un punto de referencia, no contenido. */}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

      <div className="flex flex-col items-center justify-center gap-3 py-8">
        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2" role="status">
            <svg className="size-5 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-500">{GRID_LOAD_MORE_COPY.cargando}</span>
          </div>
        )}

        {!isLoadingMore && loadMoreError && (
          <div className="flex flex-col items-center gap-3" role="alert">
            <p className="text-sm text-gray-600">{textos.error}</p>
            <button
              type="button"
              onClick={reintentar}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              {GRID_LOAD_MORE_COPY.reintentar}
            </button>
          </div>
        )}

        {!isLoadingMore && !loadMoreError && hasMore && (
          <button
            type="button"
            onClick={cargarManualmente}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            {textos.boton}
          </button>
        )}
      </div>
    </>
  )
}
