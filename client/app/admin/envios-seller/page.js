'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '@/lib/api'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import Image from 'next/image'

const STATUS_LABELS = {
  paid: 'Pagado',
  sent: 'Enviado',
  arrived: 'Entregado',
  confirmed: 'Confirmado',
}

const STATUS_COLORS = {
  paid: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  arrived: 'bg-green-100 text-green-800',
  confirmed: 'bg-gray-100 text-gray-800',
}

const TABS = [
  { key: null, label: 'Todos' },
  { key: 'paid', label: 'Pagados' },
  { key: 'sent', label: 'Enviados' },
  { key: 'arrived', label: 'Entregados' },
  { key: 'confirmed', label: 'Confirmados' },
]

function formatDateSpanish(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const day = d.getDate()
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day} de ${month} de ${year} a las ${hours}:${minutes}`
}

function formatDeliveryAddress(addr) {
  if (!addr) return ''
  const parts = [addr.line1, addr.line2, addr.postalCode, addr.city, addr.country].filter(Boolean)
  return parts.join(', ')
}

function formatCarrierName(code) {
  if (!code) return ''
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getCarrierCode(order) {
  return order.items?.find(i => i.sendcloudCarrierCode)?.sendcloudCarrierCode
}

function AdminSellerShipmentsContent() {
  const [sellers, setSellers] = useState([])
  const [selectedSellerId, setSelectedSellerId] = useState('')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingSellers, setLoadingSellers] = useState(true)
  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)

  // Load sellers on mount
  useEffect(() => {
    adminAPI.authors.getAll()
      .then(res => {
        const sorted = (res.authors || []).slice().sort((a, b) =>
          (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'es')
        )
        setSellers(sorted)
      })
      .catch(() => setSellers([]))
      .finally(() => setLoadingSellers(false))
  }, [])

  const loadOrders = useCallback(async () => {
    if (!selectedSellerId) return
    setLoading(true)
    try {
      const res = await adminAPI.orders.getSellerShipments(selectedSellerId, statusFilter, page)
      setOrders(res.orders || [])
      setPagination(res.pagination || null)
    } catch {
      setOrders([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [selectedSellerId, statusFilter, page])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleSellerChange = (id) => {
    setSelectedSellerId(id)
    setStatusFilter(null)
    setPage(1)
  }

  const handleFilterChange = (status) => {
    setStatusFilter(status)
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Envíos por vendedor</h1>
      <p className="mt-1 text-sm text-gray-500">Consulta los envíos de cualquier vendedor.</p>

      {/* Seller selector */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
        <select
          value={selectedSellerId}
          onChange={(e) => handleSellerChange(e.target.value)}
          disabled={loadingSellers}
          className="block w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
        >
          <option value="">-- Seleccionar vendedor --</option>
          {sellers.map(s => (
            <option key={s.id} value={s.id}>
              {s.full_name ? `${s.full_name} (${s.email})` : s.email}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state: no seller selected */}
      {!selectedSellerId && !loadingSellers && (
        <p className="mt-12 text-center text-sm text-gray-500">
          Selecciona un vendedor para ver sus envíos.
        </p>
      )}

      {/* Content: seller selected */}
      {selectedSellerId && (
        <>
          {/* Status Tabs */}
          <div className="mt-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-2">
            {TABS.map(tab => (
              <button
                key={tab.key || 'all'}
                onClick={() => handleFilterChange(tab.key)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-black text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders List */}
          {loading ? (
            <div className="mt-8 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
            </div>
          ) : orders.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-500">No hay pedidos para mostrar.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {orders.map(order => (
                <div key={order.orderId} className="rounded-lg border border-gray-200 p-4">

                  {/* Product images row */}
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {order.items?.map((item, idx) => {
                      const imageUrl = item.productType === 'art'
                        ? getArtImageUrl(item.productBasename)
                        : getOthersImageUrl(item.productBasename)

                      return (
                        <div key={`${item.productType}-${item.productId}-${item.variantId || idx}`} className="flex-shrink-0">
                          <div className="relative h-20 w-20 overflow-hidden rounded-md border border-gray-200">
                            <Image
                              src={imageUrl}
                              alt={item.productName}
                              width={80}
                              height={80}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                            <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
                              {item.quantity}
                            </span>
                            {item.variantName && (
                              <span className="absolute bottom-0 left-0 right-0 bg-white/80 px-1 py-0.5 text-center text-[9px] font-medium text-gray-700 truncate">
                                {item.variantName}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Order info + status badge */}
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">
                        Pedido realizado el {formatDateSpanish(order.createdAt)}.
                      </p>
                      {order.deliveryAddress && (
                        <p className="mt-0.5 text-sm text-gray-500">
                          Dirección de entrega: {formatDeliveryAddress(order.deliveryAddress)}
                        </p>
                      )}
                      {getCarrierCode(order) && (
                        <p className="mt-0.5 text-sm text-gray-500">
                          Empresa de envío: {formatCarrierName(getCarrierCode(order))}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">Pedido #{order.orderId}</p>
                    </div>
                    <span className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function AdminSellerShipmentsPage() {
  return (
    <AuthGuard requireRole="admin">
      <AdminSellerShipmentsContent />
    </AuthGuard>
  )
}
