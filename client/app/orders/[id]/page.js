'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon, InformationCircleIcon, MapPinIcon, DocumentTextIcon } from '@heroicons/react/20/solid'

function OrderDetailContent() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.id) {
      loadOrder()
    }
  }, [params.id])

  const loadOrder = async () => {
    try {
      const data = await ordersAPI.getById(params.id)
      setOrder(data.order)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el pedido')
      console.error('Error loading order:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
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

  const getStatusBadge = (status) => {
    const arrivedTooltip =
      'Pendiente de confirmación del comprador. El importe de la venta se añadirá a tu balance cuando el usuario confirme, o después de 5 días si no lo hace'

    const statusConfig = {
      pending_payment: { label: 'Pendiente de pago', class: 'bg-blue-100 text-blue-800' },
      paid: { label: 'Pagado', class: 'bg-amber-100 text-amber-800' },
      sent: { label: 'Enviado', class: 'bg-indigo-100 text-indigo-800' },
      arrived: { label: 'Recibido', class: 'bg-emerald-100 text-emerald-800', showInfo: true },
      confirmed: { label: 'Confirmado', class: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
      reimbursed: { label: 'Reembolsado', class: 'bg-orange-100 text-orange-800' },
    }

    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className="inline-flex items-center gap-1">
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
          {config.label}
        </span>
        {config.showInfo && (
          <InformationCircleIcon
            className="h-4 w-4 text-gray-400"
            aria-hidden="true"
            title={arrivedTooltip}
          />
        )}
      </span>
    )
  }

  const getSubtotal = () => {
    return order.items.reduce((sum, item) => sum + item.price_at_purchase, 0)
  }

  const getTotalShipping = () => {
    return order.items.reduce((sum, item) => sum + (item.shipping_cost || 0), 0)
  }

  // Address helpers
  const hasAnyDeliveryAddress = () => {
    const fields = [
      'address_line_1',
      'address_line_2',
      'postal_code',
      'city',
      'province',
      'country',
    ]
    return fields.some((f) => !!order[`delivery_${f}`])
  }

  const getAddressLines = (prefix) => {
    const line1 = order[`${prefix}_address_line_1`] || ''
    const line2 = order[`${prefix}_address_line_2`] || ''
    const pc = order[`${prefix}_postal_code`] || ''
    const city = order[`${prefix}_city`] || ''
    const province = order[`${prefix}_province`] || ''
    const country = order[`${prefix}_country`] || ''

    const lines = []
    if (line1) lines.push(line1)
    if (line2) lines.push(line2)
    const cityLine = [pc, city].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    const regionLine = [province, country].filter(Boolean).join(' · ')
    if (regionLine) lines.push(regionLine)

    return lines
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando pedido...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Link
            href="/orders"
            className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Volver a pedidos
          </Link>
          <p className="text-red-500 mt-4">{error}</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return null
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Back button */}
        <Link
          href="/orders"
          className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Volver a pedidos
        </Link>

        {/* Order header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Pedido #{order.id}
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Realizado el {formatDate(order.created_at)}
              </p>
            </div>
            <div>
              {getStatusBadge(order.status)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main content - Order items */}
          <div className="lg:col-span-2">
            {/* Addresses card */}
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Direcciones</h2>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* Delivery address */}
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-gray-900">Entrega</h3>
                    </div>

                    {hasAnyDeliveryAddress() ? (
                      <address className="mt-2 not-italic space-y-1">
                        {getAddressLines('delivery').map((line, idx) => (
                          <p key={idx} className="text-sm text-gray-700">
                            {line}
                          </p>
                        ))}
                      </address>
                    ) : (
                      <p className="mt-2 inline-flex items-center rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                        Pedido para recogida
                      </p>
                    )}
                  </div>

                  {/* Invoicing address */}
                  <div>
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-gray-900">Facturación</h3>
                    </div>
                    <address className="mt-2 not-italic space-y-1">
                      {getAddressLines('invoicing').length > 0 ? (
                        getAddressLines('invoicing').map((line, idx) => (
                          <p key={idx} className="text-sm text-gray-700">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">—</p>
                      )}
                    </address>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Tus productos en este pedido</h2>
                <ul role="list" className="divide-y divide-gray-200">
                  {order.items.map((item, index) => (
                    <li key={index} className="py-6 flex">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-gray-200">
                        <img
                          src={getImageUrl(item)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="ml-4 flex flex-1 flex-col">
                        <div>
                          <div className="flex justify-between text-base font-medium text-gray-900">
                            <h3>{item.name}</h3>
                            <p className="ml-4">€{item.price_at_purchase.toFixed(2)}</p>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            Tipo: {item.product_type === 'art' ? item.type : 'Otro'}
                            {item.variant_key && ` · ${item.variant_key}`}
                          </p>
                        </div>
                        {item.shipping_method_name && (
                          <div className="mt-2 text-sm text-gray-600">
                            <p className="font-medium">Envío:</p>
                            <p>
                              {item.shipping_method_name}
                              {item.shipping_method_type === 'pickup' && ' (Recogida)'}
                              {' · '}€{(item.shipping_cost || 0).toFixed(2)}
                            </p>
                          </div>
                        )}
                        {item.description && (
                          <div
                            className="mt-2 text-sm text-gray-500 line-clamp-2"
                            dangerouslySetInnerHTML={{ __html: item.description }}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Sidebar - Order summary */}
          <div className="lg:col-span-1">
            {/* Order summary */}
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Resumen (tus productos)</h2>
                <dl className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-500">Subtotal productos</dt>
                    <dd className="font-medium text-gray-900">€{getSubtotal().toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-500">Envío</dt>
                    <dd className="font-medium text-gray-900">€{getTotalShipping().toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-medium">
                    <dt className="text-gray-900">Total</dt>
                    <dd className="text-gray-900">€{order.total_price.toFixed(2)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <OrderDetailContent />
    </AuthGuard>
  )
}
