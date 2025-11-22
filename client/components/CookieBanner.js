'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cookie_consent'
// Roughly one month in milliseconds
const CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000

function loadConsent() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const { value, expiresAt } = parsed

    // If we have an expiry and it is in the past, clear and treat as not set
    if (typeof expiresAt === 'number' && Date.now() > expiresAt) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return value || null
  } catch (e) {
    // If localStorage or JSON parsing fails, behave as if no consent was stored
    return null
  }
}

function saveConsent(value) {
  if (typeof window === 'undefined') return

  try {
    const payload = {
      value,
      expiresAt: Date.now() + CONSENT_TTL_MS,
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    // Ignore storage errors; we still hide the banner for this session
  }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = loadConsent()
    if (consent === 'accepted') {
      setVisible(false)
    } else {
      // If there is no stored consent or it is expired/invalid, show the banner
      setVisible(true)
    }
  }, [])

  const handleAccept = () => {
    // Persist consent for approximately one month so it survives
    // browser/tab closes, but will eventually expire.
    saveConsent('accepted')
    setVisible(false)
  }

  const handleReject = () => {
    // Do not persist anything; banner will reappear on reload as requested
    setVisible(false)
  }

  if (!visible) return null

  // Markup and Tailwind classes copied exactly from the provided snippet
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 px-6 pb-6">
      <div className="pointer-events-auto max-w-xl border border-gray-300 rounded-xl bg-white p-6 shadow-lg outline-1 outline-gray-900/10">
        <p className="text-sm/6 text-gray-900">
            Usamos cookies propias y de terceros para mejorar tu experiencia de navegación, analizar tu uso del sitio web y mostrarte publicidad relevante.
            Puedes aceptar todas las cookies, rechazarlas o configurar tus preferencias. Más información en nuestra {' '}
          <a href="#" className="font-semibold text-black hover:text-indigo-800">
            Política de Cookies
          </a>
          .
        </p>
        <div className="mt-4 flex items-center gap-x-5">
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="text-sm/6 font-semibold text-gray-900 hover:text-gray-700"
          >
            Rechazar todas
          </button>
        </div>
      </div>
    </div>
  )
}
