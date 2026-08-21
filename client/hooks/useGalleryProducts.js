import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { DEFAULT_PAGE_SIZE, GRID_RESTORE_MAX_PAGES } from '@/lib/constants'

/**
 * Estado del grid con scroll infinito.
 *
 * `restoration` es opcional: cuando llega el objeto de useGridScrollRestoration
 * con una instantánea, la carga de montaje rehidrata en UNA sola petición todas
 * las páginas que había cargadas (topadas en GRID_RESTORE_MAX_PAGES) y deja
 * `page` en ese número, de modo que el scroll infinito continúe en page + 1 sin
 * huecos ni solapes. Sin instantánea el comportamiento es exactamente el de
 * siempre: primera página y parte superior.
 */
export function useGalleryProducts(
  productAPI,
  authorSlug = null,
  restoration = null,
  initialProducts = null,
) {
  // `initialProducts` lo resuelve el componente de servidor. Sirve para UNA
  // cosa concreta y medible: que los enlaces `<a href>` a cada obra existan en
  // el HTML servido.
  //
  // Antes de esto, NINGUNA página del sitio servía un solo enlace a una ficha
  // de obra sin JavaScript —comprobado en producción sobre /, /galeria,
  // /galeria/artistas, /tienda y las fichas de artista: cero en todas—. Las
  // obras estaban en el sitemap, pero huérfanas de enlaces internos: un
  // rastreador que no ejecuta JavaScript podía recorrer el sitio entero sin
  // llegar jamás a una obra.
  //
  // Sembrar aquí NO cambia el comportamiento tras montar: el efecto de montaje
  // sigue llamando a `loadProducts(true)` igual que siempre, así que el scroll
  // infinito y la restauración de posición funcionan exactamente como antes.
  // Lo único que cambia es lo que hay en el HTML antes de que el navegador
  // ejecute nada.
  const sembrado = Array.isArray(initialProducts) && initialProducts.length > 0

  const [products, setProducts] = useState(sembrado ? initialProducts : [])
  const [loading, setLoading] = useState(!sembrado)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  // Con datos sembrados el grid arranca visible. Dejarlo a opacidad 0 habría
  // sustituido el «Cargando...» por un hueco en blanco hasta el fundido, que
  // para el visitante es peor que lo que hay hoy.
  const [isFading, setIsFading] = useState(!sembrado)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [pendingRestore, setPendingRestore] = useState(false)

  // La instantánea solo vale para la carga de montaje: un cambio de filtro de
  // autor debe arrancar en la primera página y arriba del todo.
  const pendingSnapshotRef = useRef(restoration?.snapshot ?? null)
  const restorationRef = useRef(restoration)
  restorationRef.current = restoration

  // Load products when author slug changes
  useEffect(() => {
    loadProducts(true)
  }, [authorSlug])

  // Mantiene al día el número de páginas cargadas que se guardará en la
  // instantánea cuando el usuario abra el detalle de un producto.
  useEffect(() => {
    restorationRef.current?.setLoadedPages(page)
  }, [page])

  // El desplazamiento se aplica tras el commit del DOM y antes del pintado, con
  // el grid todavía a opacidad 0: así no se percibe el salto desde arriba.
  useLayoutEffect(() => {
    if (!pendingRestore) return
    setPendingRestore(false)
    restorationRef.current?.applyRestore()
  }, [pendingRestore])

  // Infinite scroll listener
  useEffect(() => {
    const handleScroll = () => {
      if (isLoadingMore || !hasMore) return

      const scrollPosition = window.innerHeight + window.scrollY
      const bottomPosition = document.documentElement.scrollHeight

      if (scrollPosition >= bottomPosition) {
        loadProducts(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, isLoadingMore, page, authorSlug])

  const loadProducts = useCallback(async (resetPage = false) => {
    try {
      if (resetPage) {
        // Se consume por `isInitialLoad`, no vaciando la referencia: en
        // desarrollo StrictMode monta el efecto dos veces y un consumo
        // destructivo dejaría sin restauración a la segunda carga.
        const snapshot = isInitialLoad ? pendingSnapshotRef.current : null
        if (!isInitialLoad) pendingSnapshotRef.current = null
        const restorePages = snapshot
          ? Math.min(snapshot.pages, GRID_RESTORE_MAX_PAGES)
          : 1

        // If not initial load, fade out before loading new products
        if (!isInitialLoad) {
          setIsFading(true)
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        // Load new products while still faded out. `page` no se toca aquí en la
        // restauración: hasta que llegue la respuesta debe seguir valiendo 1
        // para que la pantalla de carga (loading && page === 1) se mantenga.
        if (!snapshot) setPage(1)
        const productsData = await productAPI.getAll(
          1,
          restorePages * DEFAULT_PAGE_SIZE,
          authorSlug
        )
        setProducts(productsData.products)
        setHasMore(productsData.hasMore)
        if (snapshot) setPage(restorePages)

        // Hide loading screen but keep products faded
        setLoading(false)

        // Scroll to top instantly (no smooth scroll to avoid layout shift)
        if (!isInitialLoad) {
          window.scrollTo({ top: 0, behavior: 'instant' })
        } else if (snapshot) {
          setPendingRestore(true)
        }

        // Small delay to ensure DOM has rendered with products at opacity 0
        await new Promise(resolve => setTimeout(resolve, 50))

        // Fade in the new products
        setIsFading(false)
        setIsInitialLoad(false)
      } else {
        // Infinite scroll - load more
        setIsLoadingMore(true)
        const nextPage = page + 1
        const productsData = await productAPI.getAll(nextPage, DEFAULT_PAGE_SIZE, authorSlug)
        setProducts(prev => [...prev, ...productsData.products])
        setHasMore(productsData.hasMore)
        setPage(nextPage)
        setIsLoadingMore(false)
      }
    } catch (err) {
      setError('No se pudieron cargar las obras')
      setLoading(false)
      setIsFading(false)
      setIsLoadingMore(false)
    }
  }, [productAPI, authorSlug, page, isInitialLoad, isLoadingMore, hasMore])

  return {
    products,
    loading,
    error,
    page,
    hasMore,
    isLoadingMore,
    isFading,
  }
}
