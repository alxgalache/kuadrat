'use client'

import {useState, useEffect, useRef, useCallback} from 'react'
import Link from 'next/link'
import {ordersAPI, sellerAPI, getArtImageUrl, getOthersImageUrl} from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import {
    ArrowDownIcon,
    ArrowUpIcon,
    EyeIcon,
    InformationCircleIcon,
    EllipsisVerticalIcon,
    ExclamationTriangleIcon,
    XMarkIcon
} from '@heroicons/react/20/solid'
import {ChevronDownIcon} from '@heroicons/react/16/solid'
import {Popover, PopoverButton, PopoverPanel, Dialog, DialogBackdrop, DialogPanel, DialogTitle} from '@headlessui/react'
import {useBannerNotification} from '@/contexts/BannerNotificationContext'
import {useAuth} from '@/contexts/AuthContext'
import StripeConnectBanner from '@/components/seller/StripeConnectBanner'

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

// Helper function to format date as YYYY-MM-DD for API
function formatDateForAPI(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// Helper function to get date ranges based on filter
function getDateRanges(filter) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (filter === 'all') {
        return {currentStart: null, previousStart: null, previousEnd: null}
    }

    let currentStart, previousStart, previousEnd

    if (filter === 'week') {
        // Current: from Monday of current week
        const day = today.getDay() // 0 (Sunday) - 6 (Saturday)
        const diffToMonday = day === 0 ? -6 : 1 - day
        currentStart = new Date(today)
        currentStart.setDate(today.getDate() + diffToMonday)

        // Previous: from Monday of previous week to Sunday of previous week (end of day = Monday current week)
        previousStart = new Date(currentStart)
        previousStart.setDate(currentStart.getDate() - 7)
        previousEnd = new Date(currentStart) // Start of current week = end of previous week
    } else if (filter === 'month') {
        // Current: from 1st of current month
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1)

        // Previous: from 1st of previous month to last day of previous month
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        previousEnd = new Date(currentStart) // Start of current month = end of previous month
    } else if (filter === 'year') {
        // Current: from January 1st of current year
        currentStart = new Date(now.getFullYear(), 0, 1)

        // Previous: from January 1st to December 31st of previous year
        previousStart = new Date(now.getFullYear() - 1, 0, 1)
        previousEnd = new Date(currentStart) // Start of current year = end of previous year
    }

    return {
        currentStart: currentStart ? formatDateForAPI(currentStart) : null,
        previousStart: previousStart ? formatDateForAPI(previousStart) : null,
        previousEnd: previousEnd ? formatDateForAPI(previousEnd) : null,
        currentStartDate: currentStart, // Keep Date object for display
    }
}

