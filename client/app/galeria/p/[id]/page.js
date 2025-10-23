'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { artAPI, ordersAPI, authAPI, authorsAPI, getArtImageUrl } from '@/lib/api'
import AuthorModal from '@/components/AuthorModal'

export default function ArtProductDetailPage({ params }) {
  const unwrappedParams = use(params)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [user, setUser] = useState(null)
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const currentUser = authAPI.getCurrentUser()
    setUser(currentUser)
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const data = await artAPI.getById(unwrappedParams.id)
      setProduct(data.product)
    } catch (err) {
      setError('No se pudo cargar la obra')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    if (!user) {
      router.push('/autores')
      return
    }

    setPurchasing(true)
    try {
      // Create order with art product
      await ordersAPI.create([{ type: 'art', id: product.id }])
      alert('¡Compra exitosa! Revisa tu correo electrónico para confirmación.')
      router.push('/orders')
    } catch (err) {
      alert(err.message || 'Compra fallida. Por favor, inténtalo de nuevo.')
    } finally {
      setPurchasing(false)
    }
  }

  const handleViewAuthorBio = async () => {
    if (!product.seller_slug) return

    try {
      const authorData = await authorsAPI.getBySlug(product.seller_slug)
      setSelectedAuthor(authorData.author)
      setModalOpen(true)
    } catch (err) {
      console.error('Failed to load author:', err)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Obra no encontrada'}</p>
      </div>
    )
  }

  const isSoldOut = product.is_sold === 1

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="w-full rounded-lg bg-gray-200">
            <img
              alt={product.name}
              src={getArtImageUrl(product.basename)}
              className="w-full h-auto object-contain rounded-lg"
            />
          </div>

          {/* Product info */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{product.name}</h1>

            <div className="mt-3">
              <h2 className="sr-only">Información de la obra</h2>
              <p className="text-3xl tracking-tight text-gray-900">€{product.price.toFixed(2)}</p>
            </div>

            <div className="mt-6">
              <h3 className="sr-only">Descripción</h3>
              <div
                className="space-y-6 text-base text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>

            <div className="mt-6">
              <p className="text-lg text-gray-400">
                  <span className="font-medium">Soporte:</span>{' '}
                  {product.type}
              </p>
              {product.seller_full_name && (
                <p className="text-lg text-gray-400 mt-1">
                  <span className="font-medium">Autor:</span>{' '}
                  <button
                    onClick={handleViewAuthorBio}
                    className="text-gray-400 hover:text-gray-500 hover:underline"
                  >
                    {product.seller_full_name}
                  </button>
                </p>
              )}
            </div>

            <div className="mt-10 flex flex-col gap-4">
              {isSoldOut ? (
                <button
                  disabled
                  className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-gray-400 px-8 py-3 text-base font-medium text-white cursor-not-allowed sm:w-full"
                >
                  Temporalmente no disponible
                </button>
              ) : (
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-black px-8 py-3 text-base font-medium text-white hover:bg-gray-900 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-50 focus:outline-hidden sm:w-full disabled:opacity-50"
                >
                  {purchasing ? 'Procesando...' : 'Comprar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Author bio modal */}
      <AuthorModal
        author={selectedAuthor}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
