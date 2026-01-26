import { useState, useEffect, useCallback } from 'react'

export function useGalleryProducts(productAPI, authorSlug = null) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isFading, setIsFading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Load products when author slug changes
  useEffect(() => {
    loadProducts(true)
  }, [authorSlug])

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
        // If not initial load, fade out before loading new products
        if (!isInitialLoad) {
          setIsFading(true)
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        // Load new products while still faded out
        setPage(1)
        const productsData = await productAPI.getAll(1, 12, authorSlug)
        setProducts(productsData.products)
        setHasMore(productsData.hasMore)

        // Hide loading screen but keep products faded
        setLoading(false)

        // Scroll to top instantly (no smooth scroll to avoid layout shift)
        if (!isInitialLoad) {
          window.scrollTo({ top: 0, behavior: 'instant' })
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
        const productsData = await productAPI.getAll(nextPage, 12, authorSlug)
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
