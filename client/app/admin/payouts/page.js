'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI, triggerDownload } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { useNotification } from '@/contexts/NotificationContext'
import { EyeIcon } from '@heroicons/react/20/solid'

/**
 * Admin Payouts — listing page
 * ---------------------------------------------------------------------------
 * Change #2: stripe-connect-manual-payouts
 * Change #4: stripe-connect-fiscal-report — range export + summary for gestoría.
 *
 * Shows every seller with a positive balance in at least one VAT bucket
 * (art_rebu or standard_vat). Each row links to the per-seller detail page
 * where the admin previews and executes the payout.
 *
 * The top bar allows exporting a range-wide fiscal report (CSV/JSON) and
 * fetching a quick summary — both scoped to the optional VAT regime.
 */

const MAX_RANGE_DAYS = 366

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

const regimeLabel = (regime) => {
  if (regime === 'art_rebu') return 'Arte (REBU)'
  if (regime === 'standard_vat') return 'Productos y servicios (21%)'
  return regime || '—'
}

function formatEuro(value) {
  const n = Number(value) || 0
  return `${n.toFixed(2)} €`
}

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function firstDayOfYearIso() {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

function diffDaysInclusive(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.floor((b - a) / (24 * 3600 * 1000)) + 1
}

function validateRange(from, to) {
  if (!from || !to) return 'Debes indicar Desde y Hasta.'
  if (to < from) return '`Hasta` debe ser mayor o igual que `Desde`.'
  const days = diffDaysInclusive(from, to)
  if (days == null) return 'Fechas inválidas.'
  if (days > MAX_RANGE_DAYS) return `El rango no puede exceder ${MAX_RANGE_DAYS} días.`
  return null
}

function buildRangeFilename(from, to, ext) {
  return `payouts_${from}_${to}.${ext}`
}

function FiscalExportBar({ onCsv, onJson, onSummary, busy }) {
  const [from, setFrom] = useState(firstDayOfYearIso())
  const [to, setTo] = useState(todayIso())
  const [vatRegime, setVatRegime] = useState('')
  const [error, setError] = useState('')

  const trigger = (fn) => {
    const msg = validateRange(from, to)
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    fn({ from, to, vatRegime: vatRegime || undefined })
  }

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Exportar informe fiscal</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="fiscal-from" className="block text-xs font-medium text-gray-700">Desde</label>
          <input
            id="fiscal-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
        <div>
          <label htmlFor="fiscal-to" className="block text-xs font-medium text-gray-700">Hasta</label>
          <input
            id="fiscal-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
        <div>
          <label htmlFor="fiscal-regime" className="block text-xs font-medium text-gray-700">Régimen</label>
          <select
            id="fiscal-regime"
            value={vatRegime}
            onChange={(e) => setVatRegime(e.target.value)}
            className="mt-1 block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="">Todos</option>
            <option value="art_rebu">Arte (REBU)</option>
            <option value="standard_vat">Productos y servicios (21%)</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => trigger(onCsv)}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => trigger(onJson)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Exportar JSON
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => trigger(onSummary)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Resumen
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  )
}

function SummaryCard({ summary, onClose }) {
  const byRegime = summary?.totals_by_regime || {}
  const byMonth = summary?.totals_by_month || {}
  const months = Object.keys(byMonth).sort()
  const regimes = Object.keys(byRegime)

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Resumen del {summary.range?.from} al {summary.range?.to}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {summary.payout_count} {summary.payout_count === 1 ? 'payout' : 'payouts'} en el rango
            {summary.filters?.vat_regime ? ` · ${regimeLabel(summary.filters.vat_regime)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Totales por régimen
          </h3>
          {regimes.length === 0 ? (
            <p className="text-xs text-gray-500">Sin movimientos.</p>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1 pr-2 font-medium">Régimen</th>
                  <th className="py-1 pr-2 font-medium text-right">N.º</th>
                  <th className="py-1 pr-2 font-medium text-right">Base imp.</th>
                  <th className="py-1 pr-2 font-medium text-right">IVA</th>
                  <th className="py-1 font-medium text-right">Ganancia artista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {regimes.map((k) => {
                  const row = byRegime[k] || {}
                  return (
                    <tr key={k}>
                      <td className="py-1 pr-2 text-gray-800">{regimeLabel(k)}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{row.count || 0}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{formatEuro(row.taxable_base_total)}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{formatEuro(row.vat_amount_total)}</td>
                      <td className="py-1 tabular-nums text-right text-gray-800">{formatEuro(row.seller_earning_total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Totales por mes
          </h3>
          {months.length === 0 ? (
            <p className="text-xs text-gray-500">Sin movimientos.</p>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1 pr-2 font-medium">Mes</th>
                  <th className="py-1 pr-2 font-medium text-right">N.º</th>
                  <th className="py-1 pr-2 font-medium text-right">Base imp.</th>
                  <th className="py-1 pr-2 font-medium text-right">IVA</th>
                  <th className="py-1 font-medium text-right">Ganancia artista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {months.map((k) => {
                  const row = byMonth[k] || {}
                  return (
                    <tr key={k}>
                      <td className="py-1 pr-2 text-gray-800">{k}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{row.count || 0}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{formatEuro(row.taxable_base_total)}</td>
                      <td className="py-1 pr-2 tabular-nums text-right text-gray-800">{formatEuro(row.vat_amount_total)}</td>
                      <td className="py-1 tabular-nums text-right text-gray-800">{formatEuro(row.seller_earning_total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}

function AdminPayoutsListContent() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState(null)
  const { showApiError, showSuccess } = useNotification()

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

  const handleExportCsv = async ({ from, to, vatRegime }) => {
    setBusy(true)
    try {
      const blob = await adminAPI.payouts.exportRangeCsv({ from, to, vatRegime })
      triggerDownload(blob, buildRangeFilename(from, to, 'csv'))
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  const handleExportJson = async ({ from, to, vatRegime }) => {
    setBusy(true)
    try {
      const blob = await adminAPI.payouts.exportRangeJson({ from, to, vatRegime })
      triggerDownload(blob, buildRangeFilename(from, to, 'json'))
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  const handleSummary = async ({ from, to, vatRegime }) => {
    setBusy(true)
    try {
      const data = await adminAPI.payouts.getPayoutsSummary({ from, to, vatRegime })
      setSummary(data)
      showSuccess('Resumen cargado', `Del ${from} al ${to}`)
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

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

        <FiscalExportBar
          onCsv={handleExportCsv}
          onJson={handleExportJson}
          onSummary={handleSummary}
          busy={busy}
        />

        {summary && <SummaryCard summary={summary} onClose={() => setSummary(null)} />}

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
                    Arte (REBU)
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
