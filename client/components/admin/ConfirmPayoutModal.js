'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { adminAPI } from '@/lib/api'
import { useNotification } from '@/contexts/NotificationContext'

/**
 * ConfirmPayoutModal — Change #2: stripe-connect-manual-payouts
 *
 * Two-step flow:
 *   1. `preview` — call /admin/payouts/:sellerId/preview, store { token, summary }
 *   2. `execute` — on confirm, call /admin/payouts/:sellerId/execute with the token
 *
 * While in flight the admin cannot dismiss the dialog and the execute button
 * shows a busy state. Errors are surfaced via the global notification context
 * and keep the user on the modal so they can retry.
 */
export default function ConfirmPayoutModal({
  open,
  onClose,
  sellerId,
  sellerName,
  vatRegime,
  onSuccess,
}) {
  const [phase, setPhase] = useState('loading') // loading → review → executing → done | error
  const [summary, setSummary] = useState(null)
  const [token, setToken] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const { showSuccess, showApiError } = useNotification()

  const regimeLabel = vatRegime === 'art_rebu' ? 'Arte (REBU)' : 'Productos y servicios (21%)'

  useEffect(() => {
    if (!open || !sellerId || !vatRegime) return

    setPhase('loading')
    setSummary(null)
    setToken(null)
    setErrorMessage('')

    const loadPreview = async () => {
      try {
        const data = await adminAPI.payouts.preview(sellerId, { vatRegime })
        setSummary(data.summary)
        setToken(data.token)
        setPhase('review')
      } catch (err) {
        setPhase('error')
        setErrorMessage(err?.message || 'No se pudo generar la previsualización')
      }
    }

    loadPreview()
  }, [open, sellerId, vatRegime])

  const handleExecute = async () => {
    if (!token) return
    setPhase('executing')
    try {
      const data = await adminAPI.payouts.execute(sellerId, {
        vatRegime,
        confirmationToken: token,
      })
      showSuccess('Pago ejecutado', `Withdrawal #${data.withdrawal.id} enviado a Stripe`)
      setPhase('done')
      if (typeof onSuccess === 'function') {
        onSuccess(data.withdrawal)
      }
      // Auto-close after a short pause so the user sees the success flash.
      setTimeout(() => {
        onClose()
      }, 900)
    } catch (err) {
      setPhase('review')
      setErrorMessage(err?.message || 'Error al ejecutar el pago')
      showApiError(err)
    }
  }

  const handleDismiss = () => {
    if (phase === 'executing') return // block dismissal mid-flight
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleDismiss} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl transition-all data-closed:scale-95 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        >
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Confirmar pago a {sellerName}
          </DialogTitle>
          <p className="mt-1 text-sm text-gray-500">
            Régimen: <span className="font-medium text-gray-900">{regimeLabel}</span>
          </p>

          {phase === 'loading' && (
            <div className="mt-6 py-10 text-center text-sm text-gray-500">
              Calculando resumen...
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-6">
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={onClose}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {phase !== 'loading' && phase !== 'error' && summary && (
            <>
              <div className="mt-6 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Items incluidos</span>
                  <span className="font-medium text-gray-900 tabular-nums">{summary.item_count}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Base imponible (de mi comisión)</span>
                  <span className="font-medium text-gray-900 tabular-nums">
                    {summary.taxable_base.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">IVA incluido (de mi comisión) (21%)</span>
                  <span className="font-medium text-gray-900 tabular-nums">
                    {summary.vat_amount.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Comisión a facturar al artista</span>
                  <span className="font-medium text-gray-900 tabular-nums">
                    {(summary.taxable_base + summary.vat_amount).toFixed(2)} €
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Total a transferir</span>
                  <span className="text-lg font-semibold text-gray-900 tabular-nums">
                    {summary.total.toFixed(2)} €
                  </span>
                </div>
              </div>

              {errorMessage && phase === 'review' && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-800">{errorMessage}</p>
                </div>
              )}

              <p className="mt-4 text-xs text-gray-500">
                Al confirmar, se creará una transferencia en Stripe Connect desde el saldo de la
                plataforma hacia la cuenta conectada del artista. Esta operación es definitiva —
                sólo se puede revertir desde el panel de Stripe.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  onClick={handleDismiss}
                  disabled={phase === 'executing'}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                  onClick={handleExecute}
                  disabled={phase === 'executing' || phase === 'done'}
                >
                  {phase === 'executing' ? 'Ejecutando...' : phase === 'done' ? 'Enviado' : 'Ejecutar pago'}
                </button>
              </div>
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
