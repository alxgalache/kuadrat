'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { productsAPI, ordersAPI, authAPI, getProductImageUrl } from '@/lib/api'

export default function ProductDetailPage({ params }) {
  const unwrappedParams = use(params)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [user, setUser] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const currentUser = authAPI.getCurrentUser()
    setUser(currentUser)
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const data = await productsAPI.getById(unwrappedParams.id)
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
      await ordersAPI.create([product.id])
      alert('¡Compra exitosa! Revisa tu correo electrónico para confirmación.')
      router.push('/orders')
    } catch (err) {
      alert(err.message || 'Compra fallida. Por favor, inténtalo de nuevo.')
    } finally {
      setPurchasing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta obra?')) {
      return
    }

    try {
      await productsAPI.delete(product.id)
      alert('Obra eliminada exitosamente')
      router.push('/seller/products')
    } catch (err) {
      alert(err.message || 'No se pudo eliminar la obra')
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

  const isOwnProduct = user && product.seller_id === user.id

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="w-full rounded-lg bg-gray-200">
            <img
              alt={product.name}
              src={getProductImageUrl(product.basename)}
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
              <p className="text-sm text-gray-500">
                  <span className="font-medium">Soporte:</span>{' '}
                  {product.type === 'physical' ? 'Físico' : product.type === 'digital' ? 'Digital' : product.type}
              </p>
              {product.seller_email && (
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium">Artista:</span> {product.seller_email}
                </p>
              )}
            </div>

            <div className="mt-10 flex gap-x-4">
              {isOwnProduct ? (
                <button
                  onClick={handleDelete}
                  className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-red-600 px-8 py-3 text-base font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-50 focus:outline-hidden sm:w-full"
                >
                  Eliminar obra
                </button>
              ) : (
                <button
                  onClick={handlePurchase}
                  disabled={purchasing || product.is_sold === 1}
                  className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-black px-8 py-3 text-base font-medium text-white hover:bg-gray-900 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-50 focus:outline-hidden sm:w-full disabled:opacity-50"
                >
                  {product.is_sold === 1
                    ? 'Vendida'
                    : purchasing
                    ? 'Procesando...'
                    : 'Comprar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
