'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon, InformationCircleIcon, MapPinIcon, DocumentTextIcon, EllipsisVerticalIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { Popover, PopoverButton, PopoverPanel, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { SafeProductDescription } from '@/components/SafeHTML'

// Tracking Modal Component
function TrackingModal({ open, onClose, onSave, trackingNumber, setTrackingNumber, saving, itemName }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">Añadir enlace de seguimiento</DialogTitle>
          <p className="mt-2 text-sm text-gray-600">
            Proporciona el enlace (url) de seguimiento para el artículo "{itemName || 'este producto'}".
          </p>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Enlace de seguimiento</label>
            <input
              type="text"
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Ej: https://tracking.to/1234567890"
              disabled={saving}
            />
            <p className="mt-3 text-sm text-gray-500 italic">Se enviará una notificación por correo electrónico al comprador</p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
              onClick={onSave}
              disabled={saving || !trackingNumber.trim()}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

// Confirmation Dialog Component with optional tracking
function ConfirmationDialog({ open, onClose, onConfirm, title, message, confirming, withTracking = false }) {
  const [addTracking, setAddTracking] = useState(false)
  const [trackingUrl, setTrackingUrl] = useState('')
  const [trackingError, setTrackingError] = useState('')

  const validateUrl = (url) => {
    if (!url || url.trim().length === 0) return true // Empty is valid when checkbox is checked but field is empty
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const handleConfirm = () => {
    if (addTracking && trackingUrl.trim().length > 0) {
      if (!validateUrl(trackingUrl)) {
        setTrackingError('Por favor, introduce una URL válida')
        return
      }
    }
    onConfirm(addTracking && trackingUrl.trim().length > 0 ? trackingUrl : null)
  }

  const handleClose = () => {
    setAddTracking(false)
    setTrackingUrl('')
    setTrackingError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-xl bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-xl sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95"
          >
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:mx-0 sm:size-10">
                <ExclamationTriangleIcon aria-hidden="true" className="size-6 text-gray-600" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                  {title}
                </DialogTitle>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">{message}</p>
                  <p className="mt-3 text-sm text-gray-500 italic">Se enviará una notificación por correo electrónico al comprador</p>
                </div>

                {withTracking && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center">
                      <input
                          id="add-tracking"
                          type="checkbox"
                          checked={addTracking}
                          onChange={(e) => {
                            setAddTracking(e.target.checked)
                            if (!e.target.checked) {
                              setTrackingUrl('')
                              setTrackingError('')
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-black accent-black focus:ring-black"
                          disabled={confirming}
                      />
                      <label htmlFor="add-tracking" className="ml-2 text-sm text-gray-700">
                        Añadir enlace de seguimiento
                      </label>
                    </div>

                    {addTracking && (
                      <div>
                        <input
                          type="url"
                          value={trackingUrl}
                          onChange={(e) => {
                            setTrackingUrl(e.target.value)
                            setTrackingError('')
                          }}
                          placeholder="https://ejemplo.com/tracking/123"
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                          disabled={confirming}
                        />
                        {trackingError && (
                          <p className="mt-1 text-sm text-red-600">{trackingError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || (addTracking && trackingUrl.trim().length === 0)}
                className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:opacity-60 sm:ml-3 sm:w-auto"
              >
                {confirming ? 'Procesando...' : 'Confirmar'}
              </button>
              <button
                type="button"
                data-autofocus
                onClick={handleClose}
                disabled={confirming}
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
              >
                Cancelar
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

function OrderDetailContent() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showBanner } = useBannerNotification()

  // Tracking modal state
  const [trackingModal, setTrackingModal] = useState({ open: false, item: null })
  const [trackingNumber, setTrackingNumber] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  // Mark item as sent confirmation dialog state
  const [itemSentDialog, setItemSentDialog] = useState({ open: false, item: null })
  const [markingItemSent, setMarkingItemSent] = useState(false)

  // Mark order as sent confirmation dialog state
  const [orderSentDialog, setOrderSentDialog] = useState(false)
  const [markingOrderSent, setMarkingOrderSent] = useState(false)

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

  // Handle opening tracking modal
  const openTrackingModal = (item) => {
    setTrackingModal({ open: true, item })
    setTrackingNumber(item.tracking || '')
  }

  // Handle saving tracking number
  const handleSaveTracking = async () => {
    if (!trackingModal.item) return
    setSavingTracking(true)
    try {
      const data = await ordersAPI.updateItemTracking(
        params.id,
        trackingModal.item.id,
        trackingNumber,
        trackingModal.item.product_type
      )
      setOrder(data.order)
      showBanner('Número de seguimiento guardado correctamente')
      setTrackingModal({ open: false, item: null })
      setTrackingNumber('')
    } catch (err) {
      showBanner(err.message || 'No se pudo guardar el número de seguimiento')
      console.error('Error saving tracking:', err)
    } finally {
      setSavingTracking(false)
    }
  }

  // Handle opening item sent dialog
  const openItemSentDialog = (item) => {
    setItemSentDialog({ open: true, item })
  }

  // Handle confirming item as sent
  const handleMarkItemSent = async (tracking) => {
    if (!itemSentDialog.item) return
    setMarkingItemSent(true)
    try {
      const data = await ordersAPI.updateItemStatus(
        params.id,
        itemSentDialog.item.id,
        'sent',
        itemSentDialog.item.product_type,
        tracking
      )
      setOrder(data.order)
      showBanner(tracking ? 'Producto marcado como enviado con seguimiento' : 'Producto marcado como enviado')
      setItemSentDialog({ open: false, item: null })
    } catch (err) {
      showBanner(err.message || 'No se pudo marcar el producto como enviado')
      console.error('Error marking item as sent:', err)
    } finally {
      setMarkingItemSent(false)
    }
  }

  // Handle opening order sent dialog
  const openOrderSentDialog = () => {
    setOrderSentDialog(true)
  }

  // Handle confirming order as sent
  const handleMarkOrderSent = async (tracking) => {
    setMarkingOrderSent(true)
    try {
      const data = await ordersAPI.updateOrderStatus(params.id, 'sent', tracking)
      setOrder(data.order)
      showBanner(tracking ? 'Pedido marcado como enviado con seguimiento' : 'Pedido marcado como enviado')
      setOrderSentDialog(false)
    } catch (err) {
      showBanner(err.message || 'No se pudo marcar el pedido como enviado')
      console.error('Error marking order as sent:', err)
    } finally {
      setMarkingOrderSent(false)
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

  const areAllItemsSent = () => {
    if (!order || !order.items || order.items.length === 0) return false
    return order.items.every(item => item.status === 'sent')
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

  const getItemStatusBadge = (status) => {
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
            <div className="flex items-center gap-3">
              {getStatusBadge(order.status)}
              {order.status === 'paid' && !areAllItemsSent() && (
                <Popover className="relative">
                  <PopoverButton className="inline-flex items-center gap-x-1 rounded-md p-1 hover:bg-gray-100">
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
                  </PopoverButton>
                  <PopoverPanel
                    transition
                    className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                  >
                    <button
                      onClick={openOrderSentDialog}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                    >
                      Marcar pedido como enviado o disponible
                    </button>
                  </PopoverPanel>
                </Popover>
              )}
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
                          <div className="flex justify-between items-start text-base font-medium text-gray-900">
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
                                    onClick={() => openTrackingModal(item)}
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                                  >
                                    Proporcionar número de seguimiento
                                  </button>
                                  <button
                                    onClick={() => openItemSentDialog(item)}
                                    disabled={item.status === 'sent'}
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Marcar como enviado o disponible para recogida en tienda
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
                            {item.status && getItemStatusBadge(item.status)}
                          </div>
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

      {/* Modals */}
      <TrackingModal
        open={trackingModal.open}
        onClose={() => {
          setTrackingModal({ open: false, item: null })
          setTrackingNumber('')
        }}
        onSave={handleSaveTracking}
        trackingNumber={trackingNumber}
        setTrackingNumber={setTrackingNumber}
        saving={savingTracking}
        itemName={trackingModal.item?.name}
      />

      <ConfirmationDialog
        open={itemSentDialog.open}
        onClose={() => setItemSentDialog({ open: false, item: null })}
        onConfirm={handleMarkItemSent}
        title="Marcar producto como enviado o disponible para su recogida"
        message={`¿Estás seguro de que quieres marcar "${itemSentDialog.item?.name}" como enviado o disponible para su recogida en tienda?`}
        confirming={markingItemSent}
        withTracking={true}
      />

      <ConfirmationDialog
        open={orderSentDialog}
        onClose={() => setOrderSentDialog(false)}
        onConfirm={handleMarkOrderSent}
        title="Marcar pedido como enviado o disponible para su recogida"
        message="¿Estás seguro de que quieres marcar todo el pedido como enviado o disponible para su recogida en tienda?"
        confirming={markingOrderSent}
        withTracking={true}
      />
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
