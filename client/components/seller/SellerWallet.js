'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { sellerAPI } from '@/lib/api'
import StripeConnectBanner from '@/components/seller/StripeConnectBanner'

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

/**
 * El monedero del vendedor: aviso de Stripe Connect, saldo en sus dos bolsas
 * de régimen fiscal, comisiones aplicables y solicitud de cobro.
 *
 * Vivía dentro de `app/orders/page.js` (seller-kind-artist-speaker). Esa
 * pantalla se alcanza por un menú llamado «Pedidos», mezclaba el dinero con
 * las estadísticas de venta y la lista de pedidos físicos, y por eso ocultarla
 * a un vendedor sin producto —un Ponente— le habría dejado sin ver su saldo y
 * sin poder pedir el cobro de sus eventos.
 *
 * Se monta en UN solo sitio, `/seller/monedero`. Pintarlo también en `/orders`
 * pondría dos botones «Solicitar pago» en la aplicación para la misma acción:
 * el endpoint es idempotente (solo manda un correo al admin), así que no
 * rompería nada, pero el artista no sabría cuál es el bueno.
 */
export default function SellerWallet() {
    // Change #2 splits the balance into two VAT buckets (art_rebu for REBU art
    // sales, standard_vat for 21% products/services). `walletBalance` is kept
    // as the combined total for the main heading.
    const [walletBalance, setWalletBalance] = useState(0)
    const [walletArtRebu, setWalletArtRebu] = useState(0)
    const [walletStandardVat, setWalletStandardVat] = useState(0)
    const [loadingWallet, setLoadingWallet] = useState(false)
    // Per-seller commission rates (whole percentages) returned by the wallet
    // endpoint. Replaces the former NEXT_PUBLIC_DEALER_COMMISSION_* env vars.
    const [commissionRateArt, setCommissionRateArt] = useState(null)
    const [commissionRateOthers, setCommissionRateOthers] = useState(null)
    // Per-seller VAT and the derived art fiscal regime. When the seller's art
    // regime is 'standard_vat' (cooperativa artists at 21%), their art earnings
    // accrue in the standard bucket, which we annotate below.
    const [artVatRegime, setArtVatRegime] = useState('art_rebu')

    // Withdrawal modal state — Change #2: the modal is a single-step "nudge"
    // confirmation. No IBAN or recipient data; the admin receives an email with
    // a link to the payouts panel and executes the payout from there via
    // Stripe Connect.
    const [withdrawalModal, setWithdrawalModal] = useState({open: false, loading: false, error: '', success: false})

    useEffect(() => {
        loadWallet()
    }, [])

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
            if (data.commissionRateArt != null) setCommissionRateArt(Number(data.commissionRateArt))
            if (data.commissionRateOthers != null) setCommissionRateOthers(Number(data.commissionRateOthers))
            if (data.artVatRegime) setArtVatRegime(data.artVatRegime)
        } catch (err) {
            console.error('Error loading wallet:', err)
        } finally {
            setLoadingWallet(false)
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

    return (
        <div className="bg-white">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <StripeConnectBanner />

            {/* Título y subtítulo siempre visibles */}
            <div className="mb-8 mt-8">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Monedero</h1>
                <p className="mt-2 text-sm text-gray-700">
                    Aquí puedes consultar de forma global los fondos que tienes disponibles para su retirada a tu
                    cuenta.
                </p>
                <p className="text-sm text-gray-700">
                    Se aplica una comisión del {commissionRateArt != null ? commissionRateArt : '—'}% en obras de arte y del {commissionRateOthers != null ? commissionRateOthers : '—'}% en otros productos sobre el total de las transacciones realizadas. Para más información, escribe a <a className="text-black font-bold" href="mailto:info@140d.art">info@140d.art</a>.
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
                            {artVatRegime === 'standard_vat' && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Incluye tus obras de arte (IVA 21%)
                                </p>
                            )}
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
                                                <dt className="text-gray-500">
                                                    Productos y servicios (21%)
                                                    {artVatRegime === 'standard_vat' && (
                                                        <span className="block text-xs text-gray-400">Incluye tus obras de arte (IVA 21%)</span>
                                                    )}
                                                </dt>
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
            </div>
        </div>
    )
}
