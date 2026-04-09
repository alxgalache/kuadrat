'use client'

/**
 * Stripe Connect "refresh" page — Change #1: stripe-connect-accounts
 *
 * Destination Stripe sends the artist to when a previously-issued onboarding
 * link expires. The expected behaviour is: generate a fresh link and redirect
 * the user to it immediately so onboarding can continue.
 *
 * Fix 17.2.2 — this route is PUBLIC (no AuthGuard). If the artist lands here
 * without an active session (different device, or JWT expired during the
 * hosted flow) we stash the current URL in sessionStorage and show a login
 * CTA; after a successful login `/autores` will redirect back to resume.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sellerAPI } from '@/lib/api'
import { PUBLIC_BRAND_NAME } from '@/lib/constants'
import { useAuth } from '@/contexts/AuthContext'
import { useNotification } from '@/contexts/NotificationContext'

const RETURN_TO_KEY = 'stripeConnectReturnTo'

export default function StripeConnectRefreshPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { showApiError } = useNotification()
  const [savedForLogin, setSavedForLogin] = useState(false)

  // Stash the current URL so `/autores` can redirect us back after login.
  useEffect(() => {
    if (authLoading) return
    if (user && user.role === 'seller') return
    if (typeof window === 'undefined') return
    try {
      const current = window.location.pathname + window.location.search
      window.sessionStorage.setItem(RETURN_TO_KEY, current)
      setSavedForLogin(true)
    } catch {
      setSavedForLogin(true)
    }
  }, [authLoading, user])

  // Authenticated seller path — generate a fresh link and redirect.
  useEffect(() => {
    if (authLoading) return
    if (!user || user.role !== 'seller') return

    let cancelled = false

    ;(async () => {
      try {
        const res = await sellerAPI.stripeConnect.generateLink()
        const url = res?.data?.url || res?.url
        if (cancelled) return
        if (!url) {
          throw new Error('No se recibió una URL de onboarding')
        }
        window.location.href = url
      } catch (err) {
        if (cancelled) return
        showApiError(err)
        setTimeout(() => router.replace('/orders'), 1500)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, router, showApiError])

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
            Generando un nuevo enlace de onboarding…
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
          Generar nuevo enlace de onboarding
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          Para generar un nuevo enlace y continuar tu onboarding con {PUBLIC_BRAND_NAME},
          inicia sesión con tu cuenta de artista.
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
