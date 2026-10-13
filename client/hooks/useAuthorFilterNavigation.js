import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Navegación del filtro de autor de los listados y su estado de espera.
 *
 * El filtro no filtra en el sitio: cada artista es su propia ruta
 * (`<base>/autor/<slug>`), y la ficha de autor es ISR sin precarga, así que
 * cada pulsación espera un render de servidor completo. Mientras tanto el router
 * de Next deja la página anterior intacta. `isPending` es lo que permite a la
 * página pintar el esqueleto en esa espera.
 *
 * `isPending` sale de envolver `router.push` en una transición, no de un
 * temporizador: vale verdadero desde la pulsación hasta que el destino se
 * confirma, y la página de origen se desmonta en ese mismo commit. No hay
 * duración que ajustar ni forma de que la espera y la llegada se desincronicen.
 * Un `loading.js` no servía: desmonta el origen en el acto (el esqueleto ya no
 * podría pintarse dentro de los contenedores reales) y uno en `galeria/`
 * envolvería también las fichas de obra.
 *
 * `baseRoute` es `/galeria` o `/tienda`; `selectedSlug`, el artista activo o
 * `null`. Pulsar el artista activo quita el filtro.
 */
export function useAuthorFilterNavigation(baseRoute, selectedSlug = null) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const navigate = useCallback((href) => {
    // Arriba del todo YA, sin animación, igual que hacía el filtrado en el
    // sitio: el destino se pinta arriba de todos modos, y el esqueleto tiene que
    // verse desde su primera fila. Con la rejilla desplazada y el sidebar fijo,
    // la página encogería bajo el visitante y el navegador recolocaría el
    // scroll en mitad del esqueleto.
    window.scrollTo({ top: 0, behavior: 'instant' })
    startTransition(() => {
      router.push(href)
    })
  }, [router])

  const filterByAuthor = useCallback((slug) => {
    navigate(slug === selectedSlug ? baseRoute : `${baseRoute}/autor/${slug}`)
  }, [navigate, baseRoute, selectedSlug])

  const clearFilter = useCallback(() => {
    navigate(baseRoute)
  }, [navigate, baseRoute])

  return { isPending, filterByAuthor, clearFilter }
}
