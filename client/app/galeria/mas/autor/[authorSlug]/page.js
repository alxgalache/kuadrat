'use client'

import { use, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { othersAPI, getOthersImageUrl } from '@/lib/api'
import AuthorModal from '@/components/AuthorModal'
import AuthorSidebar from '@/components/AuthorSidebar'
import AuthorMobileFilter from '@/components/AuthorMobileFilter'
import ProductGrid from '@/components/ProductGrid'
import { useGalleryAuthors } from '@/hooks/useGalleryAuthors'
import { useGalleryProducts } from '@/hooks/useGalleryProducts'

export default function GalleryMasAuthorPage({ params }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const authorSlug = resolvedParams.authorSlug
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const productListRef = useRef(null)

  const { authors } = useGalleryAuthors('other', authorSlug)
  const { products, loading, error, page, isFading } = useGalleryProducts(othersAPI, authorSlug)

  const handleViewAuthorBio = (author) => {
    setSelectedAuthorForBio(author)
    setModalOpen(true)
  }

  const handleFilterByAuthor = (authorSlugParam) => {
    if (authorSlug === authorSlugParam) {
      router.push('/galeria/mas')
    } else {
      router.push(`/galeria/mas/autor/${authorSlugParam}`)
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

  if (products.length === 0) {
    return (
      <div className="bg-white">
        <div className="flex items-center justify-center px-6 py-16">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
              No hay productos disponibles
            </h2>
            <p className="mt-4 text-base text-gray-600 max-w-md mx-auto">
              No hay obras publicadas y activas de este autor en este momento. Vuelve pronto para descubrir nuevas creaciones.
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
      <AuthorMobileFilter
        authors={authors}
        selectedAuthorSlug={authorSlug}
        onViewAuthorBio={handleViewAuthorBio}
        onFilterByAuthor={handleFilterByAuthor}
        onClearFilter={handleClearFilter}
      />

      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="flex">
          <AuthorSidebar
            authors={authors}
            selectedAuthorSlug={authorSlug}
            onViewAuthorBio={handleViewAuthorBio}
            onFilterByAuthor={handleFilterByAuthor}
            onClearFilter={handleClearFilter}
          />

          <main className="flex-1" ref={productListRef}>
            <div className="py-16">
              <ProductGrid
                products={products}
                isFading={isFading}
                getImageUrl={getOthersImageUrl}
                baseRoute="/galeria/mas"
              />
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
