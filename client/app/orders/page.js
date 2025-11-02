'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { EyeIcon } from '@heroicons/react/20/solid'

function OrdersPageContent() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const observerRef = useRef(null)
  const loadMoreRef = useRef(null)

  useEffect(() => {
    loadOrders(1)
  }, [])

  const loadOrders = async (pageNum) => {
    try {
      if (pageNum === 1) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const data = await ordersAPI.getAll({ page: pageNum, limit: 5 })

      if (pageNum === 1) {
        setOrders(data.orders)
      } else {
        setOrders(prev => [...prev, ...data.orders])
      }

      setHasMore(data.pagination.hasMore)
      setPage(pageNum)
    } catch (err) {
      setError('No se pudieron cargar los pedidos')
      console.error('Error loading orders:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Infinite scroll observer
  const lastOrderRef = useCallback(
    (node) => {
      if (loading || loadingMore) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadOrders(page + 1)
        }
      })

      if (node) observerRef.current.observe(node)
    },
    [loading, loadingMore, hasMore, page]
  )

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getImageUrl = (item) => {
    return item.product_type === 'art'
      ? getArtImageUrl(item.basename)
      : getOthersImageUrl(item.basename)
  }

  const getItemsSummary = (items) => {
    if (items.length === 0) return 'Sin items'
    if (items.length === 1) return items[0].name
    return `${items[0].name} +${items.length - 1} más`
  }

  const getTotalShipping = (items) => {
    return items.reduce((sum, item) => sum + (item.shipping_cost || 0), 0)
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pendiente', class: 'bg-yellow-100 text-yellow-800' },
      completed: { label: 'Completado', class: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
      processing: { label: 'Procesando', class: 'bg-blue-100 text-blue-800' },
    }

    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando pedidos...</p>
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

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mis Pedidos</h1>
          <p className="mt-2 text-sm text-gray-700">
            Consulta los pedidos que contienen tus productos
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay pedidos disponibles</p>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        ID
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Fecha
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Productos
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Envío
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Total
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Estado
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Ver</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orders.map((order, index) => {
                      const isLastOrder = index === orders.length - 1
                      return (
                        <tr key={order.id} ref={isLastOrder ? lastOrderRef : null}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                            #{order.id}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-500">
                            <div>{getItemsSummary(order.items)}</div>
                            <div className="text-xs text-gray-400">{order.items.length} item(s)</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            €{getTotalShipping(order.items).toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                            €{order.total_price.toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            {getStatusBadge(order.status)}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                            <Link
                              href={`/orders/${order.id}`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {loadingMore && (
                  <div className="text-center py-4">
                    <p className="text-gray-500">Cargando más pedidos...</p>
                  </div>
                )}

                {!hasMore && orders.length > 0 && (
                  <div className="text-center py-4">
                    <p className="text-gray-400 text-sm">No hay más pedidos</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
