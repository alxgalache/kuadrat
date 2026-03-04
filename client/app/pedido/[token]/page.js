'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import { ArrowLeftIcon, InformationCircleIcon, MapPinIcon, DocumentTextIcon, EllipsisVerticalIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { SafeProductDescription } from '@/components/SafeHTML'

function StatusTimeline({ status }) {
  const steps = useMemo(() => {
    const mapping = [
      { key: 'pending_payment', label: 'Pendiente de pago' },
      { key: 'paid', label: 'Pagado' },
      { key: 'sent', label: 'Enviado' },
      { key: 'arrived', label: 'Recibido' },
      { key: 'confirmed', label: 'Confirmado' },
    ]
    const idx = mapping.findIndex((s) => s.key === status)
    const reached = idx === -1 ? 0 : idx
    return mapping.map((step, i) => ({ ...step, done: i <= reached }))
  }, [status])

  return (
    <ol className="space-y-2">
      {steps.map((step, idx) => (
        <li key={step.key} className="flex items-start gap-3">
          <div
            className={`mt-1 h-2.5 w-2.5 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-gray-300'}`}
          />
          <div className="text-sm">
            <p className={`font-medium ${step.done ? 'text-gray-900' : 'text-gray-500'}`}>{step.label}</p>
            {idx === 2 && !step.done && (
              <p className="text-xs text-gray-400">Seguimiento disponible cuando el envío se procese.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function ContactModal({ open, onClose, onSend, sellerName, itemName, sending, message, setMessage }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">Contactar con el vendedor</DialogTitle>
          <p className="mt-2 text-sm text-gray-600">
            Enviaremos tu mensaje al vendedor {sellerName || ''} sobre "{itemName || 'este producto'}".
          </p>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Mensaje</label>
            <textarea
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hola, me gustaría saber..."
              disabled={sending}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            <i>Recibirás respuesta en el email o teléfono que indicaste al realizar el pedido.</i>
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onClose}
              disabled={sending}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
              onClick={onSend}
              disabled={sending || !message.trim()}
            >
              {sending ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

function ReceivedConfirmationDialog({ open, onClose, onConfirm, title, message, confirming }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-10">
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
                  <p className="mt-3 text-sm text-gray-500 italic">Se enviará una notificación por correo electrónico al vendedor</p>
                </div>
              </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:opacity-60 sm:ml-3 sm:w-auto"
              >
                {confirming ? 'Procesando...' : 'Confirmar'}
              </button>
              <button
                type="button"
                data-autofocus
                onClick={onClose}
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

function ConfirmReceptionDialog({ open, onClose, onConfirm, title, message, confirming }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-10">
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

                  <div className="mt-4 space-y-3">
                    <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-md p-3">
                      <p className="text-sm text-amber-800">
                        <strong>Importante:</strong> Al confirmar la recepción, declaras que el producto ha llegado en buen estado. No podrás reclamar por daños o defectos después de esta confirmación.
                      </p>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-md p-3">
                      <p className="text-sm text-blue-800">
                        Si no confirmas ni reportas incidencias, el producto se marcará automáticamente como confirmado transcurridos 10 días desde su recepción.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:opacity-60 sm:ml-3 sm:w-auto"
              >
                {confirming ? 'Procesando...' : 'Confirmar recepción'}
              </button>
              <button
                type="button"
                data-autofocus
                onClick={onClose}
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

function PublicOrderContent() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { showBanner } = useBannerNotification()

  const [contactModal, setContactModal] = useState({ open: false, sellerId: null, sellerName: '', itemName: '' })
  const [contactMessage, setContactMessage] = useState('')
  const [contactSending, setContactSending] = useState(false)

  // Buyer status update state
  const [receivedDialog, setReceivedDialog] = useState({ open: false, item: null, isOrderLevel: false })
  const [markingReceived, setMarkingReceived] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, item: null, isOrderLevel: false })
  const [markingConfirmed, setMarkingConfirmed] = useState(false)

  useEffect(() => {
    if (params.token) {
      loadOrder()
    }
  }, [params.token])

  const loadOrder = async () => {
    try {
      const data = await ordersAPI.getByTokenPublic(params.token)
      setOrder(data.order)
    } catch (err) {
      if (err.status === 404) {
        router.push('/404')
        return
      }
      setError(err.message || 'No se pudo cargar el pedido')
      console.error('Error loading public order:', err)
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
    return item.product_type === 'art' ? getArtImageUrl(item.basename) : getOthersImageUrl(item.basename)
  }

  const getStatusBadge = (status) => {
    const arrivedTooltip =
      'Pendiente de confirmación del comprador. El importe de la venta se añadirá a tu balance cuando el usuario confirme, o después de 5 días si no lo hace'

    const statusConfig = {
      pending_payment: { label: 'Pendiente de pago', class: 'bg-blue-100 text-blue-800' },
      pending: { label: 'Pendiente', class: 'bg-blue-100 text-blue-800' },
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
          <InformationCircleIcon className="h-4 w-4 text-gray-400" aria-hidden="true" title={arrivedTooltip} />
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

  const getSubtotal = () => order.items.reduce((sum, item) => sum + item.price_at_purchase, 0)
  const getTotalShipping = () => order.items.reduce((sum, item) => sum + (item.shipping_cost || 0), 0)
  const getGrandTotal = () => getSubtotal() + getTotalShipping()

  const areAllItemsSent = () => {
    if (!order || !order.items || order.items.length === 0) return false
    return order.items.every(item => item.status === 'sent')
  }

  const areAllItemsArrived = () => {
    if (!order || !order.items || order.items.length === 0) return false
    return order.items.every(item => item.status === 'arrived')
  }

  const hasAnyDeliveryAddress = () => {
    const fields = ['address_line_1', 'address_line_2', 'postal_code', 'city', 'province', 'country']
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

  const getPickupAddressLines = (item) => {
    const address = item.seller_pickup_address || ''
    const pc = item.seller_pickup_postal_code || ''
    const city = item.seller_pickup_city || ''
    const country = item.seller_pickup_country || ''

    const lines = []
    if (address) lines.push(address)
    const cityLine = [pc, city].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
    if (country) lines.push(country)
    return lines
  }

  const hasPickupAddress = (item) => {
    return !!(item.seller_pickup_address || item.seller_pickup_city || item.seller_pickup_postal_code || item.seller_pickup_country)
  }

  const openContact = (item) => {
    setContactModal({
      open: true,
      sellerId: item.seller_id,
      sellerName: item.seller_name,
      itemName: item.name,
    })
    setContactMessage('')
  }

  const handleSendContact = async () => {
    if (!contactModal.sellerId) return
    setContactSending(true)
    try {
      await ordersAPI.contactSellerPublic({
        token: params.token,
        sellerId: contactModal.sellerId,
        message: contactMessage,
      })
      showBanner('Mensaje enviado correctamente.')
    } catch (err) {
      showBanner(err.message || 'No se pudo enviar el mensaje')
      console.error('Error sending contact message:', err)
    } finally {
      setContactSending(false)
      setContactModal({ open: false, sellerId: null, sellerName: '', itemName: '' })
      setContactMessage('')
    }
  }

  // Handle marking item or order as received
  const handleMarkReceived = async () => {
    setMarkingReceived(true)
    try {
      let data
      if (receivedDialog.isOrderLevel) {
        data = await ordersAPI.updateOrderStatusPublic(params.token, 'arrived')
      } else {
        data = await ordersAPI.updateItemStatusPublic(
          params.token,
          receivedDialog.item.id,
          'arrived',
          receivedDialog.item.product_type
        )
      }
      setOrder(data.order)
      showBanner(receivedDialog.isOrderLevel ? 'Pedido marcado como recibido' : 'Producto marcado como recibido')
      setReceivedDialog({ open: false, item: null, isOrderLevel: false })
    } catch (err) {
      showBanner(err.message || 'No se pudo marcar como recibido')
      console.error('Error marking as received:', err)
    } finally {
      setMarkingReceived(false)
    }
  }

  // Handle confirming item or order reception
  const handleConfirmReception = async () => {
    setMarkingConfirmed(true)
    try {
      let data
      if (confirmDialog.isOrderLevel) {
        data = await ordersAPI.updateOrderStatusPublic(params.token, 'confirmed')
      } else {
        data = await ordersAPI.updateItemStatusPublic(
          params.token,
          confirmDialog.item.id,
          'confirmed',
          confirmDialog.item.product_type
        )
      }
      setOrder(data.order)
      showBanner(confirmDialog.isOrderLevel ? 'Recepción del pedido confirmada' : 'Recepción del producto confirmada')
      setConfirmDialog({ open: false, item: null, isOrderLevel: false })
    } catch (err) {
      showBanner(err.message || 'No se pudo confirmar la recepción')
      console.error('Error confirming reception:', err)
    } finally {
      setMarkingConfirmed(false)
    }
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
          <Link href="/" className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8">
            <ArrowLeftIcon className="h-5 w-5" />
            Volver
          </Link>
          <p className="text-red-500 mt-4">{error}</p>
        </div>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8">
          <ArrowLeftIcon className="h-5 w-5" />
          Volver al inicio
        </Link>

        {/* Order header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pedido #{order.id}</h1>
              <p className="mt-2 text-sm text-gray-500">Realizado el {formatDate(order.created_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(order.status)}
              {(areAllItemsSent() || areAllItemsArrived()) && (
                <Popover className="relative">
                  <PopoverButton className="inline-flex items-center gap-x-1 rounded-md p-1 hover:bg-gray-100">
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
                  </PopoverButton>
                  <PopoverPanel
                    transition
                    className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                  >
                    {areAllItemsSent() && (
                      <button
                        onClick={() => setReceivedDialog({ open: true, item: null, isOrderLevel: true })}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                      >
                        Marcar pedido como recibido
                      </button>
                    )}
                    {areAllItemsArrived() && (
                      <button
                        onClick={() => setConfirmDialog({ open: true, item: null, isOrderLevel: true })}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                      >
                        Confirmar recepción del pedido
                      </button>
                    )}
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
                <h2 className="text-lg font-medium text-gray-900 mb-4">Productos del pedido</h2>
                <ul role="list" className="divide-y divide-gray-200">
                  {order.items.map((item, index) => (
                    <li key={index} className="py-6 flex">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-gray-200 relative">
                        <Image src={getImageUrl(item)} alt={item.name} fill className="object-cover" sizes="96px" />
                      </div>

                      <div className="ml-4 flex flex-1 flex-col">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 text-base font-medium text-gray-900">
                              <h3>{item.name}</h3>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                              Tipo: {item.product_type === 'art' ? item.type : 'Otro'}
                              {item.variant_key && ` · ${item.variant_key}`}
                            </p>
                            {item.status && getItemStatusBadge(item.status)}
                            {item.seller_name && (
                              <p className="mt-1 text-sm text-gray-500">Vendedor: {item.seller_name}</p>
                            )}
                          </div>
                          <div className="ml-4 flex items-center gap-2">
                            <p className="text-base font-medium text-gray-900">€{item.price_at_purchase.toFixed(2)}</p>
                            {(item.status === 'sent' || item.status === 'arrived') && (
                              <Popover className="relative">
                                <PopoverButton className="inline-flex items-center gap-x-1 rounded-md p-1 hover:bg-gray-100">
                                  <EllipsisVerticalIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
                                </PopoverButton>
                                <PopoverPanel
                                  transition
                                  className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                                >
                                  {item.status === 'sent' && (
                                    <button
                                      onClick={() => setReceivedDialog({ open: true, item, isOrderLevel: false })}
                                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                                    >
                                      Marcar como recibido
                                    </button>
                                  )}
                                  {item.status === 'arrived' && (
                                    <button
                                      onClick={() => setConfirmDialog({ open: true, item, isOrderLevel: false })}
                                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                                    >
                                      Confirmar recepción
                                    </button>
                                  )}
                                </PopoverPanel>
                              </Popover>
                            )}
                          </div>
                        </div>

                        {item.shipping_method_name && (
                          <div className="mt-2 text-sm text-gray-600">
                            <p className="font-medium">Envío:</p>
                            <p>
                              {item.shipping_method_name}
                              {item.shipping_method_type === 'pickup' && ' (Recogida)'}{' '}
                              · €{(item.shipping_cost || 0).toFixed(2)}
                            </p>
                            {item.tracking && (
                              <p className="mt-1 text-sm text-gray-700">
                                Seguimiento: <a href={item.tracking} target="_blank" rel="noopener noreferrer"
                                                className="font-medium text-blue-600 hover:text-blue-800 underline">{item.tracking}</a>
                              </p>
                            )}
                          </div>
                        )}

                        {item.shipping_method_type === 'pickup' && (
                          <div className="mt-3 rounded-md bg-gray-50 px-3 py-3 border border-gray-200">
                            <div className="flex items-start gap-2">
                              <MapPinIcon className="h-5 w-5 text-gray-600 mt-0.5 shrink-0" aria-hidden="true" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">Información de recogida</p>
                                {hasPickupAddress(item) ? (
                                  <div className="mt-1 space-y-0.5">
                                    {getPickupAddressLines(item).map((line, idx) => (
                                      <p key={idx} className="text-sm text-gray-800">
                                        {line}
                                      </p>
                                    ))}
                                    {item.seller_pickup_instructions && (
                                      <p className="mt-2 text-sm text-gray-800">{item.seller_pickup_instructions}</p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="mt-1 text-sm text-gray-800">
                                    Información no disponible. Por favor contacta con el vendedor.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {item.description && (
                          <SafeProductDescription html={item.description} className="mt-2 text-sm text-gray-500 line-clamp-2" />
                        )}

                        <div className="mt-3">
                          <button
                            type="button"
                            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            onClick={() => openContact(item)}
                          >
                            Contactar con el vendedor
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Sidebar - Order summary */}
          <div className="lg:col-span-1">
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Estado del pedido</h2>
                <StatusTimeline status={order.status} />
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-300 shadow-sm overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Resumen</h2>
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
                    <dd className="text-gray-900">€{getGrandTotal().toFixed(2)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContactModal
        open={contactModal.open}
        onClose={() => setContactModal({ open: false, sellerId: null, sellerName: '', itemName: '' })}
        onSend={handleSendContact}
        sellerName={contactModal.sellerName}
        itemName={contactModal.itemName}
        sending={contactSending}
        message={contactMessage}
        setMessage={setContactMessage}
      />

      <ReceivedConfirmationDialog
        open={receivedDialog.open}
        onClose={() => setReceivedDialog({ open: false, item: null, isOrderLevel: false })}
        onConfirm={handleMarkReceived}
        title={receivedDialog.isOrderLevel ? 'Marcar pedido como recibido' : 'Marcar producto como recibido'}
        message={receivedDialog.isOrderLevel
          ? '¿Confirmas que has recibido todos los productos de este pedido?'
          : `¿Confirmas que has recibido "${receivedDialog.item?.name || 'este producto'}"?`
        }
        confirming={markingReceived}
      />

      <ConfirmReceptionDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, item: null, isOrderLevel: false })}
        onConfirm={handleConfirmReception}
        title={confirmDialog.isOrderLevel ? 'Confirmar recepción del pedido' : 'Confirmar recepción del producto'}
        message={confirmDialog.isOrderLevel
          ? '¿Confirmas que todos los productos del pedido han llegado en buen estado?'
          : `¿Confirmas que "${confirmDialog.item?.name || 'este producto'}" ha llegado en buen estado?`
        }
        confirming={markingConfirmed}
      />
    </div>
  )
}

export default function PublicOrderPage() {
  return <PublicOrderContent />
}
