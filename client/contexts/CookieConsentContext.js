'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  loadConsent,
  saveConsent,
  CONSENT_ACCEPTED,
  CONSENT_NECESSARY,
} from '@/lib/cookieConsent'

const CookieConsentContext = createContext()

/**
 * Estado del consentimiento de cookies.
 *
 * `consent` tiene TRES valores y la diferencia entre dos de ellos es la que
 * evita el fallo clásico de estos banners:
 *
 *   undefined → todavía no se ha leído localStorage (primer render, SSR)
 *   null      → leído, y el visitante no ha decidido
 *   'accepted' | 'necessary' → decisión tomada
 *
 * Sin el `undefined` habría que inicializar el estado a `null`, y entonces el
 * banner parpadearía en cada carga para quien ya decidió. Leerlo en el
 * inicializador de `useState` tampoco vale: `localStorage` no existe en el
 * servidor y el HTML renderizado no coincidiría con el del cliente.
 *
 * `adsAllowed` es lo único que deben consultar los consumidores (el píxel de
 * Meta). Es estrictamente `consent === 'accepted'`, así que ni el estado sin
 * leer ni la falta de decisión activan nada.
 */
export function CookieConsentProvider({ children }) {
  const [consent, setConsent] = useState(undefined)
  // Permite reabrir el banner desde el pie de página para cambiar de opinión.
  // Revocar el consentimiento tiene que ser tan fácil como darlo.
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  useEffect(() => {
    setConsent(loadConsent())
  }, [])

  const decide = useCallback((value) => {
    saveConsent(value)
    setConsent(value)
    setPreferencesOpen(false)
  }, [])

  const acceptAll = useCallback(() => decide(CONSENT_ACCEPTED), [decide])
  const acceptNecessaryOnly = useCallback(() => decide(CONSENT_NECESSARY), [decide])
  const openPreferences = useCallback(() => setPreferencesOpen(true), [])

  const value = useMemo(() => ({
    consent,
    // El banner se muestra cuando ya se leyó el almacenamiento y no hay
    // decisión, o cuando el visitante pide cambiarla desde el pie.
    bannerVisible: (consent === null) || preferencesOpen,
    adsAllowed: consent === CONSENT_ACCEPTED,
    acceptAll,
    acceptNecessaryOnly,
    openPreferences,
  }), [consent, preferencesOpen, acceptAll, acceptNecessaryOnly, openPreferences])

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  )
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider')
  }
  return context
}
