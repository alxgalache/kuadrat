'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ordersAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, InformationCircleIcon } from '@heroicons/react/20/solid'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function OrdersPageContent() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [dateFilter, setDateFilter] = useState('all') // all | week | month | year
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

  const getFilteredOrders = () => {
    if (!orders || orders.length === 0) return []

    if (dateFilter === 'all') {
      return orders
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let startDate

    if (dateFilter === 'week') {
      // Desde el lunes de la semana actual hasta ahora
      const day = today.getDay() // 0 (domingo) - 6 (sábado)
      const diffToMonday = day === 0 ? -6 : 1 - day
      startDate = new Date(today)
      startDate.setDate(today.getDate() + diffToMonday)
    } else if (dateFilter === 'month') {
      // Desde el día 1 del mes actual
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (dateFilter === 'year') {
      // Desde el 1 de enero del año actual
      startDate = new Date(now.getFullYear(), 0, 1)
    }

    return orders.filter((order) => {
      if (!order.created_at) return false
      const orderDate = new Date(order.created_at)
      return orderDate >= startDate && orderDate <= now
    })
  }

  const filteredOrders = getFilteredOrders()

  const sellerStats = useMemo(() => {
    const totals = {
      available: 0, // Saldo disponible
      sales: 0, // Total de ventas
      withdrawn: 0, // Total retirado (se implementará más adelante)
      pendingIncome: 0, // Pendiente de ingreso
    }

    filteredOrders.forEach((order) => {
      const total = Number(order.total_price) || 0
      totals.sales += total

      // Saldo disponible: pedidos confirmados
      if (order.status === 'confirmed') {
        totals.available += total
      }

      // Pendiente de ingreso: pedidos pagados/enviados/recibidos pero aún no confirmados
      if (['paid', 'sent', 'arrived'].includes(order.status)) {
        totals.pendingIncome += total
      }

      // Total retirado se dejará en 0 por ahora; se añadirá lógica específica más adelante
    })

    return totals
  }, [filteredOrders])

  const formatMoney = (amount) => `€${amount.toFixed(2)}`

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

  const hasOrders = orders.length > 0

  return (
    // Usamos un fondo gris muy claro para que la tarjeta blanca de stats
    // (bg-white + shadow + bordes redondeados) resalte visualmente, igual que
    // en el ejemplo de Tailwind.
    <div className="bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Filtros y stats solo cuando hay pedidos */}
        {hasOrders && (
          <>
            {/* Filtros de fecha */}
            <div className="mt-8">
              <div className="grid grid-cols-1 sm:hidden">
                {/* En móvil usamos un select para cambiar el filtro */}
                <select
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  aria-label="Filtrar pedidos por fecha"
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-2 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-black"
                >
                  <option value="week">Esta semana</option>
                  <option value="month">Este mes</option>
                  <option value="year">Este año</option>
                  <option value="all">Siempre</option>
                </select>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end fill-gray-500"
                />
              </div>
              <div className="hidden sm:block">
                <nav aria-label="Tabs" className="flex space-x-4">
                  {[
                    { name: 'Esta semana', value: 'week' },
                    { name: 'Este mes', value: 'month' },
                    { name: 'Este año', value: 'year' },
                    { name: 'Siempre', value: 'all' },
                  ].map((tab) => {
                    const current = tab.value === dateFilter
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setDateFilter(tab.value)}
                        className={classNames(
                          current ? 'bg-gray-200 text-black' : 'text-gray-500 hover:text-gray-900',
                          'rounded-md px-3 py-2 text-sm font-medium'
                        )}
                        aria-current={current ? 'page' : undefined}
                      >
                        {tab.name}
                      </button>
                    )
                  })}
                </nav>
              </div>
            </div>

            {/* Stats de ventas (solo visual, sin funcionalidad todavía) */}
            <div className="mt-6">
              <dl className="mt-5 grid grid-cols-1 divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm border border-gray-200 md:grid-cols-4 md:divide-x md:divide-y-0">
                {[
                  {
                    name: 'Saldo disponible',
                    stat: formatMoney(sellerStats.available),
                    previousStat: formatMoney(sellerStats.available),
                    change: '0%',
                    changeType: 'increase',
                  },
                  {
                    name: 'Total de ventas',
                    stat: formatMoney(sellerStats.sales),
                    previousStat: formatMoney(sellerStats.sales),
                    change: '0%',
                    changeType: 'increase',
                  },
                  {
                    name: 'Total retirado',
                    stat: formatMoney(sellerStats.withdrawn),
                    previousStat: formatMoney(sellerStats.withdrawn),
                    change: '0%',
                    changeType: 'increase',
                  },
                  {
                    name: 'Pendiente de ingreso',
                    stat: formatMoney(sellerStats.pendingIncome),
                    previousStat: formatMoney(sellerStats.pendingIncome),
                    change: '0%',
                    changeType: 'decrease',
                  },
                ].map((item) => (
                  <div key={item.name} className="px-4 py-5 sm:p-6">
                    <dt className="text-base font-normal text-gray-900">{item.name}</dt>
                    <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
                      <div className="flex items-baseline text-2xl font-semibold text-black">
                        {item.stat}
                        <span className="ml-2 text-sm font-medium text-gray-500">from {item.previousStat}</span>
                      </div>

                      <div
                        className={classNames(
                          item.changeType === 'increase'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800',
                          'inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium md:mt-2 lg:mt-0'
                        )}
                      >
                        {item.changeType === 'increase' ? (
                          <ArrowUpIcon
                            aria-hidden="true"
                            className="mr-0.5 -ml-1 size-5 shrink-0 self-center text-green-500"
                          />
                        ) : (
                          <ArrowDownIcon
                            aria-hidden="true"
                            className="mr-0.5 -ml-1 size-5 shrink-0 self-center text-red-500"
                          />
                        )}

                        <span className="sr-only">
                          {item.changeType === 'increase' ? 'Increased' : 'Decreased'} by
                        </span>
                        {item.change}
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        {/* Título y subtítulo siempre visibles */}
        <div className="mb-8 mt-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mis Pedidos</h1>
          <p className="mt-2 text-sm text-gray-700">
            Consulta los pedidos que contienen tus productos
          </p>
        </div>

        {/* Tabla o estado vacío */}
        {!hasOrders ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Aún no se han realizado pedidos</p>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                {/* Desktop table layout */}
                <table className="hidden min-w-full divide-y divide-gray-300 sm:table">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0"
                      >
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
                    {filteredOrders.map((order, index) => {
                      const isLastOrder = index === filteredOrders.length - 1
                      const enableInfiniteScroll = dateFilter === 'all'

                      return (
                        <tr key={order.id} ref={enableInfiniteScroll && isLastOrder ? lastOrderRef : null}>
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

                {/* Mobile-friendly stacked layout */}
                <div className="space-y-4 sm:hidden">
                  {filteredOrders.map((order, index) => {
                    const isLastOrder = index === filteredOrders.length - 1
                    const enableInfiniteScroll = dateFilter === 'all'

                    return (
                      <div
                        key={order.id}
                        ref={enableInfiniteScroll && isLastOrder ? lastOrderRef : null}
                        className="rounded-lg border border-gray-200 bg-white p-4 mx-4 shadow-sm"
                      >
                        {/* Header: ID + status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-900">Pedido #{order.id}</div>
                          <div className="flex-shrink-0">{getStatusBadge(order.status)}</div>
                        </div>

                        {/* Date */}
                        <div className="mt-1 text-xs text-gray-500">{formatDate(order.created_at)}</div>

                        {/* Products summary */}
                        <div className="mt-3">
                          <p className="text-xs text-gray-500">Productos</p>
                          <p className="text-sm text-gray-900">{getItemsSummary(order.items)}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{order.items.length} item(s)</p>
                        </div>

                        {/* Shipping + total + actions */}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Envío</p>
                            <p className="font-medium text-gray-900">
                              €{getTotalShipping(order.items).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total</p>
                            <p className="font-medium text-gray-900">€{order.total_price.toFixed(2)}</p>
                          </div>
                          <div className="ml-auto">
                            <Link
                              href={`/orders/${order.id}`}
                              className="inline-flex items-center gap-x-1.5 text-sm font-medium text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {loadingMore && dateFilter === 'all' && (
                  <div className="text-center py-4">
                    <p className="text-gray-500">Cargando más pedidos...</p>
                  </div>
                )}

                {!hasMore && orders.length > 0 && dateFilter === 'all' && (
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
