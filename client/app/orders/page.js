'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ordersAPI, getProductImageUrl } from '@/lib/api'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import AuthGuard from '@/components/AuthGuard'

function OrdersPageContent() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    try {
      const data = await ordersAPI.getAll()
      setOrders(data.orders)
    } catch (err) {
      setError('No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando tus pedidos...</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl sm:px-2 lg:px-8">
          <div className="mx-auto max-w-2xl px-4 lg:max-w-4xl lg:px-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Historial de pedidos
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Consulta el estado de pedidos recientes y ve los detalles.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 mx-auto max-w-7xl sm:px-2 lg:px-8">
            <div className="mx-auto max-w-2xl px-4 lg:max-w-4xl lg:px-0">
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-16">
          <h2 className="sr-only">Pedidos recientes</h2>
          <div className="mx-auto max-w-7xl sm:px-2 lg:px-8">
            <div className="mx-auto max-w-2xl space-y-8 sm:px-4 lg:max-w-4xl lg:px-0">
              {orders.length === 0 ? (
                <p className="text-center text-gray-500">Aún no hay pedidos</p>
              ) : (
                orders.map((order) => (
                  <div
                    key={order.id}
                    className="border-t border-b border-gray-200 bg-white shadow-xs sm:rounded-lg sm:border"
                  >
                    <div className="flex items-center border-b border-gray-200 p-4 sm:grid sm:grid-cols-4 sm:gap-x-6 sm:p-6">
                      <dl className="grid flex-1 grid-cols-2 gap-x-6 text-sm sm:col-span-3 sm:grid-cols-3 lg:col-span-2">
                        <div>
                          <dt className="font-medium text-gray-900">Número de pedido</dt>
                          <dd className="mt-1 text-gray-500">#{order.id}</dd>
                        </div>
                        <div className="hidden sm:block">
                          <dt className="font-medium text-gray-900">Fecha de pedido</dt>
                          <dd className="mt-1 text-gray-500">
                            {new Date(order.created_at).toLocaleDateString('es-ES')}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-900">Monto total</dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            €{order.total_price.toFixed(2)}
                          </dd>
                        </div>
                      </dl>

                      <div className="hidden lg:flex lg:items-center lg:justify-end lg:space-x-4 lg:col-span-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                        >
                          Ver pedido
                        </Link>
                      </div>
                    </div>

                    {/* Products */}
                    <h4 className="sr-only">Artículos</h4>
                    <ul role="list" className="divide-y divide-gray-200">
                      {order.items.map((item) => (
                        <li key={item.id} className="p-4 sm:p-6">
                          <div className="flex items-center sm:items-start">
                            <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-gray-200 sm:size-40">
                              <img
                                alt={item.name}
                                src={getProductImageUrl(item.basename)}
                                className="size-full object-cover"
                              />
                            </div>
                            <div className="ml-6 flex-1 text-sm">
                              <div className="font-medium text-gray-900 sm:flex sm:justify-between">
                                <h5>{item.name}</h5>
                                <p className="mt-2 sm:mt-0">€{item.price_at_purchase.toFixed(2)}</p>
                              </div>
                              <p className="mt-2 text-gray-500">{item.type}</p>
                            </div>
                          </div>

                          <div className="mt-6 sm:flex sm:justify-between">
                            <div className="flex items-center">
                              <CheckCircleIcon aria-hidden="true" className="size-5 text-green-500" />
                              <p className="ml-2 text-sm font-medium text-gray-500">
                                Pedido completado
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  return (
    <AuthGuard>
      <OrdersPageContent />
    </AuthGuard>
  )
}
