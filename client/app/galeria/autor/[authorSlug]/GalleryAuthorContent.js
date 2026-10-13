'use client'

import { use, useState, useRef } from 'react'
import { artAPI, getArtImageUrl } from '@/lib/api'
import AuthorModal from '@/components/LazyAuthorModal'
import AuthorSidebar from '@/components/AuthorSidebar'
import AuthorMobileFilter from '@/components/AuthorMobileFilter'
import ProductGrid from '@/components/ProductGrid'
import GridLoadMore from '@/components/GridLoadMore'
import { useGalleryAuthors } from '@/hooks/useGalleryAuthors'
import { useGalleryProducts } from '@/hooks/useGalleryProducts'
import { useGridScrollRestoration } from '@/hooks/useGridScrollRestoration'
import { useAuthorFilterNavigation } from '@/hooks/useAuthorFilterNavigation'

export default function GalleryAuthorContent({ params, initialProducts = null, initialAuthors = null }) {
  const resolvedParams = use(params)
  const authorSlug = resolvedParams.authorSlug
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const productListRef = useRef(null)

  // Se invoca ANTES que useGalleryProducts: la instantánea tiene que estar
  // disponible en el efecto de montaje del listado.
  const restoration = useGridScrollRestoration()
  const { authors } = useGalleryAuthors('art', authorSlug, initialAuthors)
  const { products, loading, error, page, isFading, loadMoreProps } = useGalleryProducts(artAPI, authorSlug, restoration, { products: initialProducts })
  // La navegación del filtro y su espera, que pinta el esqueleto de la lista y
  // de la rejilla hasta que llega el destino.
  const { isPending, filterByAuthor, clearFilter } = useAuthorFilterNavigation('/galeria', authorSlug)

  const handleViewAuthorBio = (author) => {
    setSelectedAuthorForBio(author)
    setModalOpen(true)
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
        onFilterByAuthor={filterByAuthor}
        onClearFilter={clearFilter}
        pending={isPending}
      />

      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="flex">
          <AuthorSidebar
            authors={authors}
            selectedAuthorSlug={authorSlug}
            onViewAuthorBio={handleViewAuthorBio}
            onFilterByAuthor={filterByAuthor}
            onClearFilter={clearFilter}
            pending={isPending}
          />

          <main className="flex-1" ref={productListRef} aria-busy={isPending || undefined}>
            <div className="py-12">
              <ProductGrid
                products={products}
                isFading={isFading}
                getImageUrl={getArtImageUrl}
                baseRoute="/galeria"
                onProductOpen={restoration.onProductOpen}
                authors={authors}
                onViewAuthorBio={handleViewAuthorBio}
                pending={isPending}
                variant="art"
              />
              {/* Fuera durante la espera: describe una rejilla que ya no está en
                  pantalla, y al encogerse la página su centinela pediría la
                  página siguiente del listado que se abandona. */}
              {!isPending && <GridLoadMore {...loadMoreProps} variant="art" gridName="galeria-autor" />}
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
