'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

function OrderDetailPageContent({ params }) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOrder()
  }, [])

  const loadOrder = async () => {
    try {
      const data = await ordersAPI.getById(params.id)
      setOrder(data.order)
    } catch (err) {
      setError('No se pudieron cargar los detalles del pedido')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando detalles del pedido...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Pedido no encontrado'}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mb-8">
          <Link href="/orders" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500">
            &larr; Volver a pedidos
          </Link>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Pedido #{order.id}
        </h1>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-900">Fecha de pedido</dt>
              <dd className="mt-1 text-sm text-gray-500">
                {new Date(order.created_at).toLocaleDateString('es-ES')} a las{' '}
                {new Date(order.created_at).toLocaleTimeString('es-ES')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-900">Estado</dt>
              <dd className="mt-1 text-sm text-gray-500 capitalize">{order.status}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-900">Monto total</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">
                €{order.total_price.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900">Artículos adquiridos</h2>
          <div className="mt-6 divide-y divide-gray-200 border-t border-gray-200">
            {order.items.map((item) => {
              // Determine image URL based on product type
              const imageUrl = item.product_type === 'art'
                ? getArtImageUrl(item.basename)
                : getOthersImageUrl(item.basename);

              return (
                <div key={item.id} className="py-6 flex items-center">
                  <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                    <img
                      alt={item.name}
                      src={imageUrl}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="ml-6 flex-1">
                    <div className="flex justify-between">
                      <div>
                        <h3 className="text-base font-medium text-gray-900">{item.name}</h3>
                        <div
                          className="mt-1 text-sm text-gray-500 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: item.description }}
                        />
                        {item.product_type === 'art' && item.type && (
                          <p className="mt-1 text-sm text-gray-500">
                            Soporte: {item.type}
                          </p>
                        )}
                        {item.product_type === 'other' && item.variant_key && (
                          <p className="mt-1 text-sm text-gray-500">
                            Variación: {item.variant_key}
                          </p>
                        )}
                      </div>
                      <p className="text-base font-medium text-gray-900">
                        €{item.price_at_purchase.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-500">
            Se ha enviado un correo de confirmación a tu dirección de correo electrónico con los detalles de tu pedido.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage({ params }) {
  return (
    <AuthGuard>
      <OrderDetailPageContent params={params} />
    </AuthGuard>
  )
}
