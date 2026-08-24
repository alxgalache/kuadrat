'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { othersAPI, getOthersImageUrl } from '@/lib/api'
import AuthorModal from '@/components/AuthorModal'
import AuthorSidebar from '@/components/AuthorSidebar'
import AuthorMobileFilter from '@/components/AuthorMobileFilter'
import ProductGrid from '@/components/ProductGrid'
import GridLoadMore from '@/components/GridLoadMore'
import { useGalleryAuthors } from '@/hooks/useGalleryAuthors'
import { useGalleryProducts } from '@/hooks/useGalleryProducts'
import { useGridScrollRestoration } from '@/hooks/useGridScrollRestoration'

function GalleryMasPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAuthorSlug = searchParams.get('author')
  const [selectedAuthorForBio, setSelectedAuthorForBio] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const productListRef = useRef(null)

  // Se invoca ANTES que useGalleryProducts: la instantánea tiene que estar
  // disponible en el efecto de montaje del listado.
  const restoration = useGridScrollRestoration()
  const { authors } = useGalleryAuthors('other', selectedAuthorSlug)
  const { products, loading, error, page, isFading, loadMoreProps } = useGalleryProducts(othersAPI, selectedAuthorSlug, restoration)

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
                onProductOpen={restoration.onProductOpen}
                authors={authors}
                onViewAuthorBio={handleViewAuthorBio}
              />
              <GridLoadMore {...loadMoreProps} variant="other" gridName="tienda" />
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

/**
 * `useSearchParams()` obliga a una frontera de Suspense por encima del
 * componente que lo llama. Antes no hacía falta porque `TestAccessGate`
 * devolvía `null` en el servidor y este árbol no llegaba a renderizarse nunca
 * durante el prerenderizado; ahora que la página se sirve renderizada, el
 * `next build` falla sin ella. Es el mismo patrón que ya usan
 * `/pago-fallido`, `/pago-cancelado`, `/pedido-completado` y
 * `/order-confirmation`.
 *
 * El fallback reproduce la pantalla de carga que la propia página muestra
 * mientras pide los productos, para que el HTML prerenderizado y el primer
 * render del cliente enseñen lo mismo.
 */
export default function GalleryMasPage() {
  return (
    <>
      {/* El <h1> vive AQUÍ, fuera del Suspense, y es el único de la página.
          Estaba dentro, y por eso el HTML estático salía sin ningún encabezado
          pese a que en `next dev` sí aparecía —una diferencia entre el servidor
          de desarrollo y el prerenderizado que hizo pasar la comprobación local
          y falló en producción—.
          La causa: `useSearchParams()` obliga a esta página a salirse a cliente
          durante el prerenderizado, así que lo que Next hornea en el HTML no es
          el contenido ni su pantalla de carga, sino el FALLBACK de esta
          frontera. Todo lo que esté dentro del Suspense es invisible para quien
          no ejecute JavaScript.
          Fuera de la frontera se renderiza siempre: en el HTML estático, en el
          fallback y tras hidratar. Y al ser el único, no puede duplicarse. */}
      <h1 className="sr-only">Tienda de los artistas</h1>
    <Suspense
      fallback={
        <div className="bg-white min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Cargando...</p>
        </div>
      }
    >
      <GalleryMasPageContent />
      </Suspense>
    </>
  )
}
