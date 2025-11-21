'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { EyeIcon } from '@heroicons/react/20/solid'

function OrdersPageContent() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    try {
      const data = await adminAPI.orders.getAll()
      setOrders(data.orders)
    } catch (err) {
      setError('No se pudieron cargar los pedidos')
      console.error('Error loading orders:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getItemsSummary = (items) => {
    if (items.length === 0) return 'Sin items'
    if (items.length === 1) return items[0].name
    return `${items[0].name} +${items.length - 1} más`
  }

  const getUniqueSellers = (items) => {
    const sellers = new Set()
    items.forEach(item => {
      if (item.seller_name) {
        sellers.add(item.seller_name)
      }
    })
    return Array.from(sellers).join(', ') || 'N/A'
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pedidos</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gestiona todos los pedidos de la plataforma
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
                        Comprador
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Vendedor(es)
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
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                          #{order.id}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          <div className="font-medium">{order.email || order.guest_email || 'Invitado'}</div>
                          <div className="text-gray-500">{order.phone || 'Sin teléfono'}</div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-500">
                          {getUniqueSellers(order.items)}
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
                            href={`/admin/pedidos/${order.id}`}
                            className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                          >
                            <EyeIcon className="h-5 w-5" />
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    <AuthGuard requireRole="admin">
      <OrdersPageContent />
    </AuthGuard>
  )
}
