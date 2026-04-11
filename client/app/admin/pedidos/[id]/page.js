'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI, getArtImageUrl, getOthersImageUrl, triggerDownload } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import { Popover, PopoverButton, PopoverPanel, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { SafeProductDescription } from '@/components/SafeHTML'

const ORDER_STATUSES = [
  { value: 'pending_payment', label: 'Pendiente de pago' },
  { value: 'paid', label: 'Pagado' },
  { value: 'sent', label: 'Enviado' },
  { value: 'arrived', label: 'Recibido' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'reimbursed', label: 'Reembolsado' },
]

function StatusChangeModal({ open, onClose, onConfirm, confirming, title }) {
  const [selectedStatus, setSelectedStatus] = useState('')

  const handleClose = () => {
    setSelectedStatus('')
    onClose()
  }

  const handleConfirm = () => {
    if (selectedStatus) {
      onConfirm(selectedStatus)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-all data-closed:scale-95 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        >
          <DialogTitle className="text-lg font-semibold text-gray-900">{title || 'Cambiar estado'}</DialogTitle>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Nuevo estado</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={confirming}
              className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">Selecciona un estado</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={handleClose}
              disabled={confirming}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
              onClick={handleConfirm}
              disabled={confirming || !selectedStatus}
            >
              {confirming ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

function OrderDetailContent() {
  const params = useParams()
  const router = useRouter()
  const { showBanner } = useBannerNotification()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Item-level status change modal state
  const [itemStatusDialog, setItemStatusDialog] = useState({ open: false, item: null })
  const [changingItemStatus, setChangingItemStatus] = useState(false)

  // Order-level status change modal state
  const [orderStatusDialog, setOrderStatusDialog] = useState(false)
  const [changingOrderStatus, setChangingOrderStatus] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState(null)

  useEffect(() => {
    if (params.id) {
      loadOrder()
    }
  }, [params.id])

  const loadOrder = async () => {
    try {
      const data = await adminAPI.orders.getById(params.id)
      setOrder(data.order)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el pedido')
      console.error('Error loading order:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle item status change
  const handleItemStatusChange = async (newStatus) => {
    if (!itemStatusDialog.item) return
    setChangingItemStatus(true)
    try {
      const data = await adminAPI.orders.updateItemStatus(
        params.id,
        itemStatusDialog.item.id,
        newStatus,
        itemStatusDialog.item.product_type
      )
      setOrder(data.order)
      showBanner('Estado del producto actualizado correctamente')
      setItemStatusDialog({ open: false, item: null })
    } catch (err) {
      showBanner(err.message || 'No se pudo actualizar el estado del producto')
      console.error('Error changing item status:', err)
    } finally {
      setChangingItemStatus(false)
    }
  }

  // Handle order status change
  const handleOrderStatusChange = async (newStatus) => {
    setChangingOrderStatus(true)
    try {
      const data = await adminAPI.orders.updateOrderStatus(params.id, newStatus)
      setOrder(data.order)
      showBanner('Estado del pedido actualizado correctamente')
      setOrderStatusDialog(false)
    } catch (err) {
      showBanner(err.message || 'No se pudo actualizar el estado del pedido')
      console.error('Error changing order status:', err)
    } finally {
      setChangingOrderStatus(false)
    }
  }

  // Handle invoice PDF download
  const handleInvoiceDownload = async (type) => {
    setDownloadingInvoice(type)
    try {
      const blob = await adminAPI.invoices.downloadBuyerInvoice(params.id, type)
      triggerDownload(blob, `factura-pedido-${params.id}-${type}.pdf`)
    } catch (err) {
      showBanner(err.message || 'No se pudo generar la factura')
    } finally {
      setDownloadingInvoice(null)
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
    const statusConfig = {
      pending_payment: { label: 'Pendiente de pago', class: 'bg-blue-100 text-blue-800' },
      paid: { label: 'Pagado', class: 'bg-amber-100 text-amber-800' },
      sent: { label: 'Enviado', class: 'bg-indigo-100 text-indigo-800' },
      arrived: { label: 'Recibido', class: 'bg-emerald-100 text-emerald-800' },
      confirmed: { label: 'Confirmado', class: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
      reimbursed: { label: 'Reembolsado', class: 'bg-orange-100 text-orange-800' },
    }

    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const getSubtotal = () => {
    return order.items.reduce((sum, item) => sum + item.price_at_purchase, 0)
  }

  const getTotalShipping = () => {
    return order.items.reduce((sum, item) => sum + (item.shipping_cost || 0), 0)
  }

  const hasArtItems = order?.items?.some(item => item.product_type === 'art')
  const hasOtherItems = order?.items?.some(item => item.product_type === 'other')

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
            href="/admin/pedidos"
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
          href="/admin/pedidos"
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
            <div className="flex items-center gap-3">
              {getStatusBadge(order.status)}
              <button
                onClick={() => setOrderStatusDialog(true)}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800"
              >
                Cambiar estado del pedido
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main content - Order items */}
          <div className="lg:col-span-2">
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Productos</h2>
                <ul role="list" className="divide-y divide-gray-200">
                  {order.items.map((item, index) => (
                    <li key={index} className="py-6 flex">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-gray-200 relative">
                        <Image
                          src={getImageUrl(item)}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>

                      <div className="ml-4 flex flex-1 flex-col">
                        <div>
                          <div className="flex justify-between text-base font-medium text-gray-900">
                            <h3>{item.name}</h3>
                            <div className="ml-4 flex items-center gap-2">
                              <p>€{item.price_at_purchase.toFixed(2)}</p>
                              <Popover className="relative">
                                <PopoverButton className="inline-flex items-center gap-x-1 rounded-md p-1 hover:bg-gray-100">
                                  <EllipsisVerticalIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
                                </PopoverButton>
                                <PopoverPanel
                                  transition
                                  className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                                >
                                  <button
                                    onClick={() => setItemStatusDialog({ open: true, item })}
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                                  >
                                    Cambiar estado
                                  </button>
                                </PopoverPanel>
                              </Popover>
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-sm text-gray-500">
                              Tipo: {item.product_type === 'art' ? item.type : 'Otro'}
                              {item.variant_key && ` · ${item.variant_key}`}
                            </p>
                            {item.status && getStatusBadge(item.status)}
                          </div>
                          {item.seller_name && (
                            <p className="mt-1 text-sm text-gray-500">
                              Vendedor: {item.seller_name}
                            </p>
                          )}
                        </div>
                        {item.shipping_method_name && (
                          <div className="mt-2 text-sm text-gray-600">
                            <p className="font-medium">Envío:</p>
                            <p>
                              {item.shipping_method_name}
                              {item.shipping_method_type === 'pickup' && ' (Recogida)'}
                              {' · '}€{(item.shipping_cost || 0).toFixed(2)}
                            </p>
                            {item.tracking && (
                              <p className="mt-1 text-sm text-gray-700">
                                Seguimiento: <a href={item.tracking} target="_blank" rel="noopener noreferrer"
                                                className="font-medium text-blue-600 hover:text-blue-800 underline">{item.tracking}</a>
                              </p>
                            )}
                          </div>
                        )}
                        {item.description && (
                          <SafeProductDescription
                            html={item.description}
                            className="mt-2 text-sm text-gray-500 line-clamp-2"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Sidebar - Order summary and buyer info */}
          <div className="lg:col-span-1">
            {/* Buyer information */}
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Información del comprador</h2>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Nombre</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {order.email || order.guest_email || 'Invitado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {order.email || order.guest_email || 'Sin email'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Teléfono</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {order.phone || 'Sin teléfono'}
                    </dd>
                  </div>
                  {order.guest_email && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Tipo</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          Compra como invitado
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Facturas */}
            {(hasArtItems || hasOtherItems) && (
              <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden mb-6">
                <div className="px-4 py-5 sm:p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Facturas</h2>
                  <div className="space-y-3">
                    {hasArtItems && (
                      <button
                        onClick={() => handleInvoiceDownload('rebu')}
                        disabled={downloadingInvoice === 'rebu'}
                        className="w-full rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-60"
                      >
                        {downloadingInvoice === 'rebu' ? 'Generando...' : 'Descargar factura REBU'}
                      </button>
                    )}
                    {hasOtherItems && (
                      <button
                        onClick={() => handleInvoiceDownload('standard')}
                        disabled={downloadingInvoice === 'standard'}
                        className="w-full rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-60"
                      >
                        {downloadingInvoice === 'standard' ? 'Generando...' : 'Descargar factura IVA 21%'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Order summary */}
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Resumen del pedido</h2>
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

      {/* Item status change modal */}
      <StatusChangeModal
        open={itemStatusDialog.open}
        onClose={() => setItemStatusDialog({ open: false, item: null })}
        onConfirm={handleItemStatusChange}
        confirming={changingItemStatus}
        title={`Cambiar estado: ${itemStatusDialog.item?.name || ''}`}
      />

      {/* Order status change modal */}
      <StatusChangeModal
        open={orderStatusDialog}
        onClose={() => setOrderStatusDialog(false)}
        onConfirm={handleOrderStatusChange}
        confirming={changingOrderStatus}
        title={`Cambiar estado del pedido #${order.id}`}
      />
    </div>
  )
}

export default function OrderDetailPage() {
  return (
    <AuthGuard requireRole="admin">
      <OrderDetailContent />
    </AuthGuard>
  )
}