// Helper function to format the filter date label
function formatFilterDateLabel(date) {
    if (!date) return ''
    const options = {weekday: 'long', day: 'numeric', month: 'short'}
    const formatted = date.toLocaleDateString('es-ES', options)
    // Capitalize first letter
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// Confirmation Dialog Component with optional tracking
function ConfirmationDialog({open, onClose, onConfirm, title, message, confirming, withTracking = false}) {
    const [addTracking, setAddTracking] = useState(false)
    const [trackingUrl, setTrackingUrl] = useState('')
    const [trackingError, setTrackingError] = useState('')

    const validateUrl = (url) => {
        if (!url || url.trim().length === 0) return true
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
                            <div
                                className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:mx-0 sm:size-10">
                                <ExclamationTriangleIcon aria-hidden="true" className="size-6 text-gray-600"/>
                            </div>
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                                <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                                    {title}
                                </DialogTitle>
                                <div className="mt-2">
                                    <p className="text-sm text-gray-500">{message}</p>
                                    <p className="mt-3 text-sm text-gray-500 italic">Se enviará una notificación por
                                        correo electrónico al comprador</p>
                                    {/*<p className="text-sm bg-amber-100 p-4 mt-3 text-gray-500">Dependiendo del método de envío seleccionado por el usuario, se le informará de que</p>*/}
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

function OrdersPageContent() {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState('')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [dateFilter, setDateFilter] = useState('week') // all | week | month | year
    const [sellerStats, setSellerStats] = useState({
        current: {orderCount: 0, sales: 0, withdrawn: 0, pendingIncome: 0},
        changes: null,
    })
    const [loadingStats, setLoadingStats] = useState(false)

    // Wallet state — Change #2 splits the balance into two VAT buckets
    // (art_rebu for REBU art sales, standard_vat for 21% products/services).
    // `walletBalance` is kept as the combined total for the main heading.
    const [walletBalance, setWalletBalance] = useState(0)
    const [walletArtRebu, setWalletArtRebu] = useState(0)
    const [walletStandardVat, setWalletStandardVat] = useState(0)
    const [loadingWallet, setLoadingWallet] = useState(false)

    // Withdrawal modal state — Change #2: the modal is now a single-step
    // "nudge" confirmation. No IBAN or recipient data; the admin receives an
    // email with a link to the payouts panel and the payout is executed from
    // there via Stripe Connect.
    const [withdrawalModal, setWithdrawalModal] = useState({open: false, loading: false, error: '', success: false})
    const observerRef = useRef(null)
    const loadMoreRef = useRef(null)
    // Guard to avoid double fetch in React 18 StrictMode on first mount
    const didInitRef = useRef(false)
    const {showBanner} = useBannerNotification()
    const {user} = useAuth()
    const isSeller = user?.role === 'seller'

    // Mark order as sent confirmation dialog state
    const [orderSentDialog, setOrderSentDialog] = useState({open: false, orderId: null})
    const [markingOrderSent, setMarkingOrderSent] = useState(false)

    // Get current date ranges based on filter
    const dateRanges = getDateRanges(dateFilter)

    // Load wallet balance on mount
    useEffect(() => {
        loadWallet()
    }, [])

    // Load orders/stats when filter changes (guard first mount for StrictMode)
    useEffect(() => {
        // Prevent duplicate call caused by StrictMode double-invoking effects on mount
        if (!didInitRef.current) {
            didInitRef.current = true
            loadOrders(1)
            loadStats()
            return
        }
        // Subsequent genuine filter changes
        loadOrders(1)
        loadStats()
    }, [dateFilter])

    const loadWallet = async () => {
        try {
            setLoadingWallet(true)
            const data = await sellerAPI.getWallet()
            // Change #2: the wallet now has two VAT-regime buckets plus the
            // combined legacy `balance` total (sum of both). Older clients
            // keep working with just `balance`.
            const artRebu = Number(data.balanceArtRebu) || 0
            const standardVat = Number(data.balanceStandardVat) || 0
            setWalletArtRebu(artRebu)
            setWalletStandardVat(standardVat)
            setWalletBalance(Number(data.balance) || (artRebu + standardVat))
        } catch (err) {
            console.error('Error loading wallet:', err)
        } finally {
            setLoadingWallet(false)
        }
    }

    const loadOrders = async (pageNum) => {
        try {
            if (pageNum === 1) {
                setLoading(true)
                setOrders([]) // Clear orders when loading first page
            } else {
                setLoadingMore(true)
            }

            const params = {page: pageNum, limit: 5}
            if (dateRanges.currentStart) {
                params.date = dateRanges.currentStart
            }

            const data = await ordersAPI.getAll(params)

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

    const loadStats = async () => {
        try {
            setLoadingStats(true)
            const params = {}

            if (dateRanges.currentStart) {
                params.date = dateRanges.currentStart
            }
            if (dateRanges.previousStart) {
                params.previousDate = dateRanges.previousStart
            }
            if (dateRanges.previousEnd) {
                params.previousDateTo = dateRanges.previousEnd
            }

            const data = await ordersAPI.getStats(params)
            setSellerStats({
                current: data.stats.current,
                changes: data.stats.changes,
            })
        } catch (err) {
            console.error('Error loading stats:', err)
            // Keep default stats on error
        } finally {
            setLoadingStats(false)
        }
    }

    // Handle opening order sent dialog
    const openOrderSentDialog = (orderId) => {
        setOrderSentDialog({open: true, orderId})
    }

    // Handle confirming order as sent
    const handleMarkOrderSent = async (tracking) => {
        if (!orderSentDialog.orderId) return
        setMarkingOrderSent(true)
        try {
            await ordersAPI.updateOrderStatus(orderSentDialog.orderId, 'sent', tracking)
            showBanner(tracking ? 'Pedido marcado como enviado con seguimiento' : 'Pedido marcado como enviado')
            setOrderSentDialog({open: false, orderId: null})
            // Reload orders to reflect the change
            loadOrders(1)
        } catch (err) {
            showBanner(err.message || 'No se pudo marcar el pedido como enviado')
            console.error('Error marking order as sent:', err)
        } finally {
            setMarkingOrderSent(false)
        }
    }

    // Withdrawal modal handlers — Change #2 (stripe-connect-manual-payouts):
    // a single-step confirmation. The seller nudges the admin by email; the
    // admin executes the payout manually from /admin/payouts. Nothing is
    // debited from the wallet here — buckets only change when the admin
    // executes the payout via Stripe Connect.
    const openWithdrawalModal = () => {
        setWithdrawalModal({
            open: true,
            loading: false,
            error: '',
            success: false,
        })
    }

    const handleWithdrawalSubmit = async () => {
        setWithdrawalModal(prev => ({...prev, loading: true, error: ''}))
        try {
            await sellerAPI.createWithdrawal()
            setWithdrawalModal(prev => ({...prev, loading: false, success: true}))
        } catch (err) {
            setWithdrawalModal(prev => ({
                ...prev,
                loading: false,
                error: err.message || 'No se pudo enviar la solicitud'
            }))
        }
    }

    // Infinite scroll observer - only active when filter is 'all'
    const lastOrderRef = useCallback(
        (node) => {
            if (loading || loadingMore || dateFilter !== 'all') return
            if (observerRef.current) observerRef.current.disconnect()

            observerRef.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    loadOrders(page + 1)
                }
            })

            if (node) observerRef.current.observe(node)
        },
        [loading, loadingMore, hasMore, page, dateFilter]
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

    // Subtotal without shipping: sum of item prices only
    const getSubtotalWithoutShipping = (items) => {
        return items.reduce((sum, item) => sum + (Number(item.price_at_purchase) || 0), 0)
    }

    // Subtotal after commission deduction
    const getSubtotalAfterCommission = (items) => {
        return items.reduce((sum, item) => {
            const price = Number(item.price_at_purchase) || 0
            const commission = Number(item.commission_amount) || 0
            return sum + (price - commission)
        }, 0)
    }

    const getStatusBadge = (status) => {
        const arrivedTooltip =
            'Pendiente de confirmación del comprador. El importe de la venta se añadirá a tu balance cuando el usuario confirme, o después de 5 días si no lo hace'

        const statusConfig = {
            pending_payment: {label: 'Pendiente de pago', class: 'bg-blue-100 text-blue-800'},
            paid: {label: 'Pagado', class: 'bg-amber-100 text-amber-800'},
            sent: {label: 'Enviado', class: 'bg-indigo-100 text-indigo-800'},
            arrived: {label: 'Recibido', class: 'bg-emerald-100 text-emerald-800', showInfo: true},
            confirmed: {label: 'Confirmado', class: 'bg-green-100 text-green-800'},
            cancelled: {label: 'Cancelado', class: 'bg-red-100 text-red-800'},
            reimbursed: {label: 'Reembolsado', class: 'bg-orange-100 text-orange-800'},
        }

        const config = statusConfig[status] || {label: status, class: 'bg-gray-100 text-gray-800'}

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
    const totalWithoutCommission = orders.reduce((sum, order) => sum + getSubtotalWithoutShipping(order.items), 0)

    return (
        // Usamos un fondo gris muy claro para que la tarjeta blanca de stats
        // (bg-white + shadow + bordes redondeados) resalte visualmente, igual que
        // en el ejemplo de Tailwind.
        <div className="bg-white">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

                {/* Stripe Connect banner — Change #1: stripe-connect-accounts */}
                {isSeller && <StripeConnectBanner />}

                {/* Título y subtítulo siempre visibles */}
                <div className="mb-8 mt-8">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Monedero</h1>
                    <p className="mt-2 text-sm text-gray-700">
                        Aquí puedes consultar de forma global los fondos que tienes disponibles para su retirada a tu
                        cuenta.
                    </p>
                    <p className="text-sm text-gray-700">
                        Se aplica una comisión del {process.env.NEXT_PUBLIC_DEALER_COMMISSION_ART || '15'}% en obras de arte y del {process.env.NEXT_PUBLIC_DEALER_COMMISSION_OTHERS || '15'}% en otros productos sobre el total de las transacciones realizadas. Para más información, escribe a <a className="text-black font-bold" href="mailto:info@140d.art">info@140d.art</a>.
                    </p>
                </div>

                <div className="bg-gray-200 shadow-sm sm:rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-base font-semibold text-gray-900">Saldo disponible</h3>
                        <p className="mt-1 text-xs text-gray-600">
                            Tu saldo se divide en dos bolsas según el régimen fiscal aplicable a cada venta.
                        </p>

                        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-md bg-white p-4 shadow-sm">
                                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                                    Arte (REBU)
                                </dt>
                                <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                                    {loadingWallet ? '...' : `${walletArtRebu.toFixed(2)} €`}
                                </dd>
                            </div>
                            <div className="rounded-md bg-white p-4 shadow-sm">
                                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                                    Productos y servicios (21%)
                                </dt>
                                <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                                    {loadingWallet ? '...' : `${walletStandardVat.toFixed(2)} €`}
                                </dd>
                            </div>
                        </dl>

                        <div className="mt-4 flex items-baseline justify-between border-t border-gray-300 pt-3">
                            <span className="text-sm font-medium text-gray-700">Total disponible</span>
                            <span className="text-lg font-bold tabular-nums text-gray-900">
                                {loadingWallet ? '...' : `${walletBalance.toFixed(2)} €`}
                            </span>
                        </div>

                        <p className="mt-4 text-xs text-gray-600">
                            140d Galería de Arte ejecuta los pagos manualmente vía Stripe Connect.
                            Pulsa el botón para notificar a la administración que quieres cobrar tu saldo.
                        </p>

                        <div className="mt-5">
                            <button
                                type="button"
                                onClick={openWithdrawalModal}
                                disabled={walletBalance <= 0}
                                className={classNames(
                                    'inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900',
                                    walletBalance > 0
                                        ? 'bg-black text-white hover:bg-gray-900'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                )}
                            >
                                Solicitar pago a 140d Galería de Arte
                            </button>
                        </div>
                    </div>
                </div>

                {/* Withdrawal Modal — Change #2: single-step nudge to admin */}
                <Dialog open={withdrawalModal.open} onClose={() => !withdrawalModal.loading && setWithdrawalModal(prev => ({...prev, open: false}))} className="relative z-50">
                    <DialogBackdrop className="fixed inset-0 bg-gray-500/75 transition-opacity" />
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                <div className="absolute top-0 right-0 pt-4 pr-4">
                                    <button
                                        type="button"
                                        onClick={() => !withdrawalModal.loading && setWithdrawalModal(prev => ({...prev, open: false}))}
                                        className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                                    >
                                        <XMarkIcon className="size-6" />
                                    </button>
                                </div>

                                {withdrawalModal.success ? (
                                    <div className="text-center py-4">
                                        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 mb-4">
                                            <svg className="size-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        </div>
                                        <DialogTitle className="text-lg font-semibold text-gray-900">Solicitud enviada</DialogTitle>
                                        <p className="mt-2 text-sm text-gray-500">
                                            Hemos notificado a 140d Galería de Arte. Procesarán el pago desde Stripe Connect
                                            y recibirás una confirmación por email cuando se ejecute.
                                        </p>
                                        <div className="mt-6">
                                            <button
                                                type="button"
                                                onClick={() => setWithdrawalModal(prev => ({...prev, open: false}))}
                                                className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <DialogTitle className="text-lg font-semibold text-gray-900">Solicitar pago a 140d Galería de Arte</DialogTitle>
                                        <p className="mt-2 text-sm text-gray-500">
                                            Vas a notificar al equipo de 140d Galería de Arte que quieres cobrar tu saldo
                                            disponible. El pago se realizará vía Stripe Connect a tu cuenta conectada.
                                        </p>
                                        <div className="mt-4 rounded-md bg-gray-50 p-4">
                                            <dl className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <dt className="text-gray-500">Arte (REBU)</dt>
                                                    <dd className="font-medium text-gray-900 tabular-nums">{walletArtRebu.toFixed(2)} €</dd>
                                                </div>
                                                <div className="flex justify-between">
                                                    <dt className="text-gray-500">Productos y servicios (21%)</dt>
                                                    <dd className="font-medium text-gray-900 tabular-nums">{walletStandardVat.toFixed(2)} €</dd>
                                                </div>
                                                <div className="flex justify-between border-t border-gray-200 pt-2">
                                                    <dt className="text-gray-900 font-medium">Total</dt>
                                                    <dd className="font-semibold text-gray-900 tabular-nums">{walletBalance.toFixed(2)} €</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        {withdrawalModal.error && (
                                            <p className="mt-2 text-sm text-red-600">{withdrawalModal.error}</p>
                                        )}
                                        <div className="mt-6 flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setWithdrawalModal(prev => ({...prev, open: false}))}
                                                disabled={withdrawalModal.loading}
                                                className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleWithdrawalSubmit}
                                                disabled={withdrawalModal.loading}
                                                className="inline-flex justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:opacity-50"
                                            >
                                                {withdrawalModal.loading ? 'Enviando...' : 'Enviar solicitud'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </DialogPanel>
                        </div>
                    </div>
                </Dialog>

                {/* Título y subtítulo siempre visibles */}
                <div className="mb-12 mt-12">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestión de pedidos</h1>
                    <p className="mt-2 text-sm text-gray-700">
                        Consulta los pedidos que contienen tus productos
                    </p>
                </div>

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
                                {name: 'Esta semana', value: 'week'},
                                {name: 'Este mes', value: 'month'},
                                {name: 'Este año', value: 'year'},
                                {name: 'Siempre', value: 'all'},
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

                    {/* Date filter label - only shown when filter is not 'all' */}
                    {dateFilter !== 'all' && dateRanges.currentStartDate && (
                        <div className="mt-3 text-right">
                          <span
                              className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-600 ring-1 ring-inset ring-gray-700/10">
                            Mostrando desde el {formatFilterDateLabel(dateRanges.currentStartDate)}
                          </span>
                        </div>
                    )}
                </div>

                {/* Stats de ventas */}
                <div className="mt-6">
                    <dl className="mt-5 grid grid-cols-1 divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm border border-gray-200 md:grid-cols-4 md:divide-x md:divide-y-0">
                        {[
                            {
                                name: 'Número de pedidos',
                                stat: sellerStats.current.orderCount,
                                change: sellerStats.changes?.orderCount?.change || '0%',
                                changeType: sellerStats.changes?.orderCount?.changeType || 'increase',
                                key: 'orderCount',
                                isMoney: false,
                                tooltip: 'Número de pedidos que contienen tus productos en el período seleccionado.',
                            },
                            {
                                name: 'Total de ventas',
                                stat: formatMoney(sellerStats.current.sales),
                                change: sellerStats.changes?.sales?.change || '0%',
                                changeType: sellerStats.changes?.sales?.changeType || 'increase',
                                key: 'sales',
                                isMoney: true,
                                tooltip: 'Importe total de tus ventas tras aplicar la comisión, en el período seleccionado.',
                            },
                            {
                                name: 'Total sin comisión',
                                stat: formatMoney(totalWithoutCommission),
                                change: '',
                                changeType: '',
                                key: 'withdrawn',
                                isMoney: true,
                                tooltip: 'Importe total de tus ventas antes de aplicar la comisión, correspondiente a los pedidos mostrados en la lista inferior.',
                            },
                            {
                                name: 'Pendiente de confirmación',
                                stat: formatMoney(sellerStats.current.pendingIncome),
                                change: sellerStats.changes?.pendingIncome?.change || '0%',
                                changeType: sellerStats.changes?.pendingIncome?.changeType || 'increase',
                                key: 'pendingIncome',
                                isMoney: true,
                                tooltip: 'Importe de pedidos pagados, enviados o recibidos que aún no han sido confirmados por el comprador.',
                            },
                        ].map((item) => (
                            <div key={item.key} className="px-4 py-5 sm:p-6">
                                <dt className="text-base font-normal text-gray-900 flex items-center gap-1.5">
                                    {item.name}
                                    <Popover className="relative">
                                        <PopoverButton className="focus:outline-none">
                                            <InformationCircleIcon className="size-4 text-gray-400 hover:text-gray-600" />
                                        </PopoverButton>
                                        <PopoverPanel
                                            anchor="bottom"
                                            className="z-50 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
                                        >
                                            {item.tooltip}
                                        </PopoverPanel>
                                    </Popover>
                                </dt>
                                <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
                                    <div className="flex items-baseline text-2xl font-semibold text-black">
                                        {item.stat}
                                    </div>

                                    {/* Only show change badge when filter is not 'all' */}
                                    {dateFilter !== 'all' && (() => {
                                        const changeNum = parseFloat(String(item.change).replace('%', '').trim())
                                        const isZeroChange = !Number.isNaN(changeNum) && changeNum === 0
                                        const baseBadge = 'inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-medium md:mt-2 lg:mt-0'
                                        const badgeClass = isZeroChange
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : item.changeType === 'increase'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'

                                        return (
                                            <div className={classNames(badgeClass, baseBadge)}>
                                                {isZeroChange ? (
                                                    <svg
                                                        aria-hidden="true"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                        className="mr-0.5 -ml-1 size-5 shrink-0 self-center text-yellow-500"
                                                    >
                                                        <path
                                                            d="M4 7.5a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z"/>
                                                    </svg>
                                                ) : item.changeType === 'increase' ? (
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
                              {isZeroChange
                                  ? 'Sin cambios'
                                  : item.changeType === 'increase'
                                      ? 'Increased'
                                      : 'Decreased'}{' '}
                                                    by
                            </span>
                                                {item.change}
                                            </div>
                                        )
                                    })()}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {/* Tabla o estado vacío */}
                {!hasOrders ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Aún no se han realizado pedidos</p>
                    </div>
                ) : (
                    <div className="mt-8 flow-root">
                        <div className="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
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
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Fecha
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Productos
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Subtotal
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Recibes
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Envío
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Total
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Estado
                                        </th>
                                        <th scope="col"
                                            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Acciones
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                    {orders.map((order, index) => {
                                        const isLastOrder = index === orders.length - 1
                                        const enableInfiniteScroll = dateFilter === 'all'

                                        return (
                                            <tr key={order.id}
                                                ref={enableInfiniteScroll && isLastOrder ? lastOrderRef : null}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                                                    <Link href={`/orders/${order.id}`}
                                                          className="hover:underline">#{order.id}</Link>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    {formatDate(order.created_at)}
                                                </td>
                                                <td className="px-3 py-4 text-sm text-gray-500">
                                                    <div>{getItemsSummary(order.items)}</div>
                                                    <div
                                                        className="text-xs text-gray-400">{order.items.length} item(s)
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                                    €{getSubtotalWithoutShipping(order.items).toFixed(2)}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                                    €{getSubtotalAfterCommission(order.items).toFixed(2)}
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
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            href={`/orders/${order.id}`}
                                                            className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                                                        >
                                                            <EyeIcon className="h-5 w-5"/>
                                                            Ver
                                                        </Link>
                                                        {order.status === 'paid' && !order.items.every(item => item.status === 'sent') && (
                                                            <Popover className="relative">
                                                                <PopoverButton
                                                                    className="inline-flex items-center gap-x-1 rounded-md p-1 hover:bg-gray-100">
                                                                    <EllipsisVerticalIcon
                                                                        className="h-5 w-5 text-gray-600"
                                                                        aria-hidden="true"/>
                                                                </PopoverButton>
                                                                <PopoverPanel
                                                                    transition
                                                                    className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                                                                >
                                                                    <button
                                                                        onClick={() => openOrderSentDialog(order.id)}
                                                                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                                                                    >
                                                                        Marcar pedido como enviado o disponible
                                                                    </button>
                                                                </PopoverPanel>
                                                            </Popover>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    </tbody>
                                </table>

                                {/* Mobile-friendly stacked layout */}
                                <div className="space-y-4 sm:hidden">
                                    {orders.map((order, index) => {
                                        const isLastOrder = index === orders.length - 1
                                        const enableInfiniteScroll = dateFilter === 'all'

                                        return (
                                            <div
                                                key={order.id}
                                                ref={enableInfiniteScroll && isLastOrder ? lastOrderRef : null}
                                                className="rounded-lg border border-gray-200 bg-white p-4 mx-4 shadow-sm"
                                            >
                                                {/* Header: ID + status */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-sm font-semibold text-gray-900">
                                                        <Link href={`/orders/${order.id}`} className="hover:underline">Pedido
                                                            #{order.id}</Link>
                                                    </div>
                                                    <div className="flex-shrink-0">{getStatusBadge(order.status)}</div>
                                                </div>

                                                {/* Date */}
                                                <div
                                                    className="mt-1 text-xs text-gray-500">{formatDate(order.created_at)}</div>

                                                {/* Products summary */}
                                                <div className="mt-3">
                                                    <p className="text-xs text-gray-500">Productos</p>
                                                    <p className="text-sm text-gray-900">{getItemsSummary(order.items)}</p>
                                                    <p className="mt-0.5 text-xs text-gray-400">{order.items.length} item(s)</p>
                                                </div>

                                                {/* Shipping + subtotal + subtotal after commission + total + actions */}
                                                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                                                    <div>
                                                        <p className="text-xs text-gray-500">Envío</p>
                                                        <p className="font-medium text-gray-900">
                                                            €{getTotalShipping(order.items).toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500">Subtotal sin envío</p>
                                                        <p className="font-medium text-gray-900">
                                                            €{getSubtotalWithoutShipping(order.items).toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500">Recibes</p>
                                                        <p className="font-medium text-gray-900">
                                                            €{getSubtotalAfterCommission(order.items).toFixed(2)}
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
                                                            <EyeIcon className="h-5 w-5"/>
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

            {/* Confirmation Dialog */}
            <ConfirmationDialog
                open={orderSentDialog.open}
                onClose={() => setOrderSentDialog({open: false, orderId: null})}
                onConfirm={handleMarkOrderSent}
                title="Marcar pedido como enviado o disponible para su recogida"
                message="¿Estás seguro de que quieres marcar este pedido como enviado o disponible para su recogida en tienda?"
                confirming={markingOrderSent}
                withTracking={true}
            />
        </div>
    )
}

export default function OrdersPage() {
    return (
        <AuthGuard>
            <OrdersPageContent/>
        </AuthGuard>
    )
}
