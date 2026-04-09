'use client'

/**
 * StripeConnectBanner — Change #1: stripe-connect-accounts
 *
 * Surfaced on the seller dashboard (wallet view). Tells the artist the current
 * state of their connected account and exposes the action required to make
 * progress on onboarding.
 *
 * BRANDING: all user-facing copy must say "140d Galería de Arte"
 * (PUBLIC_BRAND_NAME). Never "Kuadrat".
 */
import { useCallback, useEffect, useState } from 'react'
import { sellerAPI } from '@/lib/api'
import { PUBLIC_BRAND_NAME } from '@/lib/constants'
import { useNotification } from '@/contexts/NotificationContext'
import { ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

function parseRequirements(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function StripeConnectBanner() {
  const { showApiError } = useNotification()
  const [state, setState] = useState(null) // { stripe_connect_status, stripe_connect_requirements_due, ... }
  const [loading, setLoading] = useState(true)
  const [continuing, setContinuing] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sellerAPI.stripeConnect.getStatus()
      setState(res?.data || res || null)
    } catch (err) {
      // Silently fall back to not_started — the banner simply hides progress
      // actions if we can't fetch. Do NOT surface an error toast here; the
      // dashboard should remain usable.
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function handleContinueOnboarding() {
    setContinuing(true)
    try {
      const res = await sellerAPI.stripeConnect.generateLink()
      const url = res?.data?.url || res?.url
      if (url) {
        window.location.href = url
      } else {
        throw new Error('No se recibió una URL de onboarding')
      }
    } catch (err) {
      showApiError(err)
      setContinuing(false)
    }
  }

  if (loading) return null
  if (!state) return null

  const status = state.stripe_connect_status || 'not_started'
  const requirements = parseRequirements(state.stripe_connect_requirements_due)

  if (status === 'not_started') {
    return (
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-100 p-4">
        <div className="flex items-start gap-3">
          <InformationCircleIcon className="size-5 shrink-0 text-gray-500" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">Cuenta de pagos no creada</h3>
            <p className="mt-1 text-sm text-gray-700">
              Aún no hemos creado tu cuenta de pagos. Contacta con {PUBLIC_BRAND_NAME} para empezar.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-amber-900">Completa tu cuenta de pagos</h3>
            <p className="mt-1 text-sm text-amber-800">
              Necesitamos algunos datos antes de poder enviarte transferencias de {PUBLIC_BRAND_NAME}.
            </p>
            <button
              type="button"
              onClick={handleContinueOnboarding}
              disabled={continuing}
              className="mt-3 inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {continuing ? 'Generando enlace…' : 'Continuar onboarding'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'restricted') {
    return (
      <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="size-5 shrink-0 text-orange-600" aria-hidden="true" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-orange-900">Hay datos pendientes en tu cuenta de pagos</h3>
            <p className="mt-1 text-sm text-orange-800">
              {PUBLIC_BRAND_NAME} no puede enviarte transferencias hasta que completes la siguiente información:
            </p>
            {requirements.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-orange-800 space-y-0.5">
                {requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={handleContinueOnboarding}
              disabled={continuing}
              className="mt-3 inline-flex items-center justify-center rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {continuing ? 'Generando enlace…' : 'Completar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'active') {
    return (
      <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="size-5 shrink-0 text-green-600" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-medium text-green-900">Cuenta de pagos conectada</h3>
            <p className="mt-1 text-sm text-green-800">
              Puedes recibir transferencias de {PUBLIC_BRAND_NAME}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="size-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-medium text-red-900">Cuenta de pagos rechazada</h3>
            <p className="mt-1 text-sm text-red-800">
              Tu cuenta ha sido rechazada por Stripe. Contacta con {PUBLIC_BRAND_NAME}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
