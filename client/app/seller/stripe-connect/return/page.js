'use client'

/**
 * Stripe Connect "return" page — Change #1: stripe-connect-accounts
 *
 * Destination Stripe sends the artist to after completing (or cancelling)
 * the hosted onboarding flow. The authoritative state update happens in
 * the webhook, so this page just:
 *   1) Forces a status re-sync (GET /seller/stripe-connect/status)
 *   2) Reads the resulting status
 *   3) Redirects to /orders (the seller wallet view) with a contextual toast
 *
 * Fix 17.2.1 — this route is PUBLIC (no AuthGuard). Stripe may redirect the
 * artist here in a browser without an active session (different device, or
 * JWT expired while they were in Stripe's hosted flow). When that happens we
 * save the current URL (including `?account=acct_xxx`) to sessionStorage and
 * surface a clear CTA to log in; after a successful login `/autores` will
 * read back that key and redirect the user here to resume the flow.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sellerAPI } from '@/lib/api'
import { PUBLIC_BRAND_NAME } from '@/lib/constants'
import { useAuth } from '@/contexts/AuthContext'
import { useNotification } from '@/contexts/NotificationContext'

const RETURN_TO_KEY = 'stripeConnectReturnTo'

export default function StripeConnectReturnPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showSuccess, showWarning, showError } = useNotification()
  const [savedForLogin, setSavedForLogin] = useState(false)

  // Stash the current URL so `/autores` can redirect us back after login.
  // Only runs when we know there is no seller session (authLoading === false
  // AND no seller user). Never touches sessionStorage on the server.
  useEffect(() => {
    if (authLoading) return
    if (user && user.role === 'seller') return
    if (typeof window === 'undefined') return
    try {
      const current = window.location.pathname + window.location.search
      window.sessionStorage.setItem(RETURN_TO_KEY, current)
      setSavedForLogin(true)
    } catch {
      // sessionStorage might be blocked; the login CTA still works, it just
      // won't bounce the user back here automatically.
      setSavedForLogin(true)
    }
  }, [authLoading, user])

  // Authenticated seller path — run the normal sync + redirect flow.
  useEffect(() => {
    if (authLoading) return
    if (!user || user.role !== 'seller') return

    let cancelled = false

    ;(async () => {
      try {
        const res = await sellerAPI.stripeConnect.getStatus()
        const status = res?.data?.stripe_connect_status || res?.stripe_connect_status || 'pending'

        if (cancelled) return

        if (status === 'active') {
          showSuccess('Cuenta conectada', 'Tu cuenta de pagos está activa y puedes recibir transferencias.')
        } else if (status === 'pending') {
          showWarning(
            'Procesando',
            'Estamos procesando tus datos. Esto puede tardar unos minutos.'
          )
        } else if (status === 'restricted') {
          showWarning(
            'Datos pendientes',
            'Hay datos pendientes. Revisa el banner en tu monedero.'
          )
        } else if (status === 'rejected') {
          showError(
            'Cuenta rechazada',
            `Tu cuenta ha sido rechazada. Contacta con ${PUBLIC_BRAND_NAME}.`
          )
        }
      } catch {
        if (cancelled) return
        showWarning(
          'Procesando',
          'Estamos actualizando el estado de tu cuenta. Esto puede tardar unos minutos.'
        )
      } finally {
        if (!cancelled) {
          setTimeout(() => router.replace('/orders'), 1200)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, router, showSuccess, showWarning, showError])

  // Render states ──────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-white px-4">
        <div className="text-center">
          <div className="inline-block size-10 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="mt-4 text-sm text-gray-700">Cargando…</p>
        </div>
      </div>
    )
  }

  if (user && user.role === 'seller') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-white px-4">
        <div className="text-center">
          <div className="inline-block size-10 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
          <p className="mt-4 text-sm text-gray-700">
            Actualizando el estado de tu cuenta…
          </p>
        </div>
      </div>
    )
  }

  // Public fallback: no seller session.
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-gray-900">
          Gracias por completar la información
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          Tu cuenta de pagos con {PUBLIC_BRAND_NAME} se está procesando. Para ver
          el estado o continuar, inicia sesión con tu cuenta de artista.
        </p>
        <button
          type="button"
          onClick={() => router.push('/autores')}
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900"
        >
          Iniciar sesión
        </button>
        {savedForLogin && (
          <p className="mt-3 text-xs text-gray-500">
            Te traeremos de vuelta aquí automáticamente tras iniciar sesión.
          </p>
        )}
      </div>
    </div>
  )
}
