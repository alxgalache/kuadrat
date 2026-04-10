'use client'

import { useState, useEffect, useCallback } from 'react'
import { sellerAPI } from '@/lib/api'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import PickupModal from '@/components/seller/PickupModal'
import ServicePointsInfoModal from '@/components/seller/ServicePointsInfoModal'
import BulkPickupModal from '@/components/seller/BulkPickupModal'
import BulkServicePointsModal from '@/components/seller/BulkServicePointsModal'
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

function canShowPickup(sellerConfig, order) {
  if (!sellerConfig) return false
  const firstMile = sellerConfig.firstMile
  const isPickupEligible = !firstMile || firstMile === 'pickup'
  return isPickupEligible && order.status === 'paid' && !order.pickup
}

function SellerOrdersContent() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sellerConfig, setSellerConfig] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [pickupModal, setPickupModal] = useState({ open: false, orderId: null })
  const [servicePointsModal, setServicePointsModal] = useState({ open: false, carrier: null, country: null, postalCode: null })
  const [bulkPickupModal, setBulkPickupModal] = useState(false)
  const [bulkServicePointsModal, setBulkServicePointsModal] = useState(false)
  const [notification, setNotification] = useState(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sellerAPI.getOrders(statusFilter, page)
      setOrders(res.orders || [])
      setPagination(res.pagination || null)
      setSellerConfig(res.sellerConfig || null)
    } catch (err) {
      console.error('Error loading seller orders:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleFilterChange = (status) => {
    setStatusFilter(status)
    setPage(1)
  }

  const handleDownloadLabel = async (order) => {
    // Find the first item with a shipment to download its label
    const item = order.items?.find(i => i.sendcloudShipmentId)
    if (!item || !item.orderItemId) return

    try {
      const res = await sellerAPI.getOrderLabel(
        item.productType === 'art' ? 'art' : 'others',
        item.orderItemId
      )
      if (res.blob) {
        // Backend returned PDF binary — open in a new tab
        const url = URL.createObjectURL(res.blob)
        window.open(url, '_blank')
      } else if (res.data?.labelUrl) {
        window.open(res.data.labelUrl, '_blank')
      }
    } catch (err) {
      console.error('Error downloading label:', err)
    }
  }

  const handlePickupSuccess = useCallback(() => {
    setNotification('Recogida programada correctamente')
    setTimeout(() => setNotification(null), 4000)
    loadOrders()
  }, [loadOrders])

  const hasSendcloudShipment = (order) => order.items?.some(i => i.sendcloudShipmentId)
  const hasTrackingUrl = (order) => order.items?.find(i => i.sendcloudTrackingUrl)
  const getCarrierCode = (order) => order.items?.find(i => i.sendcloudCarrierCode)?.sendcloudCarrierCode

  // Orders eligible for bulk pickup: paid, have carrier, no existing pickup
  const pickupEligibleOrders = orders.filter(o =>
    o.status === 'paid' && !o.pickup && getCarrierCode(o) && canShowPickup(sellerConfig, o)
  )
  const pickupCarriers = [...new Set(pickupEligibleOrders.map(o => getCarrierCode(o)))]

  // Orders with carrier code (for service points lookup)
  const servicePointCarriers = [...new Set(
    orders.filter(o => getCarrierCode(o)).map(o => getCarrierCode(o))
  )]

  const handleBulkPickupSuccess = useCallback(() => {
    setNotification('Recogida masiva programada correctamente')
    setTimeout(() => setNotification(null), 4000)
    loadOrders()
  }, [loadOrders])

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Mis envíos</h1>
      <p className="mt-1 text-sm text-gray-500">Gestiona los pedidos de tus productos.</p>

      {/* Notification */}
      {notification && (
        <div className="mt-4 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-700">{notification}</p>
        </div>
      )}

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

      {/* Global Actions (Pagados tab only) */}
      {statusFilter === 'paid' && !loading && (pickupCarriers.length > 0 || servicePointCarriers.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pickupCarriers.length > 0 && (
            <button
              onClick={() => setBulkPickupModal(true)}
              className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Programar recogida masiva
            </button>
          )}
          {servicePointCarriers.length > 0 && (
            <button
              onClick={() => setBulkServicePointsModal(true)}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Consultar puntos de entrega
            </button>
          )}
        </div>
      )}

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
                        {/* Quantity badge */}
                        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
                          {item.quantity}
                        </span>
                        {/* Variant name overlay */}
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

              {/* Action buttons row */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {hasSendcloudShipment(order) && (
                  <button
                    onClick={() => handleDownloadLabel(order)}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Descargar etiqueta
                  </button>
                )}

                {hasTrackingUrl(order) && (
                  <a
                    href={hasTrackingUrl(order).sendcloudTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Ver seguimiento
                  </a>
                )}

                {canShowPickup(sellerConfig, order) && (
                  <button
                    onClick={() => setPickupModal({ open: true, orderId: order.orderId })}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Programar recogida
                  </button>
                )}

                {getCarrierCode(order) && (
                  <button
                    onClick={() => setServicePointsModal({
                      open: true,
                      carrier: getCarrierCode(order),
                      country: order.deliveryAddress?.country || 'ES',
                      postalCode: order.deliveryAddress?.postalCode || '',
                    })}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Consultar puntos de entrega
                  </button>
                )}
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

      {/* Pickup Modal */}
      <PickupModal
        isOpen={pickupModal.open}
        onClose={() => setPickupModal({ open: false, orderId: null })}
        orderId={pickupModal.orderId}
        defaultAddress={sellerConfig?.defaultAddress}
        onSuccess={handlePickupSuccess}
      />

      {/* Service Points Info Modal */}
      <ServicePointsInfoModal
        isOpen={servicePointsModal.open}
        onClose={() => setServicePointsModal({ open: false, carrier: null, country: null, postalCode: null })}
        carrier={servicePointsModal.carrier}
        country={servicePointsModal.country}
        postalCode={servicePointsModal.postalCode}
      />

      {/* Bulk Pickup Modal */}
      <BulkPickupModal
        isOpen={bulkPickupModal}
        onClose={() => setBulkPickupModal(false)}
        carriers={pickupCarriers}
        orders={pickupEligibleOrders}
        defaultAddress={sellerConfig?.defaultAddress}
        onSuccess={handleBulkPickupSuccess}
      />

      {/* Bulk Service Points Modal */}
      <BulkServicePointsModal
        isOpen={bulkServicePointsModal}
        onClose={() => setBulkServicePointsModal(false)}
        carriers={servicePointCarriers}
        orders={orders}
      />
    </div>
  )
}

export default function SellerOrdersPage() {
  return (
    <AuthGuard requireRole="seller">
      <SellerOrdersContent />
    </AuthGuard>
  )
}
