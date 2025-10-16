'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { productsAPI, getProductImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

function SellerProductsPageContent() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const data = await productsAPI.getSellerProducts()
      setProducts(data.products)
    } catch (err) {
      setError('No se pudieron cargar tus obras')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando tus obras...</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="py-16 sm:py-24 lg:mx-auto lg:max-w-7xl lg:px-8">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-0">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Mis obras</h2>
          <Link
            href="/seller/publish"
            className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800"
          >
            Publicar nueva obra
          </Link>
        </div>

        {error && (
          <div className="mt-4 mx-4 sm:mx-6 lg:mx-0 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {products.length === 0 ? (
          <div className="mt-8 px-4 sm:px-6 lg:px-0">
            <p className="text-gray-500 text-center">Aún no has publicado ninguna obra.</p>
            {/*<div className="mt-4 text-center">*/}
            {/*  <Link*/}
            {/*    href="/seller/publish"*/}
            {/*    className="text-indigo-600 hover:text-indigo-500 font-semibold"*/}
            {/*  >*/}
            {/*    Publica tu primera obra*/}
            {/*  </Link>*/}
            {/*</div>*/}
          </div>
        ) : (
          <div className="relative mt-8">
            <div className="relative w-full">
              <ul
                role="list"
                className="mx-4 grid grid-cols-1 gap-8 sm:mx-6 sm:grid-cols-2 lg:mx-0 lg:grid-cols-4"
              >
                {products.map((product) => (
                  <li key={product.id} className="inline-flex w-full flex-col text-center">
                    <div className="group relative">
                      <img
                        alt={product.name}
                        src={getProductImageUrl(product.basename)}
                        className="aspect-square w-full rounded-md bg-gray-200 object-cover group-hover:opacity-75"
                      />
                      <div className="mt-6">
                        <p className="text-sm text-gray-500">
                          {product.type} - {product.is_sold ? 'VENDIDA' : 'Disponible'}
                        </p>
                        <h3 className="mt-1 font-semibold text-gray-900">
                          <Link href={`/galeria/${product.slug}`}>
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
        )}
      </div>
    </div>
  )
}

export default function SellerProductsPage() {
  return (
    <AuthGuard requireRole="seller">
      <SellerProductsPageContent />
    </AuthGuard>
  )
}
