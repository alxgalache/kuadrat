'use client'

import { useState, useEffect, useRef } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { eventsAPI } from '@/lib/api'
import { detectInAppBrowser, externalBrowserUrl, openInExternalBrowser } from '@/lib/inAppBrowser'
import {
  EVENT_VERIFICATION_COPY as COPY,
  IDENTITY_PROVIDER_CARDS,
  IN_APP_BROWSER_COPY,
  IN_APP_BROWSER_APPS,
} from '@/lib/constants'

const ESCAPE_CHECK_MS = 2000

/**
 * «Elige cómo confirmar tu email» (event-identity-provider-verification):
 * una tarjeta por proveedor activo (Google, Microsoft) y siempre la del código
 * por email, el texto informativo y la casilla de aceptación, que vale para
 * los tres métodos.
 *
 * Las tarjetas de proveedor navegan la página entera a la URL de inicio de la
 * API: sin popups ni SDK. Dentro del navegador interno de una app, la de
 * Google abre esa URL en el navegador real (client/lib/inAppBrowser.js),
 * porque Google bloquea su inicio de sesión en las vistas web. Si a los 2 s la
 * página sigue visible, la app no dejó salir: instrucciones y «Copiar enlace».
 *
 * Marca: colores y logotipos de las guías de Google y Microsoft (tema claro),
 * todas las tarjetas del mismo tamaño y peso. No se cambian sin releerlas.
 */
export default function EventVerificationMethods({
  event,
  providers,
  termsAccepted,
  onTermsAcceptedChange,
  onSelectEmail,
  error,
  onError,
}) {
  const [pendingProvider, setPendingProvider] = useState(null)
  const [inApp, setInApp] = useState(null)
  // null | 'opening' | 'left' | 'instructions'
  const [escape, setEscape] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showCopyFallback, setShowCopyFallback] = useState(false)
  const cleanupEscapeRef = useRef(null)

  // El user agent solo existe en el navegador.
  useEffect(() => {
    setInApp(detectInAppBrowser(navigator.userAgent))
  }, [])

  // Volver atrás desde Google o Microsoft restaura la página de la caché del
  // navegador con «Redirigiendo…» congelado: se desbloquean las tarjetas.
  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        setPendingProvider(null)
        setEscape(null)
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  useEffect(() => () => cleanupEscapeRef.current?.(), [])

  const loadingProviders = providers === null
  const activeProviders = (providers || []).filter((p) => IDENTITY_PROVIDER_CARDS[p])
  const busy = pendingProvider !== null || escape === 'opening'

  const accessLink = () => `${window.location.origin}/live/${event.slug}#acceder`

  // Vigila si la app abrió el navegador: la página pasa a oculta (o pierde el
  // foco). iOS no avisa de otra manera.
  const watchEscape = () => {
    cleanupEscapeRef.current?.()
    let left = false
    const markLeft = () => { left = true }
    const onVisibility = () => { if (document.visibilityState === 'hidden') left = true }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', markLeft)
    window.addEventListener('blur', markLeft)
    const timer = setTimeout(() => {
      setEscape(left ? 'left' : 'instructions')
      cleanup()
    }, ESCAPE_CHECK_MS)
    function cleanup() {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markLeft)
      window.removeEventListener('blur', markLeft)
      cleanupEscapeRef.current = null
    }
    cleanupEscapeRef.current = cleanup
  }

  const requireTerms = () => {
    if (!termsAccepted) {
      onError(COPY.termsRequired)
      return false
    }
    onError('')
    return true
  }

  const handleProvider = (provider) => {
    if (busy || !requireTerms()) return
    const startUrl = eventsAPI.identityStartUrl(event.id, provider)

    if (provider === 'google' && inApp) {
      const escapeUrl = externalBrowserUrl(startUrl, inApp)
      setCopied(false)
      setShowCopyFallback(false)
      if (!escapeUrl) {
        setEscape('instructions')
        return
      }
      // Sin await antes: la app solo acepta el enlace como gesto del usuario.
      setEscape('opening')
      watchEscape()
      openInExternalBrowser(escapeUrl)
      return
    }

    setPendingProvider(provider)
    window.location.assign(startUrl)
  }

  const handleEmail = () => {
    if (busy || !requireTerms()) return
    onSelectEmail()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(accessLink())
      setCopied(true)
    } catch {
      setShowCopyFallback(true)
    }
  }

  const providerNames = activeProviders.map((p) => IDENTITY_PROVIDER_CARDS[p].name)
  const otherMethodNames = [
    ...activeProviders.filter((p) => p !== 'google').map((p) => IDENTITY_PROVIDER_CARDS[p].name),
    'un código por email',
  ]
  const appInfo = inApp ? (IN_APP_BROWSER_APPS[inApp.app] || IN_APP_BROWSER_APPS['android-webview']) : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{COPY.methodsIntro}</p>

      <div className="space-y-3">
        {loadingProviders && (
          <div className="flex h-11 items-center justify-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            {COPY.loadingMethods}
          </div>
        )}

        {activeProviders.map((provider) => {
          const card = IDENTITY_PROVIDER_CARDS[provider]
          const label = pendingProvider === provider
            ? COPY.redirecting
            : provider === 'google' && escape === 'opening'
              ? IN_APP_BROWSER_COPY.openingBrowser
              : card.label
          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleProvider(provider)}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-md border bg-white px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
              style={{ borderColor: card.borderColor, color: card.textColor }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.logo} alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5" />
              <span>{label}</span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={handleEmail}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-md bg-white px-3 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-60"
        >
          <EnvelopeIcon className="h-5 w-5" aria-hidden="true" />
          <span>{COPY.emailCard}</span>
        </button>
      </div>

      {escape === 'left' && (
        <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">{IN_APP_BROWSER_COPY.continueInBrowser}</p>
      )}

      {escape === 'instructions' && appInfo && (
        <div className="space-y-2 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          <p>
            {IN_APP_BROWSER_COPY.googleBlocked(appInfo.name)} {appInfo.steps} {IN_APP_BROWSER_COPY.thenRetry}
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {copied ? IN_APP_BROWSER_COPY.linkCopied : IN_APP_BROWSER_COPY.copyLink}
          </button>
          {showCopyFallback && (
            <div>
              <p className="text-xs text-gray-600">{IN_APP_BROWSER_COPY.copyFallback}</p>
              <input
                type="text"
                readOnly
                autoFocus
                value={accessLink()}
                onFocus={(e) => e.target.select()}
                className="mt-1 block w-full rounded-md border-0 px-2 py-1.5 text-xs text-gray-900 ring-1 ring-inset ring-gray-300"
              />
            </div>
          )}
          <p>{IN_APP_BROWSER_COPY.otherMethods(otherMethodNames.join(' o '))}</p>
        </div>
      )}

      {activeProviders.length > 0 && (
        <p className="text-xs text-gray-500">
          {COPY.providersInfo(providerNames.join(' o '))}
          {activeProviders.includes('microsoft') && <> {COPY.microsoftPersonalOnly}</>}
        </p>
      )}

      <div className="flex items-start gap-x-2">
        <input
          type="checkbox"
          id="termsAccepted"
          checked={termsAccepted}
          onChange={(e) => onTermsAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        <label htmlFor="termsAccepted" className="text-sm text-gray-600">
          Acepto las{' '}
          <a
            href="/legal/normas-eventos"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-900 underline hover:text-gray-700"
          >
            normas y términos para la participación en eventos en directo
          </a>{' '}
          y la{' '}
          <a
            href="/legal/politica-de-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-900 underline hover:text-gray-700"
          >
            política de privacidad
          </a>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
