'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { EyeIcon, EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

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

function OrdersPageContent() {
  const { showBanner } = useBannerNotification()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter state
  const [filterEmail, setFilterEmail] = useState('')
  const [filterSeller, setFilterSeller] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Order-level status change modal state
  const [statusDialog, setStatusDialog] = useState({ open: false, order: null })
  const [changingStatus, setChangingStatus] = useState(false)

  // Alert menu state
  const [alertMenuOpen, setAlertMenuOpen] = useState(false)
  const [alertLoading, setAlertLoading] = useState(null)
  const alertMenuRef = useRef(null)

  // Pagination state
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)

  // Refs for current filter values (to avoid stale closures in observer)
  const filtersRef = useRef({ email: '', seller: '', date_from: '', date_to: '', status: '' })
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const loadingRef = useRef(true)

  const observerRef = useRef(null)

  useEffect(() => {
    loadOrders(1, false)
  }, [])

  const loadOrders = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) {
      setLoading(true)
      loadingRef.current = true
    } else {
      setLoadingMore(true)
      loadingMoreRef.current = true
    }

    try {
      const params = { page: pageNum, limit: 10 }
      const filters = filtersRef.current
      if (filters.email) params.email = filters.email
      if (filters.seller) params.seller = filters.seller
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to
      if (filters.status) params.status = filters.status

      const data = await adminAPI.orders.getAll(params)

      if (append) {
        setOrders(prev => [...prev, ...data.orders])
      } else {
        setOrders(data.orders)
      }

      setTotal(data.total)
      setPage(pageNum)
      pageRef.current = pageNum

      const newHasMore = (pageNum * 10) < data.total
      setHasMore(newHasMore)
      hasMoreRef.current = newHasMore
    } catch (err) {
      setError('No se pudieron cargar los pedidos')
      console.error('Error loading orders:', err)
    } finally {
      setLoading(false)
      loadingRef.current = false
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [])

  // Callback ref for sentinel — attaches/detaches observer when the element mounts/unmounts
  const sentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current && !loadingRef.current) {
            loadOrders(pageRef.current + 1, true)
          }
        },
        { threshold: 0.1 }
      )
      observerRef.current.observe(node)
    }
  }, [loadOrders])

  const handleFilter = () => {
    filtersRef.current = {
      email: filterEmail,
      seller: filterSeller,
      date_from: filterDateFrom,
      date_to: filterDateTo,
      status: filterStatus,
    }
    setError('')
    loadOrders(1, false)
  }

  const handleClearFilters = () => {
    setFilterEmail('')
    setFilterSeller('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterStatus('')
    filtersRef.current = { email: '', seller: '', date_from: '', date_to: '', status: '' }
    setError('')
    loadOrders(1, false)
  }

  const handleOrderStatusChange = async (newStatus) => {
    if (!statusDialog.order) return
    setChangingStatus(true)
    try {
      await adminAPI.orders.updateOrderStatus(statusDialog.order.id, newStatus)
      showBanner('Estado del pedido actualizado correctamente')
      setStatusDialog({ open: false, order: null })
      loadOrders(1, false)
    } catch (err) {
      showBanner(err.message || 'No se pudo actualizar el estado del pedido')
      console.error('Error changing order status:', err)
    } finally {
      setChangingStatus(false)
    }
  }

  // Close alert menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (alertMenuRef.current && !alertMenuRef.current.contains(event.target)) {
        setAlertMenuOpen(false)
      }
    }
    if (alertMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [alertMenuOpen])

  const handleStaleAlert = async (type) => {
    setAlertLoading(type)
    setAlertMenuOpen(false)
    try {
      const data = type === 'arrived'
        ? await adminAPI.orders.getStaleArrivedAlerts()
        : await adminAPI.orders.getStaleSentAlerts()

      if (data.count > 0) {
        const label = type === 'arrived' ? 'recibido(s)' : 'enviado(s)'
        showBanner(`Se encontraron ${data.count} producto(s) ${label} pendientes. ${data.emailSent ? 'Se ha enviado un email de alerta.' : 'No se pudo enviar el email de alerta.'}`, 'success')
      } else {
        const label = type === 'arrived' ? 'recibidos' : 'enviados'
        showBanner(`No se encontraron productos ${label} pendientes de acción.`, 'info')
      }
    } catch (err) {
      showBanner(err.message || 'Error al comprobar alertas')
      console.error('Error checking stale alerts:', err)
    } finally {
      setAlertLoading(null)
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

  if (loading && orders.length === 0) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando pedidos...</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pedidos</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona todos los pedidos de la plataforma
            </p>
          </div>
          <div className="relative" ref={alertMenuRef}>
            <button
              type="button"
              onClick={() => setAlertMenuOpen(!alertMenuOpen)}
              className="rounded-full p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              disabled={alertLoading !== null}
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </button>
            {alertMenuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-72 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => handleStaleAlert('arrived')}
                    disabled={alertLoading !== null}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {alertLoading === 'arrived' ? 'Comprobando...' : 'Alertas de productos recibidos'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStaleAlert('sent')}
                    disabled={alertLoading !== null}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {alertLoading === 'sent' ? 'Comprobando...' : 'Alertas de productos enviados'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter Form */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="text"
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
                placeholder="Buscar por email..."
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Vendedor</label>
              <input
                type="text"
                value={filterSeller}
                onChange={(e) => setFilterSeller(e.target.value)}
                placeholder="Nombre del vendedor..."
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Desde</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Hasta</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              >
                <option value="">Todos</option>
                <option value="pending_payment">Pendiente de pago</option>
                <option value="paid">Pagado</option>
                <option value="sent">Enviado</option>
                <option value="arrived">Recibido</option>
                <option value="confirmed">Confirmado</option>
                <option value="cancelled">Cancelado</option>
                <option value="reimbursed">Reembolsado</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleFilter}
              className="rounded-md bg-black px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-800"
            >
              Filtrar
            </button>
            <button
              onClick={handleClearFilters}
              className="rounded-md bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
            <span className="ml-auto text-sm text-gray-500">{total} pedido(s)</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {orders.length === 0 && !loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay pedidos disponibles</p>
          </div>
        ) : (
          <div className="relative mt-8 flow-root">
            {/* Loading overlay for filter requests */}
            {loading && orders.length > 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                <div className="flex items-center gap-2 rounded-md bg-white px-4 py-2 shadow-md ring-1 ring-gray-200">
                  <svg className="size-5 animate-spin text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm text-gray-600">Cargando pedidos...</span>
                </div>
              </div>
            )}

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
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => setStatusDialog({ open: true, order })}
                              className="text-gray-900 hover:text-gray-600"
                            >
                              Cambiar estado
                            </button>
                            <Link
                              href={`/admin/pedidos/${order.id}`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sentinel for infinite scroll — outside the overflow container */}
        {orders.length > 0 && (
          <>
            <div ref={sentinelRef} className="h-4" />
            {loadingMore && (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">Cargando más pedidos...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order status change modal */}
      <StatusChangeModal
        open={statusDialog.open}
        onClose={() => setStatusDialog({ open: false, order: null })}
        onConfirm={handleOrderStatusChange}
        confirming={changingStatus}
        title={statusDialog.order ? `Cambiar estado del pedido #${statusDialog.order.id}` : 'Cambiar estado'}
      />
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
