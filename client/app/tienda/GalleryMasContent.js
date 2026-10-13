'use client'

import { useState, useRef } from 'react'
import { othersAPI, getOthersImageUrl } from '@/lib/api'
import AuthorModal from '@/components/LazyAuthorModal'
import AuthorSidebar from '@/components/AuthorSidebar'
import AuthorMobileFilter from '@/components/AuthorMobileFilter'
import ProductGrid from '@/components/ProductGrid'
import GridLoadMore from '@/components/GridLoadMore'
import { useGalleryAuthors } from '@/hooks/useGalleryAuthors'
import { useGalleryProducts } from '@/hooks/useGalleryProducts'
import { useGridScrollRestoration } from '@/hooks/useGridScrollRestoration'
import { useAuthorFilterNavigation } from '@/hooks/useAuthorFilterNavigation'

export default function GalleryMasContent({ initialCatalog = null, initialAuthors = null }) {
  // Esta ruta NO filtra: el filtro por artista vive en su propia URL
  // (`/tienda/autor/[slug]`) y tiene su propio componente. Aquí era
  // `useSearchParams().get('author')`, y ese único uso sacaba TODO el árbol a
  // cliente durante el prerenderizado: lo que Next horneaba en el HTML no era
  // la rejilla sino el fallback de la frontera de Suspense, así que sembrarla
  // desde el servidor no habría servido de nada. El `?author=` heredado lo
  // atiende ahora `LegacyAuthorQueryRedirect`, que sí lo lee pero está aislado
  // en su propia frontera y no arrastra a nadie.
  const selectedAuthorSlug = null
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const productListRef = useRef(null)

  // Se invoca ANTES que useGalleryProducts: la instantánea tiene que estar
  // disponible en el efecto de montaje del listado.
  const restoration = useGridScrollRestoration()
  const { authors } = useGalleryAuthors('other', selectedAuthorSlug, initialAuthors)
  const { products, loading, error, page, isFading, loadMoreProps } = useGalleryProducts(othersAPI, selectedAuthorSlug, restoration, initialCatalog)
  // La navegación del filtro y su espera, que pinta el esqueleto de la lista y
  // de la rejilla hasta que llega el destino.
  const { isPending, filterByAuthor, clearFilter } = useAuthorFilterNavigation('/tienda', selectedAuthorSlug)

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
      <AuthorMobileFilter
        authors={authors}
        selectedAuthorSlug={selectedAuthorSlug}
        onViewAuthorBio={handleViewAuthorBio}
        onFilterByAuthor={filterByAuthor}
        onClearFilter={clearFilter}
        pending={isPending}
      />

      <div className="mx-auto max-w-7xl lg:px-8">
        <div className="flex">
          <AuthorSidebar
            authors={authors}
            selectedAuthorSlug={selectedAuthorSlug}
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
                getImageUrl={getOthersImageUrl}
                baseRoute="/tienda"
                onProductOpen={restoration.onProductOpen}
                authors={authors}
                onViewAuthorBio={handleViewAuthorBio}
                pending={isPending}
                variant="other"
              />
              {/* Fuera durante la espera: describe una rejilla que ya no está en
                  pantalla, y al encogerse la página su centinela pediría la
                  página siguiente del listado que se abandona. */}
              {!isPending && <GridLoadMore {...loadMoreProps} variant="other" gridName="tienda" />}
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
