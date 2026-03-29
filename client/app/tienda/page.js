'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { othersAPI, getOthersImageUrl } from '@/lib/api'
import AuthorModal from '@/components/AuthorModal'
import AuthorSidebar from '@/components/AuthorSidebar'
import AuthorMobileFilter from '@/components/AuthorMobileFilter'
import ProductGrid from '@/components/ProductGrid'
import { useGalleryAuthors } from '@/hooks/useGalleryAuthors'
import { useGalleryProducts } from '@/hooks/useGalleryProducts'

export default function GalleryMasPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAuthorSlug = searchParams.get('author')
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const productListRef = useRef(null)

  const { authors } = useGalleryAuthors('other', selectedAuthorSlug)
  const { products, loading, error, page, isFading, isLoadingMore } = useGalleryProducts(othersAPI, selectedAuthorSlug)

  const handleViewAuthorBio = (author) => {
    setSelectedAuthorForBio(author)
    setModalOpen(true)
  }

  const handleFilterByAuthor = (authorSlug) => {
    if (selectedAuthorSlug === authorSlug) {
      router.push('/tienda')
    } else {
      router.push(`/tienda/autor/${authorSlug}`)
    }
  }

  const handleClearFilter = () => {
    router.push('/tienda')
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

  if (products.length === 0) {
    return (
      <div className="bg-white">
        <div className="flex items-center justify-center px-6 py-12">
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
      <h1 className="sr-only">Más Productos</h1>
      <AuthorMobileFilter
        authors={authors}
        selectedAuthorSlug={selectedAuthorSlug}
        onViewAuthorBio={handleViewAuthorBio}
        onFilterByAuthor={handleFilterByAuthor}
        onClearFilter={handleClearFilter}
      />

      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="flex">
          <AuthorSidebar
            authors={authors}
            selectedAuthorSlug={selectedAuthorSlug}
            onViewAuthorBio={handleViewAuthorBio}
            onFilterByAuthor={handleFilterByAuthor}
            onClearFilter={handleClearFilter}
          />

          <main className="flex-1" ref={productListRef}>
            <div className="py-12">
              <ProductGrid
                products={products}
                isFading={isFading}
                getImageUrl={getOthersImageUrl}
                baseRoute="/tienda"
              />
              {isLoadingMore && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <svg className="size-5 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm text-gray-500">Cargando...</span>
                </div>
              )}
            </div>
          </main>
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
