'use client'

import { useState, useEffect, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { adminAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import { InformationCircleIcon } from '@heroicons/react/20/solid'
import AuthGuard from '@/components/AuthGuard'
import { useNotification } from '@/contexts/NotificationContext'
import { SafeProductDescription } from '@/components/SafeHTML'
import Breadcrumbs from '@/components/Breadcrumbs'

function ArtPreview({ product, onApprove, approving }) {
  return (
    <>
      <Breadcrumbs items={[
        { name: 'Admin', href: '/admin' },
        { name: 'Previsualización' },
      ]} />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl lg:px-8">
        {/* Preview banner */}
        <div className="mb-6 rounded-md bg-yellow-50 p-4">
          <div className="flex items-start justify-between">
            <div className="flex">
              <div className="shrink-0">
                <InformationCircleIcon aria-hidden="true" className="size-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Previsualización del producto. Esta es una vista solo para administradores.
                </p>
              </div>
            </div>
            {product.status === 'pending' && (
              <button
                onClick={onApprove}
                disabled={approving}
                className="ml-4 shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approving ? 'Aprobando...' : 'Aprobar'}
              </button>
            )}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative">
            <Image
              alt={product.name}
              src={getArtImageUrl(product.basename)}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
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
              <SafeProductDescription
                html={product.description}
                className="space-y-6 text-base text-gray-700 prose prose-sm max-w-none"
              />
            </div>

            <div className="mt-6">
              <p className="text-lg text-gray-700">
                <span className="font-medium">Soporte:</span>{' '}
                {product.type}
              </p>
              {product.seller_full_name && (
                <p className="text-lg text-gray-700 mt-1">
                  <span className="font-medium">Autor:</span>{' '}
                  {product.seller_full_name}
                </p>
              )}
            </div>

            {product.ai_generated === 1 && (
              <div className="mt-6 rounded-md bg-blue-50 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <InformationCircleIcon aria-hidden="true" className="size-5 text-blue-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      Para la creación de este producto se ha utilizado parcial o totalmente Inteligencia Artificial.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-10 flex flex-col gap-4">
              <button
                disabled
                className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-gray-300 px-8 py-3 text-base font-medium text-gray-500 cursor-not-allowed sm:w-full"
              >
                Previsualización
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function OthersPreview({ product, onApprove, approving }) {
  const [selectedVariant, setSelectedVariant] = useState(null)

  useEffect(() => {
    if (product.variations && product.variations.length > 0) {
      const firstAvailable = product.variations.find(v => v.stock > 0)
      setSelectedVariant(firstAvailable || product.variations[0])
    }
  }, [product])

  const totalStock = product.variations ? product.variations.reduce((sum, v) => sum + (v.stock || 0), 0) : 0

  return (
    <>
      <Breadcrumbs items={[
        { name: 'Admin', href: '/admin' },
        { name: 'Previsualización' },
      ]} />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl lg:px-8">
        {/* Preview banner */}
        <div className="mb-6 rounded-md bg-yellow-50 p-4">
          <div className="flex items-start justify-between">
            <div className="flex">
              <div className="shrink-0">
                <InformationCircleIcon aria-hidden="true" className="size-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Previsualización del producto. Esta es una vista solo para administradores.
                </p>
              </div>
            </div>
            {product.status === 'pending' && (
              <button
                onClick={onApprove}
                disabled={approving}
                className="ml-4 shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approving ? 'Aprobando...' : 'Aprobar'}
              </button>
            )}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative">
            <Image
              alt={product.name}
              src={getOthersImageUrl(product.basename)}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>

          {/* Product info */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{product.name}</h1>

            <div className="mt-3">
              <h2 className="sr-only">Información del producto</h2>
              <p className="text-3xl tracking-tight text-gray-900">€{product.price.toFixed(2)}</p>
            </div>

            <div className="mt-6">
              <h3 className="sr-only">Descripción</h3>
              <SafeProductDescription
                html={product.description}
                className="space-y-6 text-base text-gray-700 prose prose-sm max-w-none"
              />
            </div>

            <div className="mt-6">
              {product.seller_full_name && (
                <p className="text-lg text-gray-700 mt-1">
                  <span className="font-medium">Autor:</span>{' '}
                  {product.seller_full_name}
                </p>
              )}
            </div>

            {product.ai_generated === 1 && (
              <div className="mt-6 rounded-md bg-blue-50 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <InformationCircleIcon aria-hidden="true" className="size-5 text-blue-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      Para la creación de este producto se ha utilizado parcial o totalmente Inteligencia Artificial.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Variations */}
            {product.variations && product.variations.length > 0 && product.is_sold !== 1 && totalStock > 0 && (
              <div className="mt-6">
                <label htmlFor="variation" className="block text-sm font-medium text-gray-900">
                  Selecciona una opción:
                </label>
                <select
                  id="variation"
                  value={selectedVariant?.id || ''}
                  onChange={(e) => {
                    const variant = product.variations.find(v => v.id === parseInt(e.target.value, 10))
                    setSelectedVariant(variant)
                  }}
                  className="mt-2 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black"
                >
                  {product.variations.map((variant) => (
                    <option key={variant.id} value={variant.id} disabled={variant.stock === 0}>
                      {variant.key ? variant.key : 'Opción estándar'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-4">
              <button
                disabled
                className="w-full max-w-xs flex items-center justify-center rounded-md border border-transparent bg-gray-300 px-8 py-3 text-base font-medium text-gray-500 cursor-not-allowed"
              >
                Previsualización
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ProductPreviewPageContent({ params }) {
  const unwrappedParams = use(params)
  const searchParams = useSearchParams()
  const type = searchParams.get('type')
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const { showSuccess, showApiError } = useNotification()

  useEffect(() => {
    if (!type || (type !== 'art' && type !== 'others')) {
      setError('Tipo de producto no válido')
      setLoading(false)
      return
    }
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const data = await adminAPI.products.getPreview(unwrappedParams.id, type)
      setProduct(data.product)
    } catch (err) {
      setError('No se pudo cargar el producto')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setApproving(true)
    try {
      await adminAPI.products.updateStatus(unwrappedParams.id, type, 'approved')
      setProduct(prev => ({ ...prev, status: 'approved' }))
      showSuccess('Producto aprobado correctamente')
    } catch (err) {
      showApiError(err)
    } finally {
      setApproving(false)
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
        <p className="text-red-500">{error || 'Producto no encontrado'}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      {type === 'art' ? (
        <ArtPreview product={product} onApprove={handleApprove} approving={approving} />
      ) : (
        <OthersPreview product={product} onApprove={handleApprove} approving={approving} />
      )}
    </div>
  )
}

export default function ProductPreviewPage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <ProductPreviewPageContent params={params} />
    </AuthGuard>
  )
}
