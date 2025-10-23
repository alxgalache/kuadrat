'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { othersAPI, authorsAPI, getOthersImageUrl } from '@/lib/api'
import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import AuthorModal from '@/components/AuthorModal'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function GalleryMasPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [products, setProducts] = useState([])
  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [selectedAuthorSlug, setSelectedAuthorSlug] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isFading, setIsFading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const productListRef = useRef(null)

  // Sync filter with URL params
  useEffect(() => {
    const authorParam = searchParams.get('author')
    if (authorParam) {
      setSelectedAuthorSlug(authorParam)
    } else {
      setSelectedAuthorSlug(null)
    }
  }, [searchParams])

  // Load authors on mount
  useEffect(() => {
    loadAuthors()
  }, [])

  // Load products when author filter changes
  useEffect(() => {
    loadProducts(true)
  }, [selectedAuthorSlug])

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
  }, [hasMore, isLoadingMore, page, selectedAuthorSlug])

  const loadAuthors = async () => {
    try {
      const authorsData = await authorsAPI.getVisible('other')
      setAuthors(authorsData.authors)
    } catch (err) {
      console.error('Failed to load authors:', err)
    }
  }

  const loadProducts = async (resetPage = false) => {
    try {
      if (resetPage) {
        // If not initial load, fade out before loading new products
        if (!isInitialLoad) {
          setIsFading(true)
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        // Load new products while still faded out
        setPage(1)
        const productsData = await othersAPI.getAll(1, 12, selectedAuthorSlug)
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
        const productsData = await othersAPI.getAll(nextPage, 12, selectedAuthorSlug)
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
  }

  const handleViewAuthorBio = (author) => {
    setSelectedAuthorForBio(author)
    setModalOpen(true)
  }

  const handleFilterByAuthor = (authorSlug) => {
    // Toggle selection: if clicking the same author, deselect it
    if (selectedAuthorSlug === authorSlug) {
      // Deselect - go to /galeria/mas with no params
      router.push('/galeria/mas')
    } else {
      // Select - add author to URL
      router.push(`/galeria/mas?author=${authorSlug}`)
    }
  }

  const handleClearFilter = () => {
    router.push('/galeria/mas')
  }

  if (loading && page === 1) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  // Empty state - show centered message without sidebar
  if (products.length === 0) {
    return (
      <div className="bg-white">
        <div className="flex items-center justify-center px-6 py-16">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
              No hay productos disponibles
            </h2>
            <p className="mt-4 text-base text-gray-600 max-w-md mx-auto">
              No hay obras publicadas y activas en este momento. Vuelve pronto para descubrir nuevas creaciones.
            </p>
          </div>
        </div>
        <AuthorModal
          author={selectedAuthorForBio}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="bg-white">
      {/* Mobile horizontal author filter */}
      <div className="lg:hidden border-b border-gray-200 py-4 px-6">
        <div className="text-xs font-semibold text-gray-400 mb-3">Autores</div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
          {authors.map((author) => (
            <div
              key={author.id}
              className={classNames(
                selectedAuthorSlug === author.slug
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap shrink-0'
              )}
            >
              <button
                type="button"
                onClick={() => handleViewAuthorBio(author)}
                className="hover:opacity-80"
              >
                <InformationCircleIcon className="size-4" />
              </button>
              <button
                onClick={() => handleFilterByAuthor(author.slug)}
                className="hover:opacity-80"
              >
                {author.full_name}
              </button>
              {selectedAuthorSlug === author.slug && (
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="ml-1 hover:opacity-80"
                  aria-label="Limpiar filtro de autor"
                >
                  <XMarkIcon className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop layout with sidebar */}
      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="flex">
          {/* Sidebar navigation - hidden on mobile, sticky on desktop */}
          <aside className="hidden lg:block w-64 pr-10 flex-shrink-0">
            <div className="sticky top-0 py-16 will-change-scroll">
              <nav aria-label="Sidebar" className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <div className="text-xs font-semibold text-gray-400">Autores</div>
                    <ul role="list" className="-mx-2 mt-2 space-y-1">
                      {authors.map((author) => (
                        <li key={author.id}>
                          <div
                            className={classNames(
                              selectedAuthorSlug === author.slug
                                ? 'bg-gray-200 text-gray-900'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                              'group flex gap-x-3 rounded-md p-2 text-sm font-semibold items-center w-full'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleViewAuthorBio(author)}
                              className="group/icon flex-shrink-0"
                            >
                              <InformationCircleIcon className="size-5 text-gray-400 group-hover/icon:text-black" />
                            </button>
                            <button
                              onClick={() => handleFilterByAuthor(author.slug)}
                              className="flex gap-x-3 items-center flex-1 text-left min-w-0"
                            >
                              <span className="truncate">{author.full_name}</span>
                            </button>
                            <div className="w-6 flex-shrink-0 flex items-center justify-center">
                              {selectedAuthorSlug === author.slug && (
                                <button
                                  type="button"
                                  onClick={handleClearFilter}
                                  aria-label="Limpiar filtro de autor"
                                >
                                  <XMarkIcon className="size-5 text-gray-400 group-hover/icon:text-black" />
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                </ul>
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1" ref={productListRef}>
            <div className="py-16">
              <div className="relative">
                <div
                  className="relative w-full transition-opacity duration-300"
                  style={{ opacity: isFading ? 0 : 1 }}
                >
                  <ul
                    role="list"
                    className="px-4 grid grid-cols-1 gap-8 sm:px-6 sm:grid-cols-2 lg:px-0 lg:grid-cols-4"
                  >
                    {products.map((product) => (
                      <li key={product.id} className="inline-flex w-full flex-col text-center">
                        <div className="group relative">
                          <img
                            alt={product.name}
                            src={getOthersImageUrl(product.basename)}
                            className="aspect-square w-full rounded-md bg-gray-200 object-cover group-hover:opacity-75"
                          />
                          <div className="mt-6">
                            <p className="text-sm text-gray-500">{product.seller_full_name}</p>
                            <h3 className="mt-1 font-semibold text-gray-900">
                              <Link href={`/galeria/mas/p/${product.slug}`}>
                                <span className="absolute inset-0" />
                                {product.name}
                              </Link>
                            </h3>
                            <p className="mt-1 text-gray-900">€{product.price.toFixed(2)}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Author bio modal */}
      <AuthorModal
        author={selectedAuthorForBio}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
