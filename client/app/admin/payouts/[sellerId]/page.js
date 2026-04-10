'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ConfirmPayoutModal from '@/components/admin/ConfirmPayoutModal'
import { useNotification } from '@/contexts/NotificationContext'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'

/**
 * Admin Payouts — seller detail page
 * ---------------------------------------------------------------------------
 * Change #2: stripe-connect-manual-payouts
 *
 * Shows the two VAT buckets for a seller (art_rebu + standard_vat) side-by-side.
 * Each bucket has its own "Ejecutar pago" button that opens the
 * ConfirmPayoutModal — preview → execute flow.
 *
 * A history table at the bottom lists all previous withdrawals so the admin
 * can audit what has already been paid, reversed, or failed.
 */

const STATUS_STYLES = {
  completed: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  reversed: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
  // Legacy Change #1 statuses
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
}

const STATUS_LABELS = {
  completed: 'Completado',
  processing: 'En proceso',
  reversed: 'Revertido',
  failed: 'Fallido',
  cancelled: 'Cancelado',
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
}

const regimeLabel = (regime) => {
  if (regime === 'art_rebu') return 'Arte (REBU 10%)'
  if (regime === 'standard_vat') return 'Productos y servicios (21%)'
  return regime || '—'
}

function formatEuro(value) {
  const n = Number(value) || 0
  return `${n.toFixed(2)} €`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function BucketCard({ title, regime, balance, summary, onExecute, canExecute, disabledReason }) {
  const hasItems = summary && summary.item_count > 0

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">{regimeLabel(regime)}</span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Saldo disponible (bucket)</dt>
          <dd className="font-semibold tabular-nums text-gray-900">{formatEuro(balance)}</dd>
        </div>
        {summary && (
          <>
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">Items pendientes</dt>
              <dd className="font-medium tabular-nums text-gray-900">{summary.item_count}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">Base imponible</dt>
              <dd className="font-medium tabular-nums text-gray-900">{formatEuro(summary.taxable_base)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">IVA incluido</dt>
              <dd className="font-medium tabular-nums text-gray-900">{formatEuro(summary.vat_amount)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <dt className="text-sm font-medium text-gray-900">Total a pagar</dt>
              <dd className="text-base font-semibold tabular-nums text-gray-900">{formatEuro(summary.total)}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-6">
        <button
          type="button"
          onClick={onExecute}
          disabled={!canExecute || !hasItems}
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
        >
          {hasItems ? 'Ejecutar pago' : 'Sin items pendientes'}
        </button>
        {!canExecute && disabledReason && (
          <p className="mt-2 text-xs text-amber-700">{disabledReason}</p>
        )}
      </div>
    </section>
  )
}

function AdminPayoutDetailContent({ sellerId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalRegime, setModalRegime] = useState(null)
  const { showApiError } = useNotification()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminAPI.payouts.getSellerDetail(sellerId)
      setData(result)
      setError('')
    } catch (err) {
      setError('No se pudo cargar el detalle del artista')
      showApiError(err)
    } finally {
      setLoading(false)
    }
  }, [sellerId, showApiError])

  useEffect(() => {
    load()
  }, [load])

  const handleModalSuccess = () => {
    // Close the modal first — load() sets loading=true which causes an early
    // return that unmounts the modal.  If the modal remounts while still open,
    // its useEffect fires a new preview call that fails ("no items pending").
    setModalRegime(null)
    load()
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando detalle...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'No hay datos'}</p>
      </div>
    )
  }

  const { seller, balances, pending, history } = data
  const canExecute = seller.stripe_connect_status === 'active' && seller.stripe_transfers_capability_active
  const disabledReason = !canExecute
    ? 'La cuenta de Stripe del artista no está activa. No se pueden ejecutar pagos hasta que complete el onboarding.'
    : ''

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          href="/admin/payouts"
          className="inline-flex items-center gap-x-1 text-sm text-gray-600 hover:text-black"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Volver al listado
        </Link>

        <div className="mt-6 mb-8 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{seller.full_name || seller.email}</h1>
          <p className="mt-1 text-sm text-gray-500">{seller.email}</p>
          {seller.stripe_connect_account_id && (
            <p className="mt-1 text-xs text-gray-400 font-mono">{seller.stripe_connect_account_id}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <BucketCard
            title="Pago de obras (REBU)"
            regime="art_rebu"
            balance={balances.art_rebu}
            summary={pending.art_rebu}
            onExecute={() => setModalRegime('art_rebu')}
            canExecute={canExecute}
            disabledReason={disabledReason}
          />
          <BucketCard
            title="Pago de productos y servicios"
            regime="standard_vat"
            balance={balances.standard_vat}
            summary={pending.standard_vat}
            onExecute={() => setModalRegime('standard_vat')}
            canExecute={canExecute}
            disabledReason={disabledReason}
          />
        </div>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Histórico de pagos</h2>
          {history.length === 0 ? (
            <div className="text-center py-12 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-500">Este artista aún no ha recibido ningún pago.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">#</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Fecha</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Régimen</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Importe</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Estado</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Transfer ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {history.map((w) => {
                    const statusClass = STATUS_STYLES[w.status] || 'bg-gray-100 text-gray-700'
                    const statusText = STATUS_LABELS[w.status] || w.status
                    return (
                      <tr key={w.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">#{w.id}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatDate(w.executed_at || w.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{regimeLabel(w.vat_regime)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm tabular-nums text-right text-gray-900">
                          {formatEuro(w.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>
                            {statusText}
                          </span>
                          {w.failure_reason && (
                            <p className="mt-1 text-xs text-red-700 max-w-xs truncate" title={w.failure_reason}>
                              {w.failure_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500">
                          {w.stripe_transfer_id || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmPayoutModal
        open={!!modalRegime}
        onClose={() => setModalRegime(null)}
        sellerId={Number(sellerId)}
        sellerName={seller.full_name || seller.email}
        vatRegime={modalRegime}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}

export default function AdminPayoutDetailPage({ params }) {
  const { sellerId } = use(params)
  return (
    <AuthGuard requireRole="admin">
      <AdminPayoutDetailContent sellerId={sellerId} />
    </AuthGuard>
  )
}
