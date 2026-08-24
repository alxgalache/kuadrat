import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { DEFAULT_PAGE_SIZE, GRID_RESTORE_MAX_PAGES } from '@/lib/constants'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

/**
 * Estado del grid con scroll infinito.
 *
 * `restoration` es opcional: cuando llega el objeto de useGridScrollRestoration
 * con una instantánea, la carga de montaje rehidrata en UNA sola petición todas
 * las páginas que había cargadas (topadas en GRID_RESTORE_MAX_PAGES) y deja
 * `page` en ese número, de modo que el scroll infinito continúe en page + 1 sin
 * huecos ni solapes. Sin instantánea el comportamiento es exactamente el de
 * siempre: primera página y parte superior.
 *
 * El disparo de la carga incremental vive en `useInfiniteScroll`; aquí sólo se
 * decide QUÉ se pide y cómo se integra. Ver ese fichero para por qué el listener
 * de scroll que había antes no podía funcionar en móvil.
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
  // sigue llamando a `loadInitial()` igual que siempre, así que el scroll
  // infinito y la restauración de posición funcionan exactamente como antes.
  // Lo único que cambia es lo que hay en el HTML antes de que el navegador
  // ejecute nada.
  const sembrado = Array.isArray(initialProducts) && initialProducts.length > 0

  const [products, setProducts] = useState(sembrado ? initialProducts : [])
  const [loading, setLoading] = useState(!sembrado)
  const [error, setError] = useState('')
  // Error de una carga POSTERIOR a la primera. Estado aparte de `error` a
  // propósito: `error` gobierna la pantalla de error a página completa, y
  // escribir ahí un fallo de la página N borraba de la vista las obras ya
  // cargadas. Un corte de red dejaba al visitante sin nada.
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  // Con datos sembrados el grid arranca visible. Dejarlo a opacidad 0 habría
  // sustituido el «Cargando...» por un hueco en blanco hasta el fundido, que
  // para el visitante es peor que lo que hay hoy.
  const [isFading, setIsFading] = useState(!sembrado)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [pendingRestore, setPendingRestore] = useState(false)

  // Espejos síncronos del estado que la carga incremental necesita leer ANTES
  // de que React confirme el render. El vigía de respaldo puede evaluar en el
  // mismo frame en que la petición ha resuelto pero el commit aún no ha
  // ocurrido; sin estos espejos volvería a pedir la página que se acaba de
  // traer.
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)

  // Ids ya presentes en la rejilla. Se mantiene aquí y no derivado de
  // `products` porque hace falta el recuento de elementos NUEVOS de forma
  // síncrona, y el actualizador de `setProducts` no se ejecuta a tiempo.
  const productIdsRef = useRef(new Set(sembrado ? initialProducts.map((p) => p.id) : []))

  // La instantánea solo vale para la carga de montaje: un cambio de filtro de
  // autor debe arrancar en la primera página y arriba del todo.
  const pendingSnapshotRef = useRef(restoration?.snapshot ?? null)
  const restorationRef = useRef(restoration)
  restorationRef.current = restoration

  const isInitialLoadRef = useRef(true)
  isInitialLoadRef.current = isInitialLoad

  // Load products when author slug changes
  useEffect(() => {
    loadInitial()
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

  /** Sustituye el contenido de la rejilla: montaje, cambio de autor o restauración. */
  const loadInitial = useCallback(async () => {
    try {
      // Se consume por `isInitialLoad`, no vaciando la referencia: en
      // desarrollo StrictMode monta el efecto dos veces y un consumo
      // destructivo dejaría sin restauración a la segunda carga.
      const initial = isInitialLoadRef.current
      const snapshot = initial ? pendingSnapshotRef.current : null
      if (!initial) pendingSnapshotRef.current = null
      const restorePages = snapshot
        ? Math.min(snapshot.pages, GRID_RESTORE_MAX_PAGES)
        : 1

      // If not initial load, fade out before loading new products
      if (!initial) {
        setIsFading(true)
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      setError('')
      setLoadMoreError(false)

      // Load new products while still faded out. `page` no se toca aquí en la
      // restauración: hasta que llegue la respuesta debe seguir valiendo 1
      // para que la pantalla de carga (loading && page === 1) se mantenga.
      if (!snapshot) {
        setPage(1)
        pageRef.current = 1
      }
      const productsData = await productAPI.getAll(
        1,
        restorePages * DEFAULT_PAGE_SIZE,
        authorSlug
      )
      setProducts(productsData.products)
      productIdsRef.current = new Set(productsData.products.map((p) => p.id))
      setHasMore(productsData.hasMore)
      hasMoreRef.current = productsData.hasMore
      if (snapshot) {
        setPage(restorePages)
        pageRef.current = restorePages
      }

      // Hide loading screen but keep products faded
      setLoading(false)

      // Scroll to top instantly (no smooth scroll to avoid layout shift)
      if (!initial) {
        window.scrollTo({ top: 0, behavior: 'instant' })
      } else if (snapshot) {
        setPendingRestore(true)
      }

      // Small delay to ensure DOM has rendered with products at opacity 0
      await new Promise(resolve => setTimeout(resolve, 50))

      // Fade in the new products
      setIsFading(false)
      setIsInitialLoad(false)
      isInitialLoadRef.current = false
    } catch (err) {
      setError('No se pudieron cargar las obras')
      setLoading(false)
      setIsFading(false)
    }
  }, [productAPI, authorSlug])

  /**
   * Carga la página siguiente y la añade al final.
   *
   * Devuelve el NÚMERO de productos nuevos añadidos, que es lo que
   * `useInfiniteScroll` necesita para distinguir «esta página no aporta nada»
   * —situación que encadenaría cargas en bucle— de una carga normal. Lanza si
   * la petición falla, para que el hook desarme los disparadores automáticos y
   * no convierta un 429 en una tormenta de peticiones.
   */
  const loadMore = useCallback(async () => {
    // El espejo síncrono, no el estado: entre que la petición anterior resuelve
    // y React confirma el render hay una ventana en la que `hasMore` aún dice
    // que quedan elementos. Devolver `undefined` (y no 0) es deliberado: no es
    // una página sin aportación, es que no había nada que pedir.
    if (!hasMoreRef.current) return undefined

    setIsLoadingMore(true)
    setLoadMoreError(false)
    try {
      const nextPage = pageRef.current + 1
      const productsData = await productAPI.getAll(nextPage, DEFAULT_PAGE_SIZE, authorSlug)

      // Descarta lo que ya está en la rejilla. Con paginación por OFFSET sobre
      // un catálogo vivo, basta con que se venda o se despublique una obra
      // entre dos peticiones para que la ventana se desplace y una obra se
      // repita —con su clave de React duplicada detrás—.
      const vistos = productIdsRef.current
      const nuevos = (productsData.products ?? []).filter((p) => !vistos.has(p.id))
      nuevos.forEach((p) => vistos.add(p.id))

      if (nuevos.length > 0) setProducts(prev => [...prev, ...nuevos])
      setHasMore(productsData.hasMore)
      hasMoreRef.current = productsData.hasMore
      setPage(nextPage)
      pageRef.current = nextPage

      return nuevos.length
    } catch (err) {
      setLoadMoreError(true)
      throw err
    } finally {
      setIsLoadingMore(false)
    }
  }, [productAPI, authorSlug])

  const { sentinelRef, requestLoadMore } = useInfiniteScroll({
    hasMore,
    isLoading: isLoadingMore,
    onLoadMore: loadMore,
  })

  // Un solo objeto para el pie de rejilla, en lugar de cinco props que cada
  // página desestructuraría a su manera. Es lo que hoy hace que dos de las
  // cuatro rutas no muestren indicador de carga alguno.
  const loadMoreProps = useMemo(
    () => ({
      sentinelRef,
      hasMore,
      isLoadingMore,
      loadMoreError,
      onLoadMore: requestLoadMore,
    }),
    [sentinelRef, hasMore, isLoadingMore, loadMoreError, requestLoadMore]
  )

  return {
    products,
    loading,
    error,
    page,
    hasMore,
    isLoadingMore,
    isFading,
    loadMoreError,
    loadMoreProps,
  }
}
