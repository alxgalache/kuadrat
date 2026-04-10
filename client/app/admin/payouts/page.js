'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { useNotification } from '@/contexts/NotificationContext'
import { EyeIcon } from '@heroicons/react/20/solid'

/**
 * Admin Payouts — listing page
 * ---------------------------------------------------------------------------
 * Change #2: stripe-connect-manual-payouts
 *
 * Shows every seller with a positive balance in at least one VAT bucket
 * (art_rebu or standard_vat). Each row links to the per-seller detail page
 * where the admin previews and executes the payout.
 */

const statusLabel = (status) => {
  switch (status) {
    case 'active':
      return { text: 'Activo', className: 'bg-green-100 text-green-800' }
    case 'pending':
      return { text: 'Pendiente', className: 'bg-amber-100 text-amber-800' }
    case 'restricted':
      return { text: 'Restringido', className: 'bg-red-100 text-red-800' }
    case 'rejected':
      return { text: 'Rechazado', className: 'bg-red-100 text-red-800' }
    case 'not_started':
      return { text: 'Sin iniciar', className: 'bg-gray-100 text-gray-700' }
    default:
      return { text: status || 'Desconocido', className: 'bg-gray-100 text-gray-700' }
  }
}

function AdminPayoutsListContent() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showApiError } = useNotification()

  useEffect(() => {
    const load = async () => {
      try {
        const data = await adminAPI.payouts.listSellersWithBalance()
        setSellers(data.sellers || [])
      } catch (err) {
        setError('No se pudieron cargar los saldos pendientes')
        showApiError(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showApiError])

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando saldos pendientes...</p>
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

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pagos a artistas</h1>
          <p className="mt-2 text-sm text-gray-700">
            Artistas con saldo pendiente de pago. Entra en el detalle para previsualizar y ejecutar
            un payout vía Stripe Connect.
          </p>
        </div>

        {sellers.length === 0 ? (
          <div className="text-center py-16 border border-gray-200 rounded-lg">
            <p className="text-gray-500">No hay artistas con saldo pendiente.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Artista
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Arte (REBU 10%)
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Productos (21%)
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Total
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Cuenta Stripe
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {sellers.map((s) => {
                  const statusInfo = statusLabel(s.stripe_connect_status)
                  const readyToPay =
                    s.stripe_connect_status === 'active' && s.stripe_transfers_capability_active
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{s.full_name || s.email}</div>
                        <div className="text-xs text-gray-500">{s.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm tabular-nums text-gray-900">
                        {s.balance_art_rebu.toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm tabular-nums text-gray-900">
                        {s.balance_standard_vat.toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-gray-900">
                        {s.total_balance.toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.text}
                        </span>
                        {!readyToPay && (
                          <p className="mt-1 text-xs text-amber-700">Onboarding no completado</p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/payouts/${s.id}`}
                          className="inline-flex items-center gap-x-1 text-gray-700 hover:text-black"
                        >
                          <EyeIcon aria-hidden="true" className="size-4" />
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPayoutsPage() {
  return (
    <AuthGuard requireRole="admin">
      <AdminPayoutsListContent />
    </AuthGuard>
  )
}
